-- Runs once on first Postgres init (mounted into /docker-entrypoint-initdb.d).
-- The default database lexiai_dev comes from POSTGRES_DB; create the test DB here.
CREATE DATABASE lexiai_test;
