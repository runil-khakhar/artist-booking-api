-- Runs the TASK3.md leaderboard query, pre-checks and fixes on a throwaway database.
--
--   mysql -u root -p < database/task3-check.sql
--
-- It (re)creates a database called task3_check, builds the schema exactly as given in the brief,
-- loads a small data set, runs the pre-checks and the five fixes in the order TASK3.md presents
-- them, and finishes with the leaderboard query. Drop task3_check when you're done with it.

DROP DATABASE IF EXISTS task3_check;
CREATE DATABASE task3_check;
USE task3_check;

-- The schema as given

CREATE TABLE artists (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255),
  category VARCHAR(255),
  hourly_rate FLOAT,
  created_at DATETIME
);

CREATE TABLE bookings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  artist_id INT,
  client_id INT,
  status VARCHAR(50),
  amount FLOAT,
  event_start DATETIME,
  event_end DATETIME,
  created_at DATETIME
);

CREATE TABLE reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT,
  artist_id INT,
  score INT,
  comment TEXT,
  created_at DATETIME
);

-- Data, chosen so each leaderboard rule changes the result if it's broken:
--   Asha and Ben both average 4.50; Asha has more completed bookings, so she ranks first.
--   Cara has only 4 reviews inside the 90-day window (the 5th is 120 days old): excluded.
--   Dev's 1-star review belongs to a cancelled booking: excluded, so Dev averages 3.80.
--   Esha's 5th review is 91 days old, which leaves her with 4 in the window: excluded.
-- Expected leaderboard:
--   Asha Rao   DJ          4.50  6 reviews  8 completed bookings
--   Ben Kumar  Live Band   4.50  6 reviews  6 completed bookings
--   Dev Mehta  Comedian    3.80  5 reviews  5 completed bookings

SET @now = UTC_TIMESTAMP();

INSERT INTO artists (id, name, category, hourly_rate, created_at) VALUES
  (1, 'Asha Rao', 'DJ', 150, @now),
  (2, 'Ben Kumar', 'Live Band', 400, @now),
  (3, 'Cara Dsouza', 'Photographer', 120, @now),
  (4, 'Dev Mehta', 'Comedian', 250, @now),
  (5, 'Esha Iyer', 'Singer', 300, @now);

INSERT INTO bookings (id, artist_id, client_id, status, amount, event_start, event_end, created_at) VALUES
  (1, 1, 1, 'completed', 600, @now - INTERVAL 12 DAY, @now - INTERVAL 12 DAY + INTERVAL 4 HOUR, @now),
  (2, 1, 2, 'completed', 600, @now - INTERVAL 20 DAY, @now - INTERVAL 20 DAY + INTERVAL 4 HOUR, @now),
  (3, 1, 3, 'completed', 450, @now - INTERVAL 30 DAY, @now - INTERVAL 30 DAY + INTERVAL 3 HOUR, @now),
  (4, 1, 1, 'completed', 450, @now - INTERVAL 40 DAY, @now - INTERVAL 40 DAY + INTERVAL 3 HOUR, @now),
  (5, 1, 2, 'completed', 750, @now - INTERVAL 50 DAY, @now - INTERVAL 50 DAY + INTERVAL 5 HOUR, @now),
  (6, 1, 3, 'completed', 600, @now - INTERVAL 60 DAY, @now - INTERVAL 60 DAY + INTERVAL 4 HOUR, @now),
  (7, 1, 1, 'completed', 600, @now - INTERVAL 70 DAY, @now - INTERVAL 70 DAY + INTERVAL 4 HOUR, @now),
  (8, 1, 2, 'completed', 600, @now - INTERVAL 200 DAY, @now - INTERVAL 200 DAY + INTERVAL 4 HOUR, @now),
  (9, 1, 3, 'cancelled', 600, @now - INTERVAL 15 DAY, @now - INTERVAL 15 DAY + INTERVAL 4 HOUR, @now),
  (10, 2, 1, 'completed', 1200, @now - INTERVAL 10 DAY, @now - INTERVAL 10 DAY + INTERVAL 3 HOUR, @now),
  (11, 2, 2, 'completed', 1200, @now - INTERVAL 22 DAY, @now - INTERVAL 22 DAY + INTERVAL 3 HOUR, @now),
  (12, 2, 3, 'completed', 800, @now - INTERVAL 33 DAY, @now - INTERVAL 33 DAY + INTERVAL 2 HOUR, @now),
  (13, 2, 1, 'completed', 800, @now - INTERVAL 44 DAY, @now - INTERVAL 44 DAY + INTERVAL 2 HOUR, @now),
  (14, 2, 2, 'completed', 1200, @now - INTERVAL 55 DAY, @now - INTERVAL 55 DAY + INTERVAL 3 HOUR, @now),
  (15, 2, 3, 'completed', 1200, @now - INTERVAL 66 DAY, @now - INTERVAL 66 DAY + INTERVAL 3 HOUR, @now),
  (16, 3, 1, 'completed', 720, @now - INTERVAL 11 DAY, @now - INTERVAL 11 DAY + INTERVAL 6 HOUR, @now),
  (17, 3, 2, 'completed', 720, @now - INTERVAL 21 DAY, @now - INTERVAL 21 DAY + INTERVAL 6 HOUR, @now),
  (18, 3, 3, 'completed', 720, @now - INTERVAL 31 DAY, @now - INTERVAL 31 DAY + INTERVAL 6 HOUR, @now),
  (19, 3, 1, 'completed', 720, @now - INTERVAL 41 DAY, @now - INTERVAL 41 DAY + INTERVAL 6 HOUR, @now),
  (20, 3, 2, 'completed', 720, @now - INTERVAL 125 DAY, @now - INTERVAL 125 DAY + INTERVAL 6 HOUR, @now),
  (21, 4, 1, 'completed', 500, @now - INTERVAL 13 DAY, @now - INTERVAL 13 DAY + INTERVAL 2 HOUR, @now),
  (22, 4, 2, 'completed', 500, @now - INTERVAL 23 DAY, @now - INTERVAL 23 DAY + INTERVAL 2 HOUR, @now),
  (23, 4, 3, 'completed', 500, @now - INTERVAL 34 DAY, @now - INTERVAL 34 DAY + INTERVAL 2 HOUR, @now),
  (24, 4, 1, 'completed', 500, @now - INTERVAL 45 DAY, @now - INTERVAL 45 DAY + INTERVAL 2 HOUR, @now),
  (25, 4, 2, 'completed', 500, @now - INTERVAL 56 DAY, @now - INTERVAL 56 DAY + INTERVAL 2 HOUR, @now),
  (26, 4, 3, 'cancelled', 500, @now - INTERVAL 16 DAY, @now - INTERVAL 16 DAY + INTERVAL 2 HOUR, @now),
  (27, 5, 1, 'completed', 900, @now - INTERVAL 14 DAY, @now - INTERVAL 14 DAY + INTERVAL 3 HOUR, @now),
  (28, 5, 2, 'completed', 900, @now - INTERVAL 24 DAY, @now - INTERVAL 24 DAY + INTERVAL 3 HOUR, @now),
  (29, 5, 3, 'completed', 900, @now - INTERVAL 35 DAY, @now - INTERVAL 35 DAY + INTERVAL 3 HOUR, @now),
  (30, 5, 1, 'completed', 900, @now - INTERVAL 46 DAY, @now - INTERVAL 46 DAY + INTERVAL 3 HOUR, @now),
  (31, 5, 2, 'completed', 900, @now - INTERVAL 95 DAY, @now - INTERVAL 95 DAY + INTERVAL 3 HOUR, @now);

INSERT INTO reviews (booking_id, artist_id, score, comment, created_at) VALUES
  (1, 1, 5, 'Great', @now - INTERVAL 11 DAY),
  (2, 1, 5, 'Great', @now - INTERVAL 19 DAY),
  (3, 1, 4, 'Good', @now - INTERVAL 29 DAY),
  (4, 1, 4, 'Good', @now - INTERVAL 39 DAY),
  (5, 1, 5, 'Great', @now - INTERVAL 49 DAY),
  (6, 1, 4, 'Good', @now - INTERVAL 59 DAY),
  (10, 2, 5, 'Great', @now - INTERVAL 9 DAY),
  (11, 2, 4, 'Good', @now - INTERVAL 21 DAY),
  (12, 2, 5, 'Great', @now - INTERVAL 32 DAY),
  (13, 2, 4, 'Good', @now - INTERVAL 43 DAY),
  (14, 2, 5, 'Great', @now - INTERVAL 54 DAY),
  (15, 2, 4, 'Good', @now - INTERVAL 65 DAY),
  (16, 3, 5, 'Great', @now - INTERVAL 10 DAY),
  (17, 3, 5, 'Great', @now - INTERVAL 20 DAY),
  (18, 3, 5, 'Great', @now - INTERVAL 30 DAY),
  (19, 3, 5, 'Great', @now - INTERVAL 40 DAY),
  (20, 3, 5, 'Great', @now - INTERVAL 120 DAY),
  (21, 4, 4, 'Good', @now - INTERVAL 12 DAY),
  (22, 4, 4, 'Good', @now - INTERVAL 22 DAY),
  (23, 4, 4, 'Good', @now - INTERVAL 33 DAY),
  (24, 4, 3, 'Fine', @now - INTERVAL 44 DAY),
  (25, 4, 4, 'Good', @now - INTERVAL 55 DAY),
  (26, 4, 1, 'Cancelled on us', @now - INTERVAL 15 DAY),
  (27, 5, 5, 'Great', @now - INTERVAL 13 DAY),
  (28, 5, 5, 'Great', @now - INTERVAL 23 DAY),
  (29, 5, 5, 'Great', @now - INTERVAL 34 DAY),
  (30, 5, 5, 'Great', @now - INTERVAL 45 DAY),
  (31, 5, 5, 'Great', @now - INTERVAL 91 DAY);

-- Pre-checks from "Rolling this out on a live database" (none of them finds a problem in this data)

SELECT status, COUNT(*) FROM bookings GROUP BY status;
SELECT COUNT(*) AS null_rates FROM artists WHERE hourly_rate IS NULL;
SELECT COUNT(*) AS null_booking_fields FROM bookings
 WHERE amount IS NULL OR artist_id IS NULL OR client_id IS NULL OR status IS NULL;
SELECT COUNT(*) AS null_review_fields FROM reviews
 WHERE booking_id IS NULL OR artist_id IS NULL OR score IS NULL;
SELECT id FROM artists  WHERE hourly_rate < 0 OR hourly_rate >= 100000000;
SELECT id FROM bookings WHERE amount < 0 OR amount >= 100000000;
SELECT id FROM reviews  WHERE score NOT BETWEEN 1 AND 5;
SELECT b.id FROM bookings b LEFT JOIN artists  a ON a.id = b.artist_id  WHERE a.id IS NULL;
SELECT r.id FROM reviews  r LEFT JOIN bookings b ON b.id = r.booking_id WHERE b.id IS NULL;
SELECT r.id FROM reviews r JOIN bookings b ON b.id = r.booking_id WHERE r.artist_id <> b.artist_id;
SELECT booking_id FROM reviews GROUP BY booking_id HAVING COUNT(*) > 1;

-- Issue 1: money stored as FLOAT

ALTER TABLE artists
    MODIFY hourly_rate DECIMAL(10, 2) NOT NULL,
    ADD CONSTRAINT chk_artists_hourly_rate CHECK (hourly_rate >= 0);

ALTER TABLE bookings
    MODIFY amount DECIMAL(10, 2) NOT NULL,
    ADD CONSTRAINT chk_bookings_amount CHECK (amount >= 0);

-- Issue 2: no referential integrity

CREATE TABLE clients (
    id         INT PRIMARY KEY AUTO_INCREMENT,
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_clients_email (email)
);

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

-- Issue 3: status is free text

ALTER TABLE bookings
    MODIFY status ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')
           NOT NULL DEFAULT 'pending';

-- Issue 4: no indexes beyond the primary keys

ALTER TABLE bookings
    ADD INDEX idx_bookings_artist_status_start (artist_id, status, event_start),
    ADD INDEX idx_bookings_client_created (client_id, created_at);

ALTER TABLE reviews
    ADD INDEX idx_reviews_artist_created (artist_id, created_at),
    ADD INDEX idx_reviews_created_artist (created_at, artist_id, score, booking_id);

-- Issue 5: reviews have no integrity rules

ALTER TABLE reviews
    MODIFY score TINYINT UNSIGNED NOT NULL,
    ADD CONSTRAINT chk_reviews_score CHECK (score BETWEEN 1 AND 5),
    ADD CONSTRAINT uq_reviews_booking UNIQUE (booking_id);

ALTER TABLE bookings
    ADD UNIQUE KEY uq_bookings_id_artist (id, artist_id);

ALTER TABLE reviews
    DROP FOREIGN KEY fk_reviews_booking;

ALTER TABLE reviews
    MODIFY artist_id INT NOT NULL,
    ADD CONSTRAINT fk_reviews_booking_artist
        FOREIGN KEY (booking_id, artist_id) REFERENCES bookings (id, artist_id);

-- Task A: the leaderboard

WITH recent_scores AS (
    SELECT r.artist_id,
           AVG(r.score) AS avg_score,
           COUNT(*)     AS review_count
      FROM reviews AS r
      JOIN bookings AS b
        ON b.id = r.booking_id
       AND b.artist_id = r.artist_id
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
