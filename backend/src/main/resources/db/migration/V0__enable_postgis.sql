-- PostGIS doit exister avant V1 (colonnes geography).
-- Installé par le superuser (db/admin/setup_balagh_db.sql) ou par l'image Docker postgis/postgis :
-- ici IF NOT EXISTS ne fait rien et ne demande aucun droit particulier.
CREATE EXTENSION IF NOT EXISTS postgis;
