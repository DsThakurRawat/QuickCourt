-- =============================================================================
-- Indexes and derived views
-- =============================================================================

-- Foreign-key and filter indexes (Postgres does not auto-index FKs).
CREATE INDEX idx_venues_owner_id       ON venues(owner_id);
CREATE INDEX idx_venues_status         ON venues(status);
CREATE INDEX idx_venue_photos_venue_id ON venue_photos(venue_id);
CREATE INDEX idx_courts_venue_id       ON courts(venue_id);
CREATE INDEX idx_courts_sport          ON courts(sport);
CREATE INDEX idx_bookings_court_id     ON bookings(court_id);
CREATE INDEX idx_bookings_user_id      ON bookings(user_id);
CREATE INDEX idx_bookings_status       ON bookings(status);
CREATE INDEX idx_reviews_user_id       ON reviews(user_id);

-- "My bookings" filters and orders by the booking's start instant.
CREATE INDEX idx_bookings_start ON bookings (lower(time_range));

-- The settle job / review path scan for past, still-confirmed bookings. A partial
-- index keeps it tiny (only unsettled bookings) and makes the sweep an index scan.
CREATE INDEX idx_bookings_unsettled ON bookings (upper(time_range))
    WHERE type = 'booking' AND status = 'confirmed';

-- Effective completion status, derived (not stored): a confirmed booking whose
-- end time has passed reads as 'completed'. Read paths use this view so GET
-- requests never write. The stored column is reconciled by the settle job.
CREATE VIEW booking_details AS
SELECT
    b.*,
    CASE
        WHEN b.type = 'booking' AND b.status = 'confirmed' AND upper(b.time_range) <= now()
            THEN 'completed'::booking_status
        ELSE b.status
    END AS effective_status
FROM bookings b;
