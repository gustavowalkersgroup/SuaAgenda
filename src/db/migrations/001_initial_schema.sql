-- ============================================================
-- MIGRATION 001: Schema inicial
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'atendente', 'marketing');

CREATE TYPE plan_type AS ENUM ('starter', 'pro', 'enterprise');

CREATE TYPE contact_status AS ENUM (
  'novo',
  'em_atendimento',
  'orcamento',
  'agendado',
  'concluido',
  'perdido'
);

CREATE TYPE conversation_status AS ENUM ('aberta', 'em_atendimento', 'fechada', 'aguardando');

CREATE TYPE conversation_assignee_type AS ENUM ('ia', 'humano');

CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

CREATE TYPE message_type AS ENUM ('text', 'image', 'audio', 'video', 'document', 'location', 'sticker', 'template');

CREATE TYPE appointment_status AS ENUM (
  'PRE_RESERVADO',
  'CONFIRMADO',
  'CONCLUIDO',
  'CANCELADO',
  'EXPIRADO',
  'NO_SHOW'
);

CREATE TYPE payment_status AS ENUM ('pendente', 'pago', 'expirado', 'estornado');

CREATE TYPE availability_block_type AS ENUM ('folga', 'compromisso', 'almoco_fixo', 'almoco_dinamico');

CREATE TYPE broadcast_status AS ENUM ('rascunho', 'agendado', 'enviando', 'concluido', 'cancelado');

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  avatar_url  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WORKSPACES
-- ============================================================

CREATE TABLE workspaces (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  VARCHAR(255) NOT NULL,
  slug                  VARCHAR(100) NOT NULL UNIQUE,
  plan                  plan_type NOT NULL DEFAULT 'starter',
  openai_api_key        TEXT,                          -- criptografado na app
  max_contacts          INT NOT NULL DEFAULT 500,
  max_users             INT NOT NULL DEFAULT 3,
  parallel_scheduling   BOOLEAN NOT NULL DEFAULT false,
  scheduling_window_days INT NOT NULL DEFAULT 7,
  slot_lock_minutes     INT NOT NULL DEFAULT 15,
  timezone              VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WORKSPACE USERS (membros)
-- ============================================================

CREATE TABLE workspace_users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         user_role NOT NULL DEFAULT 'atendente',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

-- ============================================================
-- WHATSAPP NUMBERS
-- ============================================================

CREATE TABLE whatsapp_numbers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  instance_name  VARCHAR(255) NOT NULL,              -- nome na Evolution API
  phone_number   VARCHAR(30) NOT NULL,
  display_name   VARCHAR(255),
  purpose        VARCHAR(20) NOT NULL DEFAULT 'atendimento', -- atendimento | marketing
  is_connected   BOOLEAN NOT NULL DEFAULT false,
  qr_code        TEXT,
  connected_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, phone_number)
);

-- ============================================================
-- PROFESSIONALS
-- ============================================================

CREATE TABLE professionals (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL, -- opcional: vínculo com user
  name         VARCHAR(255) NOT NULL,
  avatar_url   TEXT,
  phone        VARCHAR(30),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SERVICES
-- ============================================================

CREATE TABLE services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  duration_minutes  INT NOT NULL,                    -- múltiplo de 30
  price             NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposit_percent   NUMERIC(5,2) NOT NULL DEFAULT 0, -- % da taxa de reserva
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SERVICE_PROFESSIONALS (quais profissionais fazem qual serviço)
-- ============================================================

CREATE TABLE service_professionals (
  service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, professional_id)
);

-- ============================================================
-- PROFESSIONAL SCHEDULES (horários de trabalho)
-- ============================================================

CREATE TABLE professional_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=domingo
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  UNIQUE (professional_id, day_of_week)
);

-- ============================================================
-- AVAILABILITY BLOCKS (bloqueios)
-- ============================================================

CREATE TABLE availability_blocks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  block_type      availability_block_type NOT NULL,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  reason          TEXT,
  -- para almoço dinâmico
  lunch_duration_minutes INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONTACTS (CRM)
-- ============================================================

CREATE TABLE contacts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(255),
  phone        VARCHAR(30) NOT NULL,
  email        VARCHAR(255),
  avatar_url   TEXT,
  status       contact_status NOT NULL DEFAULT 'novo',
  notes        TEXT,
  assigned_to  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, phone)
);

-- ============================================================
-- TAGS
-- ============================================================

CREATE TABLE tags (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  color        VARCHAR(7) NOT NULL DEFAULT '#6366F1',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE contact_tags (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

-- ============================================================
-- CONVERSATIONS (inbox)
-- ============================================================

CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  number_id       UUID REFERENCES whatsapp_numbers(id) ON DELETE SET NULL,
  status          conversation_status NOT NULL DEFAULT 'aberta',
  assignee_type   conversation_assignee_type NOT NULL DEFAULT 'ia',
  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  unread_count    INT NOT NULL DEFAULT 0,
  ai_paused_until TIMESTAMPTZ,               -- IA pausada até (após transferência humano)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MESSAGES
-- ============================================================

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction       message_direction NOT NULL,
  type            message_type NOT NULL DEFAULT 'text',
  content         TEXT,
  media_url       TEXT,
  media_mime      VARCHAR(100),
  status          message_status NOT NULL DEFAULT 'pending',
  external_id     VARCHAR(255),              -- ID da mensagem na Evolution API
  sent_by         UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL = IA
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================

CREATE TABLE appointments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  status          appointment_status NOT NULL DEFAULT 'PRE_RESERVADO',
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  total_price     NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposit_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  expires_at      TIMESTAMPTZ,               -- expiração do PRE_RESERVADO
  confirmed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- APPOINTMENT SERVICES (serviços do agendamento)
-- ============================================================

CREATE TABLE appointment_services (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE RESTRICT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposit_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  sort_order      SMALLINT NOT NULL DEFAULT 0
);

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  amount          NUMERIC(10,2) NOT NULL,
  status          payment_status NOT NULL DEFAULT 'pendente',
  provider        VARCHAR(50),               -- ex: mercadopago, stripe, asaas
  external_id     VARCHAR(255),              -- ID no gateway
  checkout_url    TEXT,
  paid_at         TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WAITLIST
-- ============================================================

CREATE TABLE waitlist (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL, -- NULL = qualquer
  preferred_from  TIMESTAMPTZ,
  preferred_to    TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  notified_at     TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FLOWS
-- ============================================================

CREATE TABLE flows (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  trigger      VARCHAR(100),                -- ex: 'message_received', 'appointment_created'
  nodes        JSONB NOT NULL DEFAULT '[]',
  is_active    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AI CONFIGS (por tenant)
-- ============================================================

CREATE TABLE ai_configs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  model        VARCHAR(50) NOT NULL DEFAULT 'gpt-4o',
  system_prompt TEXT NOT NULL DEFAULT '',
  persona      VARCHAR(100),
  faq          TEXT,
  temperature  NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  max_tokens   INT NOT NULL DEFAULT 1000,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BROADCASTS (disparos)
-- ============================================================

CREATE TABLE broadcasts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  number_id    UUID REFERENCES whatsapp_numbers(id) ON DELETE SET NULL,
  status       broadcast_status NOT NULL DEFAULT 'rascunho',
  messages     JSONB NOT NULL DEFAULT '[]', -- até 4 variações
  speed        SMALLINT NOT NULL DEFAULT 1, -- mensagens/min
  scheduled_at TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  total        INT NOT NULL DEFAULT 0,
  sent         INT NOT NULL DEFAULT 0,
  failed       INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE broadcast_recipients (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'pendente',
  sent_at      TIMESTAMPTZ,
  message_used TEXT,
  error        TEXT
);

-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX idx_workspace_users_workspace ON workspace_users(workspace_id);
CREATE INDEX idx_workspace_users_user ON workspace_users(user_id);

CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_status ON contacts(workspace_id, status);

CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_status ON conversations(workspace_id, status);
CREATE INDEX idx_conversations_last_msg ON conversations(workspace_id, last_message_at DESC);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_workspace ON messages(workspace_id);
CREATE INDEX idx_messages_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_external_id ON messages(external_id);

CREATE INDEX idx_appointments_workspace ON appointments(workspace_id);
CREATE INDEX idx_appointments_contact ON appointments(contact_id);
CREATE INDEX idx_appointments_status ON appointments(workspace_id, status);
CREATE INDEX idx_appointments_starts ON appointments(workspace_id, starts_at);

CREATE INDEX idx_appt_services_appointment ON appointment_services(appointment_id);
CREATE INDEX idx_appt_services_professional ON appointment_services(professional_id, starts_at);

CREATE INDEX idx_avail_blocks_professional ON availability_blocks(professional_id);
CREATE INDEX idx_avail_blocks_range ON availability_blocks(professional_id, start_at, end_at);

CREATE INDEX idx_professionals_workspace ON professionals(workspace_id);
CREATE INDEX idx_services_workspace ON services(workspace_id);

CREATE INDEX idx_payments_appointment ON payments(appointment_id);
CREATE INDEX idx_payments_status ON payments(status);

CREATE INDEX idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);
CREATE INDEX idx_broadcast_recipients_status ON broadcast_recipients(broadcast_id, status);

-- ============================================================
-- TRIGGERS: updated_at automático
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'workspaces', 'whatsapp_numbers', 'professionals',
    'services', 'contacts', 'conversations', 'messages',
    'appointments', 'payments', 'flows', 'ai_configs', 'broadcasts'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      t
    );
  END LOOP;
END;
$$;
