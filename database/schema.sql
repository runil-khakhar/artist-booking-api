-- Idempotent: safe to run on every start.
-- Times are stored as UTC in DATETIME columns.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash CHAR(60)     NOT NULL,
  role          ENUM('artist', 'client') NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS bookings (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  artist_id   INT UNSIGNED NOT NULL,
  client_id   INT UNSIGNED NOT NULL,
  status      ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')
                NOT NULL DEFAULT 'pending',
  event_start DATETIME NOT NULL,
  event_end   DATETIME NOT NULL,
  notes       VARCHAR(1000) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Serves the overlap check (artist + status + time) and the completed-bookings lookup.
  KEY idx_bookings_artist_status_start (artist_id, status, event_start),
  KEY idx_bookings_client_created (client_id, created_at),
  CONSTRAINT fk_bookings_artist FOREIGN KEY (artist_id) REFERENCES users (id),
  CONSTRAINT fk_bookings_client FOREIGN KEY (client_id) REFERENCES users (id),
  CONSTRAINT chk_bookings_window CHECK (event_end > event_start)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS booking_status_history (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id  INT UNSIGNED NOT NULL,
  from_status ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled') NULL,
  to_status   ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled') NOT NULL,
  changed_by  INT UNSIGNED NOT NULL,
  changed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_history_booking (booking_id, changed_at),
  CONSTRAINT fk_history_booking FOREIGN KEY (booking_id) REFERENCES bookings (id),
  CONSTRAINT fk_history_user FOREIGN KEY (changed_by) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- Not used by any endpoint yet.
CREATE TABLE IF NOT EXISTS payments (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id   INT UNSIGNED NOT NULL,
  amount       DECIMAL(10, 2) NOT NULL,
  currency     CHAR(3) NOT NULL DEFAULT 'USD',
  status       ENUM('pending', 'succeeded', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  provider_ref VARCHAR(100) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_provider_ref (provider_ref),
  KEY idx_payments_booking (booking_id),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings (id),
  CONSTRAINT chk_payments_amount CHECK (amount >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
