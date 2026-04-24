import swaggerJsdoc from 'swagger-jsdoc'

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SaaS Atendimento API',
      version: '1.0.0',
      description: 'API multi-tenant para atendimento via WhatsApp com agendamento inteligente',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Desenvolvimento' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                code: { type: 'string' },
              },
            },
          },
        },
        Paginated: {
          type: 'object',
          properties: {
            data: { type: 'array', items: {} },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            pages: { type: 'integer' },
          },
        },
        Contact: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
            status: { type: 'string', enum: ['novo','em_atendimento','orcamento','agendado','concluido','perdido'] },
            tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } },
          },
        },
        Tag: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            color: { type: 'string' },
          },
        },
        Appointment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['PRE_RESERVADO','CONFIRMADO','CONCLUIDO','CANCELADO','EXPIRADO','NO_SHOW'] },
            starts_at: { type: 'string', format: 'date-time' },
            ends_at: { type: 'string', format: 'date-time' },
            total_price: { type: 'number' },
            deposit_amount: { type: 'number' },
            services: { type: 'array', items: {} },
          },
        },
        Conversation: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['aberta','em_atendimento','fechada','aguardando'] },
            assignee_type: { type: 'string', enum: ['ia','humano'] },
            unread_count: { type: 'integer' },
            contact_name: { type: 'string' },
            contact_phone: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Autenticação e sessão' },
      { name: 'Workspaces', description: 'Gestão de workspaces e membros' },
      { name: 'Contacts', description: 'CRM — contatos e tags' },
      { name: 'Conversations', description: 'Inbox — conversas e mensagens' },
      { name: 'WhatsApp', description: 'Números, envio e webhook' },
      { name: 'Professionals', description: 'Profissionais e bloqueios' },
      { name: 'Services', description: 'Serviços' },
      { name: 'Appointments', description: 'Agendamentos e disponibilidade' },
      { name: 'Payments', description: 'Pagamentos e gateways' },
      { name: 'AI', description: 'Configuração do agente de IA' },
      { name: 'Broadcasts', description: 'Disparos de marketing' },
      { name: 'Waitlist', description: 'Lista de espera / encaixe' },
      { name: 'Flows', description: 'Flow Engine — automações visuais' },
      { name: 'Analytics', description: 'Relatórios e métricas' },
      { name: 'Automations', description: 'Automações de marketing' },
      { name: 'Notifications', description: 'Configuração de notificações' },
    ],
  },
  apis: ['./src/modules/**/*.routes.ts', './src/modules/**/*.routes.js'],
})
