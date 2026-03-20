-- Fleet KM Logger — PostgreSQL schema (Neon)

CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  phone            TEXT UNIQUE NOT NULL,       -- Login identifier (Israeli format: 05X-XXXXXXX)
  id_number_hash   TEXT NOT NULL,              -- bcrypt hash of national ID — never store raw
  role             TEXT NOT NULL CHECK(role IN ('driver', 'admin')),
  active           BOOLEAN DEFAULT TRUE,
  added_by         INTEGER REFERENCES users(id),
  added_at         TIMESTAMPTZ DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cars (
  id          SERIAL PRIMARY KEY,
  plate       TEXT UNIQUE NOT NULL,            -- Israeli license plate e.g. 12-345-67
  make        TEXT NOT NULL,
  model       TEXT NOT NULL,
  year        INTEGER,
  current_km  INTEGER DEFAULT 0,              -- Updated after each trip ends
  active      BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS trips (
  id                    SERIAL PRIMARY KEY,
  car_id                INTEGER NOT NULL REFERENCES cars(id),
  driver_id             INTEGER NOT NULL REFERENCES users(id),

  -- Start (no photo — confirmed from previous trip's end KM)
  start_km_confirmed    INTEGER NOT NULL,
  start_time            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- End
  end_km_ocr            INTEGER,              -- Raw value from Claude Vision
  end_km_confirmed      INTEGER,              -- Confirmed by driver (may differ from OCR)
  end_photo             BYTEA,               -- Cropped JPEG stored directly in Neon
  end_time              TIMESTAMPTZ,

  -- Trip details
  reason                TEXT NOT NULL,
  notes                 TEXT,

  -- Validation flags
  discrepancy_flag      BOOLEAN DEFAULT FALSE, -- Start KM mismatches previous trip's end KM
  discrepancy_delta     INTEGER,
  speed_flag            BOOLEAN DEFAULT FALSE, -- Avg speed exceeded SPEED_WARN_KMH
  avg_speed_kmh         INTEGER,

  -- Photo retention (null the bytea after 1 year)
  photo_expires_at      TIMESTAMPTZ,

  status                TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed')),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id           SERIAL PRIMARY KEY,
  phone        TEXT NOT NULL,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  success      BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_phone ON login_attempts(phone, attempted_at);
CREATE INDEX IF NOT EXISTS idx_trips_car_id        ON trips(car_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id     ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status        ON trips(status);
