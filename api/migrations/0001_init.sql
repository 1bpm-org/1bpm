-- One row per (browser, session). No name, no email, no IP, no location.
CREATE TABLE commitments (
  id INTEGER PRIMARY KEY,
  client_id TEXT NOT NULL,
  session_start TEXT NOT NULL, -- ISO UTC of the bell, e.g. 2026-11-18T18:00:00.000Z
  created_at TEXT NOT NULL
);
CREATE INDEX commitments_session ON commitments (session_start);
CREATE UNIQUE INDEX commitments_client_session ON commitments (client_id, session_start);

-- Browser push subscriptions for people who turned reminders on. Not linked to commitments.
CREATE TABLE push (
  id INTEGER PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Write rate limit: a salted hash of the caller's address and the minute. Expires in minutes.
CREATE TABLE hits (
  bucket TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

-- Keys the worker makes for itself on first use (VAPID key pair, hash salt).
CREATE TABLE meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
