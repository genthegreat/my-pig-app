-- My Pigs App — schema
-- Written as SQLite DDL because it documents intent precisely. The client stores
-- these as Dexie tables over IndexedDB; the same shapes go to Supabase at phase 7.
--
-- Every table carries id / updated_at / device_id from the start so sync can be
-- added without a migration. Conflict resolution is last-write-wins per field.

-- ─── Animals ────────────────────────────────────────────────────────────────

CREATE TABLE animal (
  id              TEXT PRIMARY KEY,
  tag_colour      TEXT,                 -- 'pink', 'blue + red' — the farm uses colour pairs
  tag_label       TEXT,                 -- 'Sow 3', 'Big white sow'
  name            TEXT,
  sex             TEXT CHECK (sex IN ('male','female')),
  castrated       INTEGER DEFAULT 0,    -- inconsistently recorded historically; track it
  breed           TEXT,
  birth_date      TEXT,
  litter_id       TEXT REFERENCES litter(id),
  dam_id          TEXT REFERENCES animal(id),
  sire_id         TEXT REFERENCES animal(id),
  origin          TEXT CHECK (origin IN ('born_on_farm','purchased')),
  origin_detail   TEXT,                 -- 'Seller name', 'Farm on the main road'
  purchase_date   TEXT,
  purchase_cost   REAL,
  stage           TEXT CHECK (stage IN ('piglet_creep','weaner','grower','finisher','gilt','sow','boar')),
  current_room    TEXT REFERENCES room(id),   -- WHERE IT STANDS. Never its identity.
  status          TEXT CHECK (status IN ('active','sold','died','culled')),
  exit_date       TEXT,
  exit_reason     TEXT,
  notes           TEXT,
  updated_at      TEXT NOT NULL,
  device_id       TEXT NOT NULL
);

-- Stage changes are dated events, not a field overwrite. Cost-per-stage needs the history.
CREATE TABLE stage_change (
  id         TEXT PRIMARY KEY,
  animal_id  TEXT NOT NULL REFERENCES animal(id),
  from_stage TEXT,
  to_stage   TEXT NOT NULL,
  date       TEXT NOT NULL,
  reason     TEXT,                      -- 'promoted to sow', 'weaned'
  updated_at TEXT NOT NULL,
  device_id  TEXT NOT NULL
);

CREATE TABLE room (
  id         TEXT PRIMARY KEY,          -- 'room-1', 'small-room-4'
  label      TEXT NOT NULL,             -- 'Room 1'
  area_m2    REAL,
  purpose    TEXT,                      -- 'farrowing', 'grower', 'boar'
  active     INTEGER DEFAULT 1,
  updated_at TEXT NOT NULL,
  device_id  TEXT NOT NULL
);

CREATE TABLE room_occupancy (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL REFERENCES room(id),
  animal_id  TEXT NOT NULL REFERENCES animal(id),
  moved_in   TEXT NOT NULL,
  moved_out  TEXT,
  updated_at TEXT NOT NULL,
  device_id  TEXT NOT NULL
);

CREATE TABLE "group" (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,             -- 'Finishers', 'Growers', 'Lactating sow'
  stage      TEXT,
  opened_on  TEXT,
  closed_on  TEXT,
  updated_at TEXT NOT NULL,
  device_id  TEXT NOT NULL
);

CREATE TABLE group_member (
  group_id  TEXT NOT NULL REFERENCES "group"(id),
  animal_id TEXT NOT NULL REFERENCES animal(id),
  joined    TEXT NOT NULL,
  left      TEXT,
  PRIMARY KEY (group_id, animal_id, joined)
);

-- ─── Weights ────────────────────────────────────────────────────────────────
-- In practice a pen gets weighed as a batch, not animal by animal. Accept either.

CREATE TABLE weight (
  id         TEXT PRIMARY KEY,
  animal_id  TEXT REFERENCES animal(id),
  group_id   TEXT REFERENCES "group"(id),
  room_id    TEXT REFERENCES room(id),
  date       TEXT NOT NULL,
  weight_kg  REAL NOT NULL,
  basis      TEXT CHECK (basis IN ('live','dead')) DEFAULT 'live',
  method     TEXT CHECK (method IN ('spring_scale','digital_scale','weigh_tape','estimated')),
  notes      TEXT,
  updated_at TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  CHECK (animal_id IS NOT NULL OR group_id IS NOT NULL OR room_id IS NOT NULL)
);

-- ─── Breeding ───────────────────────────────────────────────────────────────
-- The unit breeding is actually managed in. expected_farrow = service_date + 114.

CREATE TABLE litter (
  id                TEXT PRIMARY KEY,
  dam_id            TEXT REFERENCES animal(id),
  sire_id           TEXT REFERENCES animal(id),
  sire_external     TEXT,               -- when the sow arrived pregnant
  service_date      TEXT,
  expected_farrow   TEXT,               -- computed, but stored so the calendar is queryable offline
  actual_farrow     TEXT,
  born_alive        INTEGER,
  stillborn         INTEGER DEFAULT 0,
  died_pre_weaning  INTEGER DEFAULT 0,
  weaned            INTEGER,
  weaning_date      TEXT,
  room_at_farrowing TEXT REFERENCES room(id),
  outcome           TEXT CHECK (outcome IN ('pending','farrowed','miscarried','not_pregnant')),
  notes             TEXT,
  updated_at        TEXT NOT NULL,
  device_id         TEXT NOT NULL
);

CREATE TABLE heat_record (
  id         TEXT PRIMARY KEY,
  animal_id  TEXT NOT NULL REFERENCES animal(id),
  date       TEXT NOT NULL,
  served     INTEGER DEFAULT 0,
  boar_id    TEXT REFERENCES animal(id),
  updated_at TEXT NOT NULL,
  device_id  TEXT NOT NULL
);

-- ─── Health ─────────────────────────────────────────────────────────────────

CREATE TABLE health_event (
  id             TEXT PRIMARY KEY,
  animal_id      TEXT REFERENCES animal(id),
  group_id       TEXT REFERENCES "group"(id),
  type           TEXT CHECK (type IN ('vaccination','deworming','injection','treatment','incident','mortality')),
  product        TEXT,
  dose           TEXT,
  date           TEXT NOT NULL,
  next_due_date  TEXT,
  cost           REAL,
  administered_by TEXT,
  notes          TEXT,
  updated_at     TEXT NOT NULL,
  device_id      TEXT NOT NULL
);

-- The rules that generate calendar entries, so nobody has to remember.
CREATE TABLE health_protocol (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL,
  applies_to_stage TEXT,
  trigger          TEXT CHECK (trigger IN ('age_days','days_since_last','fixed_date')),
  trigger_value    INTEGER,
  interval_days    INTEGER,
  product          TEXT,
  active           INTEGER DEFAULT 1,
  updated_at       TEXT NOT NULL,
  device_id        TEXT NOT NULL
);

-- ─── Money ──────────────────────────────────────────────────────────────────

CREATE TABLE cost (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  category    TEXT CHECK (category IN
                ('feed','feed_transport','veterinary','labour','stock_purchase',
                 'equipment','utilities','construction','bedding','additives','other')),
  item        TEXT NOT NULL,
  quantity    REAL,
  unit        TEXT,
  unit_cost   REAL,
  total       REAL NOT NULL,
  supplier    TEXT,
  recurring   INTEGER DEFAULT 0,
  is_capital  INTEGER DEFAULT 0,        -- construction and breeding stock. NEVER in cost-per-pig.
  allocation  TEXT,                     -- 'farm' | group_id | animal_id
  confidence  TEXT CHECK (confidence IN ('high','medium','low')),
  source_note TEXT,                     -- traceability back to the original handwritten note
  updated_at  TEXT NOT NULL,
  device_id   TEXT NOT NULL
);

CREATE TABLE feed_product (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  kind            TEXT CHECK (kind IN ('concentrate','complete','diluent','additive')),
  bag_size_kg     REAL NOT NULL,        -- 25 for meal 3 and creep, 50 for the rest
  mj_per_kg       REAL,
  protein_pct     REAL,
  stated_inclusion TEXT,                -- what the bag says, e.g. '1:3 with maize meal'
  active          INTEGER DEFAULT 1,
  updated_at      TEXT NOT NULL,
  device_id       TEXT NOT NULL
);

CREATE TABLE feed_purchase (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,
  product_id    TEXT NOT NULL REFERENCES feed_product(id),
  bags          REAL NOT NULL,
  bag_size_kg   REAL NOT NULL,          -- copied at purchase; bag sizes change and history must not
  price_per_bag REAL NOT NULL,
  total         REAL NOT NULL,
  supplier      TEXT,
  cost_id       TEXT REFERENCES cost(id),
  updated_at    TEXT NOT NULL,
  device_id     TEXT NOT NULL
);

-- How feed is actually mixed. ratio_basis is not optional — see CLAUDE.md.
CREATE TABLE ration (
  id                TEXT PRIMARY KEY,
  group_id          TEXT REFERENCES "group"(id),
  effective_from    TEXT NOT NULL,
  effective_to      TEXT,
  concentrate_id    TEXT REFERENCES feed_product(id),
  diluent_id        TEXT REFERENCES feed_product(id),
  ratio_concentrate REAL NOT NULL DEFAULT 1,
  ratio_diluent     REAL NOT NULL,
  ratio_basis       TEXT NOT NULL CHECK (ratio_basis IN ('bags','weight')),
  kg_per_pig_per_day REAL,
  notes             TEXT,
  updated_at        TEXT NOT NULL,
  device_id         TEXT NOT NULL
);

-- ─── Sales ──────────────────────────────────────────────────────────────────

CREATE TABLE client (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT,
  location        TEXT,
  type            TEXT CHECK (type IN ('individual','butchery','trader','restaurant')),
  first_purchase  TEXT,
  notes           TEXT,
  updated_at      TEXT NOT NULL,
  device_id       TEXT NOT NULL
);

CREATE TABLE sale (
  id                    TEXT PRIMARY KEY,
  date                  TEXT NOT NULL,
  client_id             TEXT REFERENCES client(id),
  channel               TEXT NOT NULL CHECK (channel IN ('live','dead')),
  head                  INTEGER NOT NULL,
  live_kg               REAL,
  carcass_kg            REAL,
  price_per_kg          REAL,
  carcass_total         REAL,
  head_kg               REAL,           -- heads may be sold per kg or given away
  head_sold             INTEGER DEFAULT 0,
  head_price_per_kg     REAL,
  head_total            REAL,
  trotters_kg           REAL,
  trotters_sold         INTEGER DEFAULT 0,
  trotters_total        REAL,
  total                 REAL NOT NULL,
  dressing_pct          REAL,           -- computed where both weights exist
  live_equivalent_per_kg REAL,          -- total ÷ live_kg. ALWAYS SHOWN.
  payment_status        TEXT CHECK (payment_status IN ('unpaid','part','paid')),
  amount_paid           REAL,
  notes                 TEXT,
  updated_at            TEXT NOT NULL,
  device_id             TEXT NOT NULL
);

CREATE TABLE sale_line (
  id         TEXT PRIMARY KEY,
  sale_id    TEXT NOT NULL REFERENCES sale(id),
  animal_id  TEXT REFERENCES animal(id),
  live_kg    REAL,
  carcass_kg REAL,
  head_kg    REAL,
  updated_at TEXT NOT NULL,
  device_id  TEXT NOT NULL
);

-- ─── People ─────────────────────────────────────────────────────────────────

CREATE TABLE employee (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT,
  start_date    TEXT,
  pay_rate      REAL,
  pay_frequency TEXT,
  phone         TEXT,
  status        TEXT CHECK (status IN ('active','former')),
  updated_at    TEXT NOT NULL,
  device_id     TEXT NOT NULL
);

CREATE TABLE time_log (
  id          TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES employee(id),
  is_owner    INTEGER DEFAULT 0,        -- the owner's own unpaid hours count toward true cost
  date        TEXT NOT NULL,
  hours       REAL NOT NULL,
  task        TEXT,
  group_id    TEXT REFERENCES "group"(id),
  updated_at  TEXT NOT NULL,
  device_id   TEXT NOT NULL
);

CREATE TABLE payroll (
  id          TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employee(id),
  period      TEXT NOT NULL,
  amount      REAL NOT NULL,
  kind        TEXT CHECK (kind IN ('salary','advance','bonus')),
  paid_on     TEXT,
  cost_id     TEXT REFERENCES cost(id),
  updated_at  TEXT NOT NULL,
  device_id   TEXT NOT NULL
);

-- ─── Calendar & settings ────────────────────────────────────────────────────
-- Generated entries are derived, but materialised so the calendar renders offline
-- without recomputing every rule on every paint.

CREATE TABLE calendar_entry (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  kind        TEXT CHECK (kind IN ('health','weighing','sale','breeding','finance','manual')),
  source      TEXT CHECK (source IN ('protocol','breeding','projection','feed_forecast','manual')),
  title       TEXT NOT NULL,
  animal_id   TEXT REFERENCES animal(id),
  group_id    TEXT REFERENCES "group"(id),
  litter_id   TEXT REFERENCES litter(id),
  done        INTEGER DEFAULT 0,
  done_date   TEXT,
  notes       TEXT,
  updated_at  TEXT NOT NULL,
  device_id   TEXT NOT NULL
);

CREATE TABLE setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Seeded from src/db/settings.ts, e.g.:
--   daily_cost_feed / _labour / _other   (running cost per pig per day)
--   dressing_pct, target_price_per_kg, head_price_per_kg
--   gestation_days = 114, assumed_intake_kg

CREATE TABLE sync_queue (
  id         TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id  TEXT NOT NULL,
  op         TEXT CHECK (op IN ('insert','update','delete')),
  payload    TEXT,
  queued_at  TEXT NOT NULL,
  synced_at  TEXT
);

-- Records that don't reconcile. Never delete a bad record — park it here and keep it visible.
CREATE TABLE data_flag (
  id          TEXT PRIMARY KEY,
  table_name  TEXT NOT NULL,
  record_id   TEXT,
  issue       TEXT NOT NULL,
  raised_on   TEXT NOT NULL,
  resolved_on TEXT,
  resolution  TEXT,
  updated_at  TEXT NOT NULL,
  device_id   TEXT NOT NULL
);

CREATE INDEX idx_weight_date        ON weight(date);
CREATE INDEX idx_weight_animal      ON weight(animal_id, date);
CREATE INDEX idx_cost_date          ON cost(date, category);
CREATE INDEX idx_calendar_date      ON calendar_entry(date, done);
CREATE INDEX idx_litter_expected    ON litter(expected_farrow, outcome);
CREATE INDEX idx_animal_status      ON animal(status, stage);
CREATE INDEX idx_sync_pending       ON sync_queue(synced_at);
