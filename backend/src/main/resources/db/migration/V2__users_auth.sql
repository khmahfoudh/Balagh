-- =====================================================================
-- V2 : comptes utilisateurs et authentification
-- =====================================================================

ALTER TABLE users
    ADD COLUMN password_hash     TEXT,
    ADD COLUMN phone_verified_at TIMESTAMPTZ,
    ADD COLUMN preferred_lang    VARCHAR(2)  NOT NULL DEFAULT 'fr' CHECK (preferred_lang IN ('fr', 'ar')),
    ADD COLUMN updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    ALTER COLUMN trust_score SET DEFAULT 100,
    ADD CONSTRAINT ck_users_phone CHECK (phone ~ '^\+222[0-9]{8}$'),
    -- chauffeurs, agents et responsables appartiennent à un organisme ; les autres non
    ADD CONSTRAINT ck_users_role_org CHECK (
        (role IN ('DRIVER', 'AGENT', 'MANAGER') AND organization_id IS NOT NULL)
        OR (role IN ('CITIZEN', 'AUTHORITY', 'ADMIN') AND organization_id IS NULL));

CREATE INDEX idx_users_org_role ON users (organization_id, role);

-- Codes SMS (seule l'empreinte est stockée)
CREATE TABLE otp_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       TEXT        NOT NULL,
    code_hash   TEXT        NOT NULL,
    purpose     VARCHAR(20) NOT NULL CHECK (purpose IN ('LOGIN', 'INVITATION')),
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INT         NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone ON otp_codes (phone, created_at DESC);

-- Refresh tokens révocables (empreinte SHA-256)
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    replaced_by UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

-- Invitations (lien d'activation pour responsables, agents, chauffeurs)
CREATE TABLE invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    phone           TEXT        NOT NULL CHECK (phone ~ '^\+222[0-9]{8}$'),
    email           TEXT,
    first_name      TEXT        NOT NULL,
    last_name       TEXT        NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('DRIVER', 'AGENT', 'MANAGER', 'AUTHORITY', 'ADMIN')),
    organization_id UUID REFERENCES organizations (id),
    invited_by      UUID REFERENCES users (id),
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invitations_phone ON invitations (phone);

-- Jetons de notification push
CREATE TABLE device_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token        TEXT        NOT NULL UNIQUE,
    platform     VARCHAR(10) NOT NULL CHECK (platform IN ('ANDROID', 'IOS', 'WEB')),
    app          VARCHAR(10) NOT NULL CHECK (app IN ('CITIZEN', 'DRIVER', 'DASHBOARD')),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_device_tokens_user ON device_tokens (user_id);
