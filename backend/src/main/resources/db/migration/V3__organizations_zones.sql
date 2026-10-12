-- =====================================================================
-- V3 : organismes, découpage administratif et verrouillage des zones
-- =====================================================================

ALTER TABLE organizations
    ADD COLUMN contract_reference TEXT,
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD CONSTRAINT ck_org_categories
        CHECK (categories <@ ARRAY ['WASTE', 'STAGNANT_WATER', 'ROAD_HOLE']::text[]);

-- ---------------------------------------------------------------------
-- admin_units : code officiel + hiérarchie wilaya > moughataa > commune
-- ---------------------------------------------------------------------
ALTER TABLE admin_units ADD COLUMN code VARCHAR(30) UNIQUE;
CREATE INDEX idx_admin_units_parent ON admin_units (parent_id);
CREATE INDEX idx_admin_units_level ON admin_units (level);

CREATE FUNCTION admin_units_check_hierarchy() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    parent_level VARCHAR(20);
BEGIN
    SELECT level INTO parent_level FROM admin_units WHERE id = NEW.parent_id;
    IF (NEW.level = 'WILAYA' AND NEW.parent_id IS NOT NULL)
        OR (NEW.level = 'MOUGHATAA' AND parent_level IS DISTINCT FROM 'WILAYA')
        OR (NEW.level = 'COMMUNE' AND parent_level IS DISTINCT FROM 'MOUGHATAA') THEN
        RAISE EXCEPTION 'Hiérarchie invalide : % ne peut pas avoir un parent de niveau %', NEW.level, parent_level;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_admin_units_hierarchy
    BEFORE INSERT OR UPDATE OF level, parent_id ON admin_units
    FOR EACH ROW EXECUTE FUNCTION admin_units_check_hierarchy();

-- ---------------------------------------------------------------------
-- organization_coverage : historique + verrouillage hiérarchique
-- ---------------------------------------------------------------------
ALTER TABLE organization_coverage
    ADD CONSTRAINT ck_coverage_category CHECK (category IN ('WASTE', 'STAGNANT_WATER', 'ROAD_HOLE')),
    ADD COLUMN released_at         TIMESTAMPTZ,
    ADD COLUMN released_by         UUID REFERENCES users (id),
    ADD COLUMN release_reason      TEXT,
    ADD COLUMN transferred_from_id UUID REFERENCES organization_coverage (id),
    ADD COLUMN idle_alert_sent_at  TIMESTAMPTZ;

CREATE INDEX idx_coverage_org_active ON organization_coverage (organization_id) WHERE active;

-- Règle « premier arrivé, premier verrouillé », parents ET enfants inclus :
-- une zone active d'une catégorie bloque, pour cette catégorie, ses ancêtres et ses descendants.
-- Exemple : la commune Ksar prise pour WASTE empêche de prendre la moughataa Ksar
-- ou la wilaya Nouakchott-Ouest entière pour WASTE, mais pas pour STAGNANT_WATER.
-- Le service vérifie avant (message clair) ; ce trigger est le filet de sécurité
-- en cas de requêtes simultanées. Erreur SQLSTATE BZ409, traduite en HTTP 409.
CREATE FUNCTION coverage_check_lock() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    org_categories text[];
    conflict_org   UUID;
BEGIN
    IF NOT NEW.active THEN
        RETURN NEW;
    END IF;

    SELECT categories INTO org_categories FROM organizations WHERE id = NEW.organization_id;
    IF NOT (NEW.category = ANY (org_categories)) THEN
        RAISE EXCEPTION USING ERRCODE = 'BZ403', MESSAGE = 'CATEGORY_NOT_ALLOWED';
    END IF;

    -- sérialise les prises de zone d'une même catégorie (évite deux prises simultanées)
    PERFORM pg_advisory_xact_lock(hashtext('coverage:' || NEW.category));

    WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM admin_units WHERE id = NEW.admin_unit_id
        UNION ALL
        SELECT a.id, a.parent_id FROM admin_units a JOIN ancestors s ON a.id = s.parent_id
    ), descendants AS (
        SELECT id FROM admin_units WHERE id = NEW.admin_unit_id
        UNION ALL
        SELECT a.id FROM admin_units a JOIN descendants d ON a.parent_id = d.id
    )
    SELECT c.organization_id INTO conflict_org
    FROM organization_coverage c
    WHERE c.active
      AND c.category = NEW.category
      AND c.id <> NEW.id
      AND (c.admin_unit_id IN (SELECT id FROM ancestors) OR c.admin_unit_id IN (SELECT id FROM descendants))
    LIMIT 1;

    IF conflict_org IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'BZ409', MESSAGE = 'ZONE_ALREADY_TAKEN', DETAIL = conflict_org::text;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_coverage_lock
    BEFORE INSERT OR UPDATE OF active, admin_unit_id, category ON organization_coverage
    FOR EACH ROW EXECUTE FUNCTION coverage_check_lock();
