-- =====================================================================
-- V5 : paramètres, retours citoyens, notifications, audit, contrats
-- =====================================================================

-- Paramètres métier (category NULL = valeur globale, sinon surcharge par catégorie)
CREATE TABLE settings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(60) NOT NULL,
    category    VARCHAR(30) CHECK (category IN ('WASTE', 'STAGNANT_WATER', 'ROAD_HOLE')),
    value       TEXT        NOT NULL,
    description TEXT,
    updated_by  UUID REFERENCES users (id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_settings_key_category ON settings (key, COALESCE(category, ''));

INSERT INTO settings (key, category, value, description) VALUES
    ('urgency.threshold',              NULL,             '5',   'Citoyens distincts pour passer en URGENT'),
    ('cluster.radius_m',               NULL,             '100', 'Rayon de regroupement (m)'),
    ('cluster.radius_m',               'STAGNANT_WATER', '150', 'Rayon de regroupement eau stagnante (m)'),
    ('urgency.window_days',            NULL,             '7',   'Fenêtre de comptage des citoyens (jours)'),
    ('citizen.limit_radius_m',         NULL,             '50',  'Limite citoyen : rayon (m)'),
    ('citizen.limit_hours',            NULL,             '24',  'Limite citoyen : durée (h)'),
    ('report.max_accuracy_m',          NULL,             '50',  'Précision GPS maximale acceptée (m)'),
    ('report.max_media',               NULL,             '3',   'Nombre maximum de médias par signalement'),
    ('feedback.window_hours',          NULL,             '72',  'Durée de confirmation / contestation après résolution (h)'),
    ('feedback.reopen_disputes',       NULL,             '2',   'Contestations de citoyens distincts pour rouvrir'),
    ('alert.urgent_no_mission_hours',  NULL,             '24',  'Alerte si urgent sans mission depuis (h)'),
    ('alert.zone_idle_days',           NULL,             '30',  'Alerte si zone sans incident traité depuis (jours)'),
    ('trust.reject_penalty',           NULL,             '10',  'Points de confiance retirés par signalement rejeté'),
    ('trust.alert_threshold',          NULL,             '50',  'Alerte admin sous ce score de confiance');

-- Retours citoyens après résolution (1 vote par citoyen et par résolution)
CREATE TABLE incident_feedback (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id      UUID        NOT NULL REFERENCES incidents (id),
    user_id          UUID        NOT NULL REFERENCES users (id),
    resolution_round INT         NOT NULL DEFAULT 0,
    resolved         BOOLEAN     NOT NULL,
    comment          TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (incident_id, user_id, resolution_round)
);

-- Notifications in-app
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type        VARCHAR(40) NOT NULL,
    title       TEXT        NOT NULL,
    body        TEXT,
    incident_id UUID,
    mission_id  UUID,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);

-- Journal d'audit
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID,
    action      VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40),
    entity_id   UUID,
    details     TEXT,
    ip          TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);

-- Contrats (phase 2 du cahier des charges : table prête, pas encore utilisée)
CREATE TABLE contracts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations (id),
    category        VARCHAR(30) NOT NULL CHECK (category IN ('WASTE', 'STAGNANT_WATER', 'ROAD_HOLE')),
    admin_unit_id   UUID REFERENCES admin_units (id),
    start_date      DATE        NOT NULL,
    end_date        DATE,
    target_hours    INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
