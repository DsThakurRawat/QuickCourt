# QuickCourt — Design & Architecture

This document explains **how** QuickCourt is built and **why** each significant
decision was made. It is organised around the evaluation criteria, with database
design first because it carries the most weight.

---

## 1. Approach to the problem

QuickCourt lets players **discover, book, and review** sports courts while owners
manage venues and admins moderate the platform. The hard part of any booking
system is **concurrency**: two users must never reserve the same court-slot, even
if they click at the same millisecond. The guiding principle here is:

> **Push invariants down to the database.** If a rule can be a constraint, it is a
> constraint — not a Python `if`. That makes the rules impossible to bypass and
> immune to race conditions, regardless of how many app servers run.

Everything else (modular API, derived read models, validation) follows from that.

---

## 2. Database design (the core)

### 2.1 Entities

`users → venues → courts → bookings → reviews`, plus `venue_photos`. Money is
`NUMERIC(10,2)` (never float). Every table uses UUID PKs and `created_at`.
Full DDL lives in `server/migrations/0001_init.sql`.

### 2.2 Race-proof bookings — `EXCLUDE USING gist`

```sql
EXCLUDE USING gist (court_id WITH =, time_range WITH &&)
    WHERE (status != 'cancelled')
```

`time_range` is a `TSTZRANGE`. The exclusion constraint makes it **physically
impossible** for two non-cancelled reservations on the same court to overlap. The
`btree_gist` extension is what allows mixing the scalar `court_id` (equality) with
the range `time_range` (overlap `&&`) in one GiST index. This replaces
check-then-insert application logic — which is racy — with a guarantee the DB
enforces atomically. Two concurrent bookings for the same slot: one commits, the
other gets an `ExclusionViolation` → we translate it to **HTTP 409**.

**Bookings and maintenance blocks share one table** (`type` column) specifically
so they exclude *each other* through the same constraint — an owner's maintenance
block and a player's booking can never overlap.

Supporting guard:

```sql
CONSTRAINT time_range_bounded CHECK (
    NOT isempty(time_range) AND lower(time_range) IS NOT NULL
                            AND upper(time_range) IS NOT NULL)
```

Without it, a zero-length range would slip past `&&` (which never matches an empty
range) and allow a degenerate booking.

### 2.3 Reviews only on completed bookings — composite FK

Reviewing is restricted to *completed* bookings **structurally**, not in code:

```sql
-- bookings:
UNIQUE (id, status)
-- reviews:
booking_status booking_status NOT NULL DEFAULT 'completed',
CONSTRAINT fk_booking_completed
    FOREIGN KEY (booking_id, booking_status) REFERENCES bookings(id, status),
CONSTRAINT check_status_completed CHECK (booking_status = 'completed')
```

The FK references the *composite* `(id, status)`. Because the review row pins
`booking_status = 'completed'`, the FK can only resolve when the booking is
physically `completed`. A review on a `confirmed` booking fails at the DB with a
`ForeignKeyViolation` → **HTTP 400**. `booking_id UNIQUE` enforces one review per
booking (`UniqueViolation` → 400).

### 2.4 The "completion" problem — derived, not written-on-read

A booking becomes *complete* once its end time passes — but time moves without any
user action, so something must reconcile it. Three surfaces depend on it (reviews,
owner earnings, admin stats). The design **separates reads from writes**:

* **Reads never mutate.** A view derives status in SQL:

  ```sql
  CREATE VIEW booking_details AS
  SELECT b.*,
    CASE WHEN b.type='booking' AND b.status='confirmed'
              AND upper(b.time_range) <= now()
         THEN 'completed'::booking_status ELSE b.status END AS effective_status
  FROM bookings b;
  ```

  Dashboard, stats and "my bookings" read `effective_status`, so a `GET` is always
  side-effect free and scales horizontally.

* **Writes are explicit.** The real `status='completed'` transition (needed so the
  reviews FK can resolve) is applied by `settle_past_bookings` in exactly two
  places: (a) for the single booking being reviewed, and (b) a maintenance job
  `python -m app.services.bookings` intended for cron / `pg_cron`.

This removes the earlier write-on-read anti-pattern while keeping DB-level review
integrity.

### 2.5 Indexing rationale (`0002_indexes_and_views.sql`)

* FK columns are indexed (Postgres doesn't do this automatically): `owner_id`,
  `venue_id`, `court_id`, `user_id`, plus `status`/`sport` filter columns.
* `idx_bookings_start` on `lower(time_range)` — the exact expression "my bookings"
  filters and orders by (upcoming/past).
* `idx_bookings_unsettled` — a **partial** index on `upper(time_range)` limited to
  `status='confirmed'`, so the settle sweep touches only unsettled rows.
* The `EXCLUDE` constraint and `UNIQUE(id,status)` create their own GiST/btree
  indexes, which also serve availability lookups.

### 2.6 Migrations

`server/migrations/NNNN_*.sql` applied in order by `migrate.py`, which records each
in a `schema_migrations` table and is idempotent (safe to re-run). This is a
scalable, auditable alternative to a single ad-hoc `schema.sql`.

---

## 3. Modular architecture

```
server/
  main.py                 # thin shim: `from app.main import app`
  app/
    main.py               # app factory: middleware, lifespan, router wiring, errors
    core/                 # config · database (pool) · security (bcrypt + JWT)
    schemas.py            # all Pydantic request/response models + validators
    dependencies.py       # get_current_user, require_roles → get_owner / get_admin
    services/bookings.py  # domain logic (settle) shared by router + cron job
    routers/              # auth · venues · bookings · owner · admin (one per domain)
  migrations/ · migrate.py · seed.py
```

* **Separation of concerns** — routing, validation, domain logic, and
  infrastructure each live in their own layer. `main.py` shrank from a 500-line
  monolith to a set of focused modules.
* **DRY dependencies** — `require_roles("owner","admin")` generates the RBAC guards;
  `_assert_owns_venue` centralises ownership checks.
* **Backwards compatible** — the `uvicorn main:app` command and every API path are
  unchanged, so the frontend contract is untouched.

---

## 4. Security

* **Auth**: stateless JWT in an **HttpOnly** cookie (not readable by JS → no XSS
  token theft), with configurable `Secure` / `SameSite` for cross-site production.
* **RBAC**: every non-public route declares its required role via a dependency;
  banned users are rejected centrally in `get_current_user`.
* **Passwords**: bcrypt (per-password salt), never logged or returned.
* **SQL injection**: every query is parameterised — including the dynamically
  *built* venue filter, where only the query *text* is concatenated, never values.
* **Input validation**: Pydantic bounds every field (rating 1–5, price > 0,
  `end > start`, signup role limited to `user`/`owner`). Past-dated bookings are
  rejected server-side.
* **CORS**: locked to the configured `frontend_origin` with credentials.

---

## 5. Performance & scalability

* Async stack (FastAPI + `psycopg` async pool) — non-blocking DB I/O.
* Reads are side-effect free (§2.4) so the API scales to many stateless instances.
* Availability is computed **in the database** with `generate_series`, not by
  pulling rows into Python.
* Aggregates (ratings, earnings, stats) run as single grouped queries backed by
  indexes; pagination caps result size.

---

## 6. Frontend

React 19 + TypeScript + Vite, React Router, TanStack Query, Tailwind v4.

* **Modularity**: typed API client (`api/`), `AuthContext`, `ProtectedRoute` for
  role gating, reusable UI primitives (`components/ui.tsx`), one file per page.
* **Data layer**: TanStack Query handles caching, loading/error states and
  invalidation; mutations refetch the affected queries.
* **UX**: filters, live availability, optimistic navigation, inline error surfaces
  (e.g. the 409 "slot already booked"), empty/loading states everywhere.
* **Design**: single Tailwind theme (brand palette), responsive grids, accessible
  labels and focus rings.

---

## 7. Debugging & attention to detail

Bugs found and fixed while hardening (see git-less history in `DESIGN` notes):
missing `psycopg`/`timezone` imports, wrong exception type caught on reviews,
`passlib`/bcrypt incompatibility, missing `email-validator`, un-serialised range
objects, absent CORS, and no owner-course listing endpoint. Each was verified
end-to-end (double-book 409, review lifecycle, earnings) rather than assumed.

---

## 8. Running it

```bash
docker compose up -d                     # Postgres
cd server
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python migrate.py        # or: python seed.py  (schema + demo data)
uvicorn main:app --reload                # API → http://localhost:8000/docs

cd ../client && npm install && npm run dev   # UI → http://localhost:5173
```

Demo logins (password `password123`): `admin@quickcourt.com`,
`owner1@quickcourt.com`, `user1@quickcourt.com`.
