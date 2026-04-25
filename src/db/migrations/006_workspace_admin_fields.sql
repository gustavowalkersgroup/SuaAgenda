-- Migration 006: campos extras para gestão no painel super-admin
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS trial_ends_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_email   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS notes           TEXT;
