-- ============================================================
-- MIGRATION 004: Configurações de notificações e automações
-- ============================================================

CREATE TABLE notification_configs (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id              UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,

  -- Lembretes de agendamento
  reminder_enabled          BOOLEAN NOT NULL DEFAULT true,
  reminder_hours_before     INT[] NOT NULL DEFAULT '{36, 2}', -- horas antes do agendamento
  reminder_send_from        TIME NOT NULL DEFAULT '07:00',
  reminder_send_until       TIME NOT NULL DEFAULT '19:00',

  -- Confirmação pós-pagamento
  payment_confirm_enabled   BOOLEAN NOT NULL DEFAULT true,
  payment_confirm_message   TEXT NOT NULL DEFAULT
    'Pagamento confirmado! ✅ Seu agendamento está garantido para {{data}} às {{hora}}. Te esperamos!',

  -- No-show
  noshow_enabled            BOOLEAN NOT NULL DEFAULT true,
  noshow_grace_minutes      INT NOT NULL DEFAULT 15, -- tolerância após hora marcada

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON notification_configs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Rastreia quais lembretes já foram enviados (evita duplicatas)
CREATE TABLE appointment_reminders (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  hours_before   INT NOT NULL,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (appointment_id, hours_before)
);

CREATE INDEX idx_appointment_reminders ON appointment_reminders(appointment_id);

-- Automações de marketing
CREATE TYPE automation_trigger AS ENUM (
  'appointment_confirmed',
  'appointment_completed',
  'appointment_cancelled',
  'contact_inactive',
  'birthday',
  'custom'
);

CREATE TABLE marketing_automations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  trigger_type    automation_trigger NOT NULL,
  -- Para contact_inactive: dias sem interação
  trigger_value   INT,
  -- Delay após trigger em horas
  delay_hours     INT NOT NULL DEFAULT 0,
  messages        JSONB NOT NULL DEFAULT '[]',  -- até 4 variações
  number_id       UUID REFERENCES whatsapp_numbers(id) ON DELETE SET NULL,
  send_from       TIME NOT NULL DEFAULT '07:00',
  send_until      TIME NOT NULL DEFAULT '19:00',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON marketing_automations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_automations_workspace ON marketing_automations(workspace_id, is_active);

-- Histórico de execuções de automações
CREATE TABLE automation_executions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id   UUID NOT NULL REFERENCES marketing_automations(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pendente',
  message_sent    TEXT,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  error           TEXT,
  UNIQUE (automation_id, contact_id, scheduled_at)
);

CREATE INDEX idx_automation_executions_pending
  ON automation_executions(status, scheduled_at)
  WHERE status = 'pendente';
