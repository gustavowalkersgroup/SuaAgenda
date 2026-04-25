-- ============================================================
-- MIGRATION 005: Super Admin
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_super_admin ON users (is_super_admin) WHERE is_super_admin = true;
