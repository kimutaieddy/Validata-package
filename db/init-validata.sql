-- Bootstrap script executed automatically by the postgres image on first start.
-- Creates required PostgreSQL extensions for Validata.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
