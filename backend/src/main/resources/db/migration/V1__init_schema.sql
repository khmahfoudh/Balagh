-- ORGANIZATIONS
CREATE TABLE organizations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    type          VARCHAR(20) NOT NULL CHECK (type IN ('CLEANING','SANITATION','ROADS','OTHER')),
    contact_phone TEXT,
    contact_email TEXT,
    status        VARCHAR(20) NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED')),
    categories    TEXT[] NOT NULL DEFAULT '{}'
);

-- USERS
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    phone           TEXT NOT NULL UNIQUE,
    nni_encrypted   TEXT,            -- chiffré AES-256 (base64)
    nni_hash        VARCHAR(64) UNIQUE,  -- SHA-256 + sel
    role            VARCHAR(20) NOT NULL CHECK (role IN ('CITIZEN','DRIVER','AGENT','MANAGER','AUTHORITY','ADMIN')),
    organization_id UUID REFERENCES organizations(id),
    trust_score     INT NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','BLOCKED')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ADMIN_UNITS (wilaya > moughataa > commune)
CREATE TABLE admin_units (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level     VARCHAR(20) NOT NULL CHECK (level IN ('WILAYA','MOUGHATAA','COMMUNE')),
    name_fr   TEXT NOT NULL,
    name_ar   TEXT NOT NULL,
    parent_id UUID REFERENCES admin_units(id),
    geom      geography(MultiPolygon, 4326)
);
CREATE INDEX idx_admin_units_geom ON admin_units USING GIST (geom);

-- ORGANIZATION_COVERAGE
CREATE TABLE organization_coverage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    category        VARCHAR(30) NOT NULL,
    admin_unit_id   UUID NOT NULL REFERENCES admin_units(id),
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id)
);
-- 1 seul organisme actif par catégorie et zone
CREATE UNIQUE INDEX uq_coverage_active
    ON organization_coverage (category, admin_unit_id) WHERE active;

-- VEHICLES
CREATE TABLE vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate           TEXT NOT NULL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    type            VARCHAR(20) NOT NULL,   -- benne, tracteur, citerne...
    active          BOOLEAN NOT NULL DEFAULT TRUE
);

-- INCIDENTS
CREATE TABLE incidents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category          VARCHAR(30) NOT NULL CHECK (category IN ('WASTE','STAGNANT_WATER','ROAD_HOLE')),
    centroid          geography(Point, 4326) NOT NULL,
    radius_m          INT NOT NULL DEFAULT 0,
    reporters_count   INT NOT NULL DEFAULT 1,
    priority          VARCHAR(10) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL','URGENT')),
    status            VARCHAR(20) NOT NULL DEFAULT 'NEW'
        CHECK (status IN ('NEW','CONFIRMED','ASSIGNED','EN_ROUTE','ON_SITE','RESOLVED','REJECTED','REOPENED')),
    admin_unit_id     UUID REFERENCES admin_units(id),
    organization_id   UUID REFERENCES organizations(id),   -- null tant que non assigné
    routing_status    VARCHAR(20) NOT NULL DEFAULT 'UNASSIGNED' CHECK (routing_status IN ('AUTO_ASSIGNED','UNASSIGNED')),
    citizen_check     VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (citizen_check IN ('PENDING','CONFIRMED','DISPUTED')),
    reopened_count    INT NOT NULL DEFAULT 0,
    first_reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_reported_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at       TIMESTAMPTZ
);
CREATE INDEX idx_incidents_centroid ON incidents USING GIST (centroid);
CREATE INDEX idx_incidents_status ON incidents (status);

-- REPORTS
CREATE TABLE reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    incident_id UUID NOT NULL REFERENCES incidents(id),
    category    VARCHAR(30) NOT NULL,
    location    geography(Point, 4326) NOT NULL,
    accuracy_m  NUMERIC(8,2),
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_location ON reports USING GIST (location);

-- MISSIONS (sans proof_media_id pour l'instant)
CREATE TABLE missions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(id),
    driver_id   UUID NOT NULL REFERENCES users(id),
    vehicle_id  UUID REFERENCES vehicles(id),
    status      VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED','EN_ROUTE','ON_SITE','DONE')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at  TIMESTAMPTZ,
    arrived_at  TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- MEDIA (rattaché à un report OU à une mission)
CREATE TABLE media (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id  UUID REFERENCES reports(id),
    mission_id UUID REFERENCES missions(id),
    type       VARCHAR(10) NOT NULL CHECK (type IN ('PHOTO','VIDEO')),
    url        TEXT NOT NULL,          -- clé MinIO
    size_bytes BIGINT,
    CHECK (report_id IS NOT NULL OR mission_id IS NOT NULL)
);

-- Référence circulaire missions -> media
ALTER TABLE missions ADD COLUMN proof_media_id UUID REFERENCES media(id);