# Artist Booking API

REST API for booking artists. Clients request an artist for an event, artists confirm and progress the booking, and anyone can read an artist's reviews.

Built with TypeScript and Express 5. MySQL holds users, bookings and payments; MongoDB holds artist profiles and reviews.

## Requirements

- Node.js 24 or later
- MySQL 8.4 or later
- MongoDB 7.0 or later

Both databases need to be running locally. The app creates its own databases and tables, so the MySQL user needs permission to create databases.

## Running it locally

```bash
git clone https://github.com/runil-khakhar/artist-booking-api.git
cd artist-booking-api
npm install
cp .env.example .env    # set MYSQL_PASSWORD, and anything else that differs on your machine
npm run db:seed         # creates both databases, the tables and indexes, and loads demo data
npm start               # http://localhost:3000
```

On Windows `cmd`, use `copy .env.example .env`.

`npm start` compiles the TypeScript and runs the schema setup before starting. The setup is idempotent, so the server also starts on empty databases if you skip the seed. If MySQL or MongoDB can't be reached, startup says which one and where instead of printing a stack trace.

Other scripts: `npm run dev` (watch mode from source), `npm run db:setup` (schema only), `npm test`, `npm run typecheck`, `npm run lint`, `npm run format`.

## Demo data

`npm run db:seed` resets the demo data and creates these accounts:

| id  | Email             | Role   |
| --- | ----------------- | ------ |
| 1   | alice@example.com | client |
| 2   | ben@example.com   | client |
| 3   | maya@example.com  | artist |
| 4   | leo@example.com   | artist |
| 5   | nina@example.com  | artist |

All accounts use `SEED_USER_PASSWORD` from `.env`, which needs at least 8 characters. If it's empty, the seed generates a password and prints it.

The seed covers the main rules. Maya has six completed bookings with reviews, a cancelled booking whose review is excluded, a confirmed booking in ten days and a pending request that overlaps it (confirming it returns 409). Leo has a booking in progress. Nina has no reviews yet.

## API

Every response, including errors, has the same shape:

```json
{ "success": true, "data": { }, "error": null }
{ "success": false, "data": null, "error": "event_start must be in the future" }
```

| Method | Path                 | Who                            | What it does                                                                                                   |
| ------ | -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| POST   | /auth/login          | anyone                         | Returns a JWT (HS256, 1 hour) carrying `sub` (the user id), `role` and `iat`                                   |
| POST   | /bookings            | client                         | Requests a booking. Starts as `pending`.                                                                       |
| PATCH  | /bookings/:id/status | the booking's artist or client | Moves a booking through its states                                                                             |
| GET    | /artists/:id/reviews | anyone                         | The artist's profile and reviews from completed bookings, with a summary, paginated (`page`, `limit` up to 50) |
| GET    | /health              | anyone                         | Checks both databases                                                                                          |

Example requests with the seeded data (bash):

```bash
# log in as a client and keep the token
TOKEN=$(curl -s localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"<seed password>"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

# request a booking with Maya (artist 3)
curl -s localhost:3000/bookings -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"artist_id":3,"event_start":"2027-06-12T18:00:00Z","event_end":"2027-06-12T22:00:00Z","notes":"Wedding reception"}'

# cancel it (a client can only cancel)
curl -s -X PATCH localhost:3000/bookings/<id>/status -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"cancelled"}'

# read Maya's reviews
curl -s 'localhost:3000/artists/3/reviews?page=1&limit=5'
```

Status codes: 400 for malformed input, 401 for missing or bad credentials, 403 for the wrong role or someone else's booking, 404 when the booking or artist in the URL doesn't exist, 409 for a schedule clash, 422 for business-rule failures (start time in the past, an `artist_id` that isn't an artist, a transition the state machine doesn't allow), and 429 when login is rate limited.

## Tests

```bash
npm test
```

Tests use separate `artist_booking_test` databases, created automatically, so they never touch the demo data. `tests/integration/booking-status.test.ts` starts with the required case: an invalid status transition returns 422 with a message and leaves the booking unchanged. The suite also covers the other endpoints, every status transition for both roles, and two overlapping confirmations racing each other. Unit tests run without databases: `npx jest --selectProjects unit`.

`database/task3-check.sql` runs the TASK3.md leaderboard query, pre-checks and fixes against a throwaway `task3_check` database, which it drops and recreates: `mysql -u root -p < database/task3-check.sql`.

## Project structure

```
src/
  modules/        one folder per business area: auth, bookings, artists, users, health
  middleware/     authentication, role checks, the 404 and error handlers
  db/             MySQL pool and transactions, MongoDB connection, schema setup
  shared/         HttpError, the response helpers, shared zod schemas
  types/          the typed req.user that authentication adds
  scripts/        db-setup and seed
  config.ts       environment variables, validated with zod at startup
database/         schema.sql and the TASK3 check script
tests/            integration tests (Supertest against real databases) and unit tests
```

Inside a module, each file has one job: `*.routes.ts` wires URLs to controllers, controllers parse the request with zod and shape the response, services hold the business rules and transactions, and repositories, models and `src/db` are the only code that talks to a database. Services never see `req` or `res`.

## Decisions and trade-offs

**Double-booking.** Overlaps are checked when a booking is created and again when it is confirmed, because two pending requests for the same slot could otherwise both be confirmed. Each of those writes first locks the artist's row (`SELECT ... FOR UPDATE`) and runs at READ COMMITTED, so the overlap query sees the latest committed bookings and requests for the same artist run one at a time. MySQL has no exclusion constraint for time ranges, and this is the simplest correct option. Bookings for different artists never wait on each other. A test fires two overlapping confirmations at once and expects one 200 and one 409.

**What counts as an overlap.** Confirmed and in-progress bookings block a slot. Intervals are half-open, so a booking ending at 20:00 doesn't clash with one starting at 20:00.

**Status changes.** Allowed transitions, and the roles that may make them, live in one table in `booking-status.ts`. A transition the state machine doesn't allow returns 422 with the allowed next statuses. A transition that exists but isn't open to the caller, such as a client confirming, returns 403, so permission errors and invalid transitions stay distinct. Only the artist can mark a booking in progress or completed; the client can only cancel. Every change made through the API is recorded in `booking_status_history` with who made it.

**No time checks on transitions.** Confirming after the start time, or starting a booking early, isn't blocked. Bookings can only be created in the future, so enforcing this would make the flow impossible to try by hand. With an injectable clock it's a small addition.

**Reviews across two databases.** Booking status lives in MySQL and reviews in MongoDB, so the endpoint fetches the artist's completed booking ids from MySQL and filters reviews by them. For artists with long histories I'd store the booking status on the review when it's written; `completed` is final, so that copy can't go stale.

**Averages.** The average is calculated from integer counts, rounded half up to two decimal places and returned as a JSON number (so `4.5`, not `"4.50"`). Rounding half up means 4.125 becomes 4.13, where MongoDB's `$round` would give 4.12. An artist with no reviews gets `null`, not 0.

**Auth.** HS256 JWTs, pinned to that algorithm on verify, valid for one hour, carrying `sub`, `role` and `iat`. Unknown emails and wrong passwords get the same 401, and bcrypt runs in both cases so response time doesn't reveal which emails exist. Login allows 20 failed attempts per 15 minutes per IP; successful logins don't count.

**Times.** Requests send ISO 8601 times with a zone (`2026-12-12T18:00:00Z` or `+05:30`), and everything is stored and returned in UTC. A booking can start at most two years ahead and last at most seven days, which stops one booking from blocking an artist indefinitely and keeps dates within MySQL's `DATETIME` range. Both limits are in `booking.constants.ts`.

**Schema setup on start.** `npm start` runs `CREATE ... IF NOT EXISTS` first, so a fresh clone starts without a separate step. In production this would be a migration step in the deploy.

**Plain SQL and TypeScript.** No ORM: there are only a few queries and they're worth seeing directly. TypeScript runs in strict mode without decorators or a DI container, and zod schemas provide both request validation and types.

**Payments.** The `payments` table is in the schema, but no endpoint uses it yet.

**Leaderboard.** `GET /artists/leaderboard` is answered as SQL in TASK3.md, against the relational schema from that task. It isn't an endpoint here because reviews live in MongoDB, so it would need a different query.

## What I'd do next

- Retry transactions on deadlock or lock timeout, and accept an `Idempotency-Key` on `POST /bookings`. A lock timeout under load currently comes back as a 500, and a client that retries after a timeout can create the same booking twice.
- Refresh tokens and token revocation. Today a leaked token stays valid until it expires, up to an hour later.
- Time checks on status transitions, with an injectable clock so they stay testable. Right now a booking can be confirmed after its start time.
- Cursor pagination for reviews. Skip-and-limit slows down on deep pages and can show the same review twice when new ones arrive between page requests.
- Structured logging with request ids, and metrics on booking conflicts. Errors only reach the console with nothing tying them to a request, and conflict metrics would help identify artists receiving competing booking requests.
- Store the booking status on reviews, as described above, so the reviews endpoint no longer needs the list of completed bookings from MySQL.
