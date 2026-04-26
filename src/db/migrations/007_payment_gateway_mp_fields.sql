-- ============================================================
-- MIGRATION 007: Campos adicionais Mercado Pago
-- ============================================================
ALTER TABLE payment_gateway_configs
  ADD COLUMN IF NOT EXISTS public_key    TEXT,
  ADD COLUMN IF NOT EXISTS client_id     TEXT,
  ADD COLUMN IF NOT EXISTS client_secret TEXT;
