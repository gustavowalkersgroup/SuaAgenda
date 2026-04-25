#!/bin/bash
set -e

# ─────────────────────────────────────────────────
#  SuaAgenda — Setup automático para Ubuntu 22.04
# ─────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[AVISO]${NC} $1"; }
error()   { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║         SuaAgenda — Setup Automático         ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 1. Variáveis ─────────────────────────────────
APP_DIR="/opt/saas-atendimento"
REPO_URL="https://github.com/gustavowalkersgroup/SuaAgenda.git"

# Coleta dados do usuário
echo -e "${BOLD}Vamos configurar o ambiente. Responda as perguntas abaixo:${NC}\n"

read -p "🌐 IP ou domínio do servidor (ex: 3.135.60.244): " SERVER_HOST
read -p "🔑 Sua chave da OpenAI (sk-...): " OPENAI_KEY
read -p "📱 Chave da Evolution API (qualquer string aleatória): " EVOLUTION_KEY

# Gera senhas automáticas
PG_PASS=$(openssl rand -hex 16)
REDIS_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 16) # 32 chars hex = 32 bytes

echo ""
info "Gerando senhas seguras automaticamente..."
success "PostgreSQL password: $PG_PASS"
success "Redis password:      $REDIS_PASS"
success "JWT secret:          gerado"
success "Encryption key:      gerado"
echo ""

# ─── 2. Atualiza sistema ──────────────────────────
info "Atualizando pacotes do sistema..."
sudo apt-get update -qq
sudo apt-get install -y -qq git curl openssl ca-certificates
success "Sistema atualizado"

# ─── 3. Instala Docker ────────────────────────────
if ! command -v docker &> /dev/null; then
  info "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  success "Docker instalado"
else
  success "Docker já instalado: $(docker --version)"
fi

# ─── 4. Clona ou atualiza repositório ─────────────
info "Configurando repositório em $APP_DIR..."
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  info "Repositório já existe — fazendo git pull..."
  cd "$APP_DIR" && git pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
fi
success "Repositório pronto"

cd "$APP_DIR"

# ─── 5. Cria nginx/ssl (vazio por enquanto) ────────
mkdir -p nginx/ssl
info "Pasta nginx/ssl criada"

# ─── 6. Nginx HTTP-only (sem SSL) ─────────────────
info "Configurando nginx (HTTP)..."
cat > nginx/nginx.conf << 'NGINXEOF'
events { worker_connections 1024; }

http {
  upstream api {
    server api:3000;
  }

  server {
    listen 80;
    server_name _;
    client_max_body_size 20M;

    location / {
      proxy_pass         http://api;
      proxy_http_version 1.1;
      proxy_set_header   Upgrade $http_upgrade;
      proxy_set_header   Connection 'upgrade';
      proxy_set_header   Host $host;
      proxy_set_header   X-Real-IP $remote_addr;
      proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header   X-Forwarded-Proto $scheme;
      proxy_cache_bypass $http_upgrade;
      proxy_read_timeout 60s;
    }
  }
}
NGINXEOF
success "nginx.conf configurado"

# ─── 7. Cria .env ─────────────────────────────────
info "Criando arquivo .env..."
cat > .env << EOF
# App
NODE_ENV=production
PORT=3000
APP_URL=http://${SERVER_HOST}

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d

# PostgreSQL
DATABASE_URL=postgresql://postgres:${PG_PASS}@postgres:5432/saas_atendimento
POSTGRES_DB=saas_atendimento
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${PG_PASS}

# Redis
REDIS_URL=redis://:${REDIS_PASS}@redis:6379
REDIS_PASSWORD=${REDIS_PASS}

# Evolution API (WhatsApp)
EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=${EVOLUTION_KEY}

# OpenAI
OPENAI_API_KEY=${OPENAI_KEY}

# Criptografia (32 chars)
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Timezone
TZ=America/Sao_Paulo
EOF
success ".env criado"

# ─── 8. Salva as credenciais geradas ──────────────
cat > ~/credenciais-suaagenda.txt << EOF
========================================
  SuaAgenda — Credenciais geradas
  GUARDE ESTE ARQUIVO COM SEGURANÇA
========================================

Servidor:          http://${SERVER_HOST}
PostgreSQL senha:  ${PG_PASS}
Redis senha:       ${REDIS_PASS}
JWT Secret:        ${JWT_SECRET}
Encryption Key:    ${ENCRYPTION_KEY}
Evolution API Key: ${EVOLUTION_KEY}
OpenAI Key:        ${OPENAI_KEY}

Banco de dados:    saas_atendimento
Usuário DB:        postgres
========================================
EOF
chmod 600 ~/credenciais-suaagenda.txt
success "Credenciais salvas em ~/credenciais-suaagenda.txt"

# ─── 9. Sobe os containers ────────────────────────
info "Subindo containers com Docker Compose..."
sudo docker compose -f docker-compose.prod.yml pull
sudo docker compose -f docker-compose.prod.yml build api
success "Build concluído"

info "Iniciando serviços..."
sudo docker compose -f docker-compose.prod.yml up -d postgres redis
info "Aguardando banco de dados ficar pronto..."
sleep 15

info "Rodando migrations..."
sudo docker compose -f docker-compose.prod.yml run --rm api node dist/db/migrate.js
success "Migrations aplicadas"

info "Subindo todos os serviços..."
sudo docker compose -f docker-compose.prod.yml up -d
success "Containers no ar"

# ─── 10. Status final ─────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════╗"
echo "║           ✅  Setup concluído!               ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "🌐 API:        ${BOLD}http://${SERVER_HOST}${NC}"
echo -e "❤️  Health:    ${BOLD}http://${SERVER_HOST}/health${NC}"
echo -e "📋 Containers: ${BOLD}sudo docker compose -f docker-compose.prod.yml ps${NC}"
echo -e "📜 Logs API:   ${BOLD}sudo docker compose -f docker-compose.prod.yml logs -f api${NC}"
echo ""
warn "Credenciais salvas em: ~/credenciais-suaagenda.txt"
warn "Para adicionar HTTPS depois, rode: sudo bash setup-ssl.sh seudominio.com"
echo ""

# Verifica health
sleep 5
if curl -sf "http://localhost/health" > /dev/null 2>&1; then
  success "API respondendo em http://${SERVER_HOST}/health 🎉"
else
  warn "API ainda inicializando. Aguarde 30s e teste: curl http://${SERVER_HOST}/health"
fi
