-- =====================================================================
-- Balagh MR : (re)création de la base balagh_db. À EXÉCUTER EN SUPERUSER.
--
--   psql -h localhost -U postgres -d postgres -f backend/db/admin/setup_balagh_db.sql -v app_password=XXXX
--
-- ATTENTION : supprime entièrement balagh_db puis la recrée vide.
--
-- Deux rôles :
--   stage_user  : propriétaire de la base, utilisé UNIQUEMENT par Flyway (DDL)
--   balagh_app  : utilisé par l'application, lecture/écriture des données, aucun DDL
-- =====================================================================
\set ON_ERROR_STOP on

DROP DATABASE IF EXISTS balagh_db WITH (FORCE);
CREATE DATABASE balagh_db OWNER stage_user ENCODING 'UTF8' TEMPLATE template0;

-- Rôle applicatif à droits limités (créé ou mis à jour)
SELECT format('CREATE ROLE balagh_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'balagh_app') \gexec
SELECT format('ALTER ROLE balagh_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'app_password') \gexec

REVOKE ALL ON DATABASE balagh_db FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE balagh_db TO stage_user, balagh_app;

\connect balagh_db

-- PostGIS : extension non « trusted », seul un superuser peut l'installer
CREATE EXTENSION IF NOT EXISTS postgis;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO balagh_app;
GRANT SELECT ON spatial_ref_sys TO balagh_app;

-- Toute table / séquence créée par Flyway (stage_user) sera accessible à balagh_app en DML seulement
ALTER DEFAULT PRIVILEGES FOR ROLE stage_user IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO balagh_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stage_user IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO balagh_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stage_user IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO balagh_app;

\echo 'balagh_db recréée : propriétaire stage_user, PostGIS installé, rôle balagh_app prêt.'
