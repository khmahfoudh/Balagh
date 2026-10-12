-- =====================================================================
-- V4 : incidents, signalements, médias, missions, véhicules
-- =====================================================================

ALTER TABLE incidents
    ADD COLUMN urgent_since         TIMESTAMPTZ,
    ADD COLUMN urgent_alert_sent_at TIMESTAMPTZ,
    ADD COLUMN confirmed_at         TIMESTAMPTZ,
    ADD COLUMN confirmed_by         UUID REFERENCES users (id),
    ADD COLUMN confirmation_mode    VARCHAR(10) CHECK (confirmation_mode IN ('AUTO', 'MANUAL')),
    ADD COLUMN rejection_reason     VARCHAR(20) CHECK (rejection_reason IN ('OFF_TOPIC', 'DUPLICATE', 'FAKE', 'ALREADY_DONE')),
    ADD COLUMN rejection_note       TEXT,
    ADD COLUMN rejected_at          TIMESTAMPTZ,
    ADD COLUMN rejected_by          UUID REFERENCES users (id),
    ADD COLUMN duplicate_of_id      UUID REFERENCES incidents (id),
    ADD COLUMN feedback_closed_at   TIMESTAMPTZ,
    ADD COLUMN version              BIGINT      NOT NULL DEFAULT 0,
    ADD COLUMN updated_at           TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX idx_incidents_org_status ON incidents (organization_id, status);
CREATE INDEX idx_incidents_admin_unit ON incidents (admin_unit_id);
CREATE INDEX idx_incidents_category_status ON incidents (category, status);

-- ---------------------------------------------------------------------
ALTER TABLE reports
    ALTER COLUMN accuracy_m TYPE DOUBLE PRECISION,
    ADD CONSTRAINT ck_reports_category CHECK (category IN ('WASTE', 'STAGNANT_WATER', 'ROAD_HOLE')),
    ADD COLUMN client_id   UUID UNIQUE,
    ADD COLUMN captured_at TIMESTAMPTZ,
    ADD COLUMN device_id   TEXT,
    ADD COLUMN source      VARCHAR(10) NOT NULL DEFAULT 'NEW' CHECK (source IN ('NEW', 'ME_TOO'));

CREATE INDEX idx_reports_incident ON reports (incident_id, created_at);
CREATE INDEX idx_reports_user_category ON reports (user_id, category, created_at);

-- ---------------------------------------------------------------------
-- media : rattaché à exactement UN parent (signalement OU mission)
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_check;
ALTER TABLE media
    ADD CONSTRAINT ck_media_owner CHECK ((report_id IS NULL) <> (mission_id IS NULL)),
    ADD COLUMN content_type TEXT,
    ADD COLUMN duration_s   DOUBLE PRECISION,
    ADD COLUMN sha256       VARCHAR(64),
    ADD COLUMN location     geography(Point, 4326),
    ADD COLUMN captured_at  TIMESTAMPTZ,
    ADD COLUMN created_at   TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX idx_media_report ON media (report_id);
CREATE INDEX idx_media_mission ON media (mission_id);

-- ---------------------------------------------------------------------
-- missions : statut CANCELLED + 1 seule mission active par incident
ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_status_check;
ALTER TABLE missions
    ADD CONSTRAINT ck_missions_status CHECK (status IN ('ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'DONE', 'CANCELLED')),
    ADD COLUMN assigned_by   UUID REFERENCES users (id),
    ADD COLUMN due_at        TIMESTAMPTZ,
    ADD COLUMN driver_note   TEXT,
    ADD COLUMN cancelled_at  TIMESTAMPTZ,
    ADD COLUMN cancel_reason TEXT;

CREATE UNIQUE INDEX uq_missions_active_per_incident
    ON missions (incident_id) WHERE status NOT IN ('DONE', 'CANCELLED');
CREATE INDEX idx_missions_driver_status ON missions (driver_id, status);

-- ---------------------------------------------------------------------
ALTER TABLE vehicles
    ADD COLUMN out_of_service BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN created_at     TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------
-- Chronologie métier d'un incident (affichée dans le détail incident)
CREATE TABLE incident_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID        NOT NULL REFERENCES incidents (id),
    type        VARCHAR(30) NOT NULL,
    from_status VARCHAR(20),
    to_status   VARCHAR(20),
    actor_id    UUID REFERENCES users (id),
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_incident_events_incident ON incident_events (incident_id, created_at);
