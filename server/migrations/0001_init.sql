-- =============================================================================
-- QuickCourt — core schema
-- Design goal: push business invariants into the database so the application
-- layer cannot create dirty data or double-book under concurrency.
-- =============================================================================

-- btree_gist lets us mix an equality column (court_id) with a range column
-- (time_range) inside one GiST exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role      AS ENUM ('user', 'owner', 'admin');
CREATE TYPE venue_status   AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE booking_status AS ENUM ('confirmed', 'completed', 'cancelled');
CREATE TYPE block_type     AS ENUM ('booking', 'maintenance');

-- --- users -------------------------------------------------------------------
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          user_role NOT NULL DEFAULT 'user',
    is_banned     BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT email_not_blank CHECK (length(trim(email)) > 0)
);

-- --- venues ------------------------------------------------------------------
CREATE TABLE venues (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT,
    status        venue_status NOT NULL DEFAULT 'pending',
    admin_comment TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT venue_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TABLE venue_photos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    url           TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- courts ------------------------------------------------------------------
CREATE TABLE courts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id       UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    sport          TEXT NOT NULL,
    price_per_hour NUMERIC(10, 2) NOT NULL,
    open_time      TIME NOT NULL,
    close_time     TIME NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT price_positive CHECK (price_per_hour > 0),
    CONSTRAINT hours_valid    CHECK (open_time < close_time)
);

-- --- bookings (also stores maintenance blocks) -------------------------------
-- One table holds both real bookings and maintenance blocks so a single
-- exclusion constraint prevents any overlap between them on the same court.
CREATE TABLE bookings (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id       UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    user_id        UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL for maintenance
    type           block_type NOT NULL DEFAULT 'booking',
    time_range     TSTZRANGE NOT NULL,
    status         booking_status NOT NULL DEFAULT 'confirmed',
    price_snapshot NUMERIC(10, 2),  -- captured at booking time; immune to later price edits
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- No two active (non-cancelled) reservations may overlap on the same court.
    -- This is the race-condition guard: it holds under concurrent inserts without
    -- application-level locking.
    EXCLUDE USING gist (court_id WITH =, time_range WITH &&) WHERE (status != 'cancelled'),

    -- Reject empty / unbounded ranges so a zero-length slot can't slip past the
    -- overlap check (&& never matches an empty range).
    CONSTRAINT time_range_bounded CHECK (
        NOT isempty(time_range)
        AND lower(time_range) IS NOT NULL
        AND upper(time_range) IS NOT NULL
    ),

    -- Bookings must carry a user and a price; maintenance blocks need neither.
    CONSTRAINT booking_fields_check CHECK (
        (type = 'booking'     AND user_id IS NOT NULL AND price_snapshot IS NOT NULL)
        OR (type = 'maintenance')
    ),

    -- Target for the reviews composite FK below (see reviews.fk_booking_completed).
    UNIQUE (id, status)
);

-- --- reviews -----------------------------------------------------------------
-- Reviews may exist ONLY for completed bookings, enforced structurally: the
-- composite FK (booking_id, booking_status) -> bookings(id, status) can only
-- resolve when the referenced booking's status is 'completed', and the CHECK
-- pins booking_status to 'completed'. No application logic can bypass this.
CREATE TABLE reviews (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id     UUID NOT NULL UNIQUE,
    booking_status booking_status NOT NULL DEFAULT 'completed',
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_booking_completed FOREIGN KEY (booking_id, booking_status)
        REFERENCES bookings(id, status) ON DELETE CASCADE,
    CONSTRAINT check_status_completed CHECK (booking_status = 'completed')
);
