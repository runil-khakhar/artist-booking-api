# TASK 3: SQL and database

The leaderboard query, the pre-checks and the five fixes below are also in [`database/task3-check.sql`](database/task3-check.sql). It builds the schema exactly as given, loads a small data set, runs the pre-checks and the fixes in the order they appear here, and finishes with the leaderboard. I ran it on MySQL 8.4 and 9.7 (`mysql -u root -p < database/task3-check.sql`).

## Task A: Leaderboard query

This runs against the schema given in Task B. The column names are the same before and after my fixes, so it works on either.

A few things the brief leaves open, and how I read them:

- "Last 90 days" is measured on `reviews.created_at`, in UTC.
- Only reviews from completed bookings count. The reviews endpoint already applies that rule, and I didn't want the leaderboard and the artist page to disagree about an artist's score.
- "Total review count" is the count of those qualifying reviews: inside the window and from completed bookings. It's the same set the average and the "at least 5" rule use.
- "Total completed booking count" is all-time. It's a tiebreaker for experience, and I think a lifetime number reads better there. If the product wants it windowed too, it's one extra condition in the subquery (`AND cb.event_end >= UTC_TIMESTAMP() - INTERVAL 90 DAY`).
- Ties compare the rounded score, because that's what users see. After that it's completed bookings, then `id`, so the order is stable between requests.

```sql
WITH recent_scores AS (
    SELECT r.artist_id,
           AVG(r.score) AS avg_score,
           COUNT(*)     AS review_count
      FROM reviews AS r
      JOIN bookings AS b
        ON b.id = r.booking_id
       AND b.artist_id = r.artist_id   -- protects against mismatched rows in the unfixed schema
       AND b.status = 'completed'
     WHERE r.created_at >= UTC_TIMESTAMP() - INTERVAL 90 DAY
     GROUP BY r.artist_id
    HAVING COUNT(*) >= 5
)
SELECT a.name                 AS artist_name,
       a.category,
       ROUND(rs.avg_score, 2) AS average_score,
       rs.review_count        AS total_reviews,
       (SELECT COUNT(*)
          FROM bookings AS cb
         WHERE cb.artist_id = a.id
           AND cb.status = 'completed') AS completed_bookings
  FROM recent_scores AS rs
  JOIN artists AS a
    ON a.id = rs.artist_id
 ORDER BY average_score DESC,
          completed_bookings DESC,
          a.id
 LIMIT 10;
```

Some notes on the shape:

- I aggregate reviews first and join artists afterwards. The tempting version joins artists, reviews and bookings in one go and groups at the end. That repeats every review once per completed booking, which inflates the counts and quietly skews the averages.
- The reviews-to-bookings join is one-to-one (each review belongs to one booking), so it filters without multiplying rows.
- The completed count is a correlated subquery on purpose. It only runs for artists who already passed `HAVING COUNT(*) >= 5`, and each run is a cheap index count. Aggregating every completed booking in the table just to keep ten rows would be wasted work.
- `UTC_TIMESTAMP()` rather than `NOW()`, so the window doesn't shift with the connection's time zone.

### Indexes

```sql
CREATE INDEX idx_reviews_created_artist
    ON reviews (created_at, artist_id, score, booking_id);

CREATE INDEX idx_bookings_artist_status_start
    ON bookings (artist_id, status, event_start);
```

These are the same two indexes I add in Task B, issue 4, so they only need creating once.

**`reviews (created_at, artist_id, score, booking_id)`.** The only filter on reviews is a range on `created_at`, so it has to lead. MySQL then reads just the last 90 days of the index, however big the table gets. The other columns make it covering, so the table rows are never touched. I did consider leading with `artist_id`, since that's what we group by. But then the date range sits on the second column, and MySQL ends up walking every review ever written. That cost grows with the table, which is exactly the problem the question is about.

**`bookings (artist_id, status, event_start)`.** The completed count is `artist_id = ? AND status = 'completed'`: two equality columns, so it becomes an index-only count. The same index also serves the double-booking check in the API (`artist_id = ? AND status IN (...) AND event_start < ?`) and the completed-bookings lookup behind the reviews endpoint. I'd rather have one index doing three jobs than three narrow ones.

The join back to bookings uses the primary key, so nothing is needed there.

I checked the plan on MySQL 8.4 with about 160,000 reviews spread over two years. `EXPLAIN ANALYZE` shows a covering range scan on `idx_reviews_created_artist` that reads only the roughly 20,000 rows from the last 90 days, one primary-key lookup into bookings per row, and an index-only count on `idx_bookings_artist_status_start` for each qualifying artist. The whole query took about 100 ms. On a tiny table the optimizer starts from bookings instead, which is normal, so the plan is only worth judging on realistic volumes.

### At tens of millions of rows

At that size I'd stop computing this per request. It's a ranking, so a result a few minutes old is acceptable.

1. Keep a daily rollup, `artist_review_daily (day, artist_id, review_count, score_sum)`, updated whenever a review is written (in the same transaction, or from an outbox consumer). The 90-day average becomes `SUM(score_sum) / SUM(review_count)` over at most 90 small rows per artist instead of millions of raw reviews.
2. Keep `completed_bookings` as a counter on `artists`, bumped in the same transaction that marks a booking completed.
3. Have a scheduled job (every 5 to 15 minutes, against a read replica) write the top 10 into a snapshot table or a Redis key. The endpoint just reads that, with a short cache in front.

What I'm giving up: the leaderboard is a few minutes behind, writes do slightly more work, and there's one more job to monitor. For an endpoint that's read far more often than the underlying data changes, that's the right trade-off.

---

## Task B: Schema audit

For reference, the schema as given:

```sql
CREATE TABLE artists  (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255), category VARCHAR(255),
                       hourly_rate FLOAT, created_at DATETIME);
CREATE TABLE bookings (id INT PRIMARY KEY AUTO_INCREMENT, artist_id INT, client_id INT, status VARCHAR(50),
                       amount FLOAT, event_start DATETIME, event_end DATETIME, created_at DATETIME);
CREATE TABLE reviews  (id INT PRIMARY KEY AUTO_INCREMENT, booking_id INT, artist_id INT, score INT,
                       comment TEXT, created_at DATETIME);
```

### 1. Money stored as FLOAT

**What's wrong:** `artists.hourly_rate` and `bookings.amount` are `FLOAT`, an approximate binary type with roughly 7 significant digits. Most decimal amounts, even `0.10`, can't be stored exactly.

**Why it matters:** totals drift by fractions of a cent, a lookup like `WHERE amount = 149.99` can miss the row you just inserted, and payouts stop reconciling with the payment provider. With money, that's a correctness bug, not a style point.

**Fix:**

```sql
ALTER TABLE artists
    MODIFY hourly_rate DECIMAL(10, 2) NOT NULL,
    ADD CONSTRAINT chk_artists_hourly_rate CHECK (hourly_rate >= 0);

ALTER TABLE bookings
    MODIFY amount DECIMAL(10, 2) NOT NULL,
    ADD CONSTRAINT chk_bookings_amount CHECK (amount >= 0);
```

### 2. No referential integrity

**What's wrong:** `bookings.artist_id`, `bookings.client_id` and `reviews.booking_id` are plain integers with no foreign keys. There isn't even a clients (or users) table for `client_id` to point at.

**Why it matters:** the database will happily accept a booking for an artist that doesn't exist, or a review for a booking that never happened. Those orphans then drop out of inner joins without any error, so counts and averages (the leaderboard included) are silently wrong. Every piece of code that writes these tables has to re-implement the checks, and one of them eventually won't.

**Fix:** I leave `ON DELETE` at the default `RESTRICT`. Booking and payment history shouldn't vanish because someone deleted a parent row. Soft-deleting artists is the better tool there.

```sql
CREATE TABLE clients (
    id         INT PRIMARY KEY AUTO_INCREMENT,
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_clients_email (email)
);

-- Existing bookings need a parent row before the FK can be added.
-- Real names and emails would come from wherever client accounts live; placeholders here.
INSERT INTO clients (id, name, email)
SELECT DISTINCT b.client_id,
       CONCAT('Client ', b.client_id),
       CONCAT('client-', b.client_id, '@placeholder.invalid')
  FROM bookings AS b
 WHERE b.client_id IS NOT NULL;

ALTER TABLE bookings
    MODIFY artist_id INT NOT NULL,
    MODIFY client_id INT NOT NULL,
    ADD CONSTRAINT fk_bookings_artist FOREIGN KEY (artist_id) REFERENCES artists (id),
    ADD CONSTRAINT fk_bookings_client FOREIGN KEY (client_id) REFERENCES clients (id);

ALTER TABLE reviews
    MODIFY booking_id INT NOT NULL,
    ADD CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings (id);
```

`reviews.artist_id` gets a stronger constraint in issue 5.

A separate `clients` table matches the style of the given schema, where artists already have their own. In my API both sides log in, so I went with a single `users` table and a `role` column instead. Either is fine as far as the foreign keys are concerned.

### 3. Status is free text

**What's wrong:** `VARCHAR(50)` accepts `'confirmd'`, `'done'`, `''`, `NULL`, or `'confirmed '` with a trailing space, just as happily as `'confirmed'`. The trailing space matters because the default `utf8mb4_0900_ai_ci` collation doesn't ignore it.

**Why it matters:** the whole booking workflow depends on exact status values. One typo makes a booking invisible to `WHERE status = 'confirmed'`, so the double-booking check misses it and the leaderboard stops counting it, and nothing errors.

**Fix:**

```sql
ALTER TABLE bookings
    MODIFY status ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')
           NOT NULL DEFAULT 'pending';
```

I'd use an ENUM here because the set is small and stable, it takes one byte per row, and adding a value at the end later is an instant metadata change. If statuses ever became configurable, a lookup table with a foreign key would be the better fit.

### 4. No indexes beyond the primary keys

**What's wrong:** nothing indexes the columns every real query filters on: bookings by artist, status and time, bookings by client, and reviews by artist or by date.

**Why it matters:** the double-booking check, a client's booking history, the reviews page and the leaderboard all become full table scans, and they get slower in step with the data. It also hurts concurrency. In InnoDB, a `SELECT ... FOR UPDATE` on an unindexed condition locks every row it scans, not just the ones it returns.

**Fix:**

```sql
ALTER TABLE bookings
    ADD INDEX idx_bookings_artist_status_start (artist_id, status, event_start),
    ADD INDEX idx_bookings_client_created (client_id, created_at);

ALTER TABLE reviews
    ADD INDEX idx_reviews_artist_created (artist_id, created_at),
    ADD INDEX idx_reviews_created_artist (created_at, artist_id, score, booking_id);
```

The two bookings indexes also serve the foreign keys on `bookings` from issue 2, so MySQL doesn't need to create separate single-column indexes for them. That's why I'd run these before adding the keys. The key on `reviews.booking_id` gets its index from the unique key in issue 5.

### 5. Reviews have no integrity rules

**What's wrong:** three gaps in one table. `score INT` accepts 0, -3 or 4000. Nothing stops several reviews being written for one booking. And `reviews.artist_id` copies `bookings.artist_id` with nothing keeping the two in step.

**Why it matters:** a single out-of-range score drags an artist's average and leaderboard position. Multiple reviews per booking is an open door for review stuffing. A mismatched `artist_id` credits a review to the wrong artist, and anything that groups by `reviews.artist_id` (the leaderboard does) inherits the mistake.

**Fix:**

```sql
ALTER TABLE reviews
    MODIFY score TINYINT UNSIGNED NOT NULL,
    ADD CONSTRAINT chk_reviews_score CHECK (score BETWEEN 1 AND 5),
    ADD CONSTRAINT uq_reviews_booking UNIQUE (booking_id);

-- Tie each review's artist to its booking's artist with a composite foreign key.
ALTER TABLE bookings
    ADD UNIQUE KEY uq_bookings_id_artist (id, artist_id);

-- Two statements: MySQL won't drop and add a foreign key in one ALTER when it has to copy the table.
ALTER TABLE reviews
    DROP FOREIGN KEY fk_reviews_booking;

ALTER TABLE reviews
    MODIFY artist_id INT NOT NULL,
    ADD CONSTRAINT fk_reviews_booking_artist
        FOREIGN KEY (booking_id, artist_id) REFERENCES bookings (id, artist_id);
```

The composite key also guarantees the booking exists, which is why it replaces the single-column one from issue 2. The other option is to drop `reviews.artist_id` and always join through bookings. I kept the column because the leaderboard groups by it without needing that join.

### Smaller things I'd fix in the same pass

- Almost everything is nullable and nothing has a default. `name`, `category`, the event times and `created_at` should be `NOT NULL`, `created_at` should default to `CURRENT_TIMESTAMP`, and an `updated_at` column would help.
- Nothing stops `event_end` landing before `event_start`. A `CHECK (event_end > event_start)` handles that.
- `DATETIME` has no time zone. I'd store UTC and say so in the schema docs.
- `category` as free text drifts (`DJ`, `dj`, `D.J.`). A small categories table keeps filtering reliable.
- Signed `INT` ids give away half the range. `INT UNSIGNED` or `BIGINT` gives headroom.

### The schema I'd create from scratch

```sql
CREATE TABLE artists (
    id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name        VARCHAR(255)   NOT NULL,
    category    VARCHAR(100)   NOT NULL,
    hourly_rate DECIMAL(10, 2) NOT NULL,
    created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_artists_hourly_rate CHECK (hourly_rate >= 0)
);

CREATE TABLE clients (
    id         INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_clients_email (email)
);

CREATE TABLE bookings (
    id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    artist_id   INT UNSIGNED   NOT NULL,
    client_id   INT UNSIGNED   NOT NULL,
    status      ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')
                               NOT NULL DEFAULT 'pending',
    amount      DECIMAL(10, 2) NOT NULL,
    event_start DATETIME       NOT NULL,
    event_end   DATETIME       NOT NULL,
    created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bookings_id_artist (id, artist_id),
    KEY idx_bookings_artist_status_start (artist_id, status, event_start),
    KEY idx_bookings_client_created (client_id, created_at),
    CONSTRAINT fk_bookings_artist FOREIGN KEY (artist_id) REFERENCES artists (id),
    CONSTRAINT fk_bookings_client FOREIGN KEY (client_id) REFERENCES clients (id),
    CONSTRAINT chk_bookings_amount CHECK (amount >= 0),
    CONSTRAINT chk_bookings_window CHECK (event_end > event_start)
);

CREATE TABLE reviews (
    id         INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    booking_id INT UNSIGNED     NOT NULL,
    artist_id  INT UNSIGNED     NOT NULL,
    score      TINYINT UNSIGNED NOT NULL,
    comment    TEXT             NULL,
    created_at DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reviews_booking (booking_id),
    KEY idx_reviews_booking_artist (booking_id, artist_id),
    KEY idx_reviews_artist_created (artist_id, created_at),
    KEY idx_reviews_created_artist (created_at, artist_id, score, booking_id),
    CONSTRAINT fk_reviews_booking_artist
        FOREIGN KEY (booking_id, artist_id) REFERENCES bookings (id, artist_id),
    CONSTRAINT chk_reviews_score CHECK (score BETWEEN 1 AND 5)
);
```

### Rolling this out on a live database

I wouldn't run these ALTERs blind. In strict mode any bad row makes a statement fail half-way, so I'd look for problem rows first:

```sql
-- values the new ENUM would reject
SELECT status, COUNT(*) FROM bookings GROUP BY status;

-- NULLs that block NOT NULL
SELECT COUNT(*) FROM artists  WHERE hourly_rate IS NULL;
SELECT COUNT(*) FROM bookings WHERE amount IS NULL OR artist_id IS NULL OR client_id IS NULL OR status IS NULL;
SELECT COUNT(*) FROM reviews  WHERE booking_id IS NULL OR artist_id IS NULL OR score IS NULL;

-- values the new CHECKs or DECIMAL(10,2) would reject
SELECT id FROM artists  WHERE hourly_rate < 0 OR hourly_rate >= 100000000;
SELECT id FROM bookings WHERE amount < 0 OR amount >= 100000000;
SELECT id FROM reviews  WHERE score NOT BETWEEN 1 AND 5;

-- orphans that block the foreign keys
SELECT b.id FROM bookings b LEFT JOIN artists  a ON a.id = b.artist_id  WHERE a.id IS NULL;
SELECT r.id FROM reviews  r LEFT JOIN bookings b ON b.id = r.booking_id WHERE b.id IS NULL;

-- reviews whose artist disagrees with their booking (blocks the composite key)
SELECT r.id FROM reviews r JOIN bookings b ON b.id = r.booking_id WHERE r.artist_id <> b.artist_id;

-- duplicates that block UNIQUE (booking_id)
SELECT booking_id FROM reviews GROUP BY booking_id HAVING COUNT(*) > 1;
```

Then the order: clean the data, change types and NOT NULL, add the indexes, and add the foreign keys and CHECKs last.

That's a different order from the one the issues are listed in above. I grouped them by problem because that's easier to explain, but on a live table I'd regroup the same statements by kind, as described here. Running them exactly as listed still works (`database/task3-check.sql` does). MySQL creates single-column indexes for the foreign keys in issue 2, then quietly drops them once an index from issue 4 or 5 can serve the same key. On a large table that's a wasted index build, so it's worth avoiding.

On locking: adding an index runs online (`ALGORITHM=INPLACE, LOCK=NONE`). Changing a column's type (FLOAT to DECIMAL, VARCHAR to ENUM) rebuilds the table, so on a large table I'd run it through gh-ost or pt-online-schema-change. Adding a foreign key only avoids a table copy when `foreign_key_checks` is off, which is another reason to clear the orphans first.
