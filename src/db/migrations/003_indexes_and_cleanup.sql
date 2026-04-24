-- ============================================================
-- MIGRATION 003: Índices extras para segmentação de broadcasts
-- ============================================================

-- Índice para busca de contatos inativos (broadcasts segmentados por tempo)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_contact_workspace
  ON conversations(workspace_id, contact_id);

-- Índice para waitlist
CREATE INDEX IF NOT EXISTS idx_waitlist_workspace_service
  ON waitlist(workspace_id, service_id, is_active);

CREATE INDEX IF NOT EXISTS idx_waitlist_contact
  ON waitlist(contact_id, is_active);

-- Índice para broadcast recipients
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_pending
  ON broadcast_recipients(broadcast_id, status)
  WHERE status = 'pendente';

-- Índice para pagamentos pendentes
CREATE INDEX IF NOT EXISTS idx_payments_pending
  ON payments(workspace_id, status)
  WHERE status = 'pendente';
