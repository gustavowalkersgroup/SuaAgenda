-- ============================================================
-- MIGRATION 002: Configuração de gateways de pagamento por workspace
-- ============================================================

CREATE TABLE payment_gateway_configs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  provider         VARCHAR(30) NOT NULL DEFAULT 'mercadopago',
  -- Credenciais criptografadas na aplicação
  access_token     TEXT,
  api_key          TEXT,
  webhook_secret   TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON payment_gateway_configs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_payment_gateway_workspace ON payment_gateway_configs(workspace_id);
