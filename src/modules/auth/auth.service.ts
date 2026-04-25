import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../../db/client'
import { env } from '../../config/env'
import { AuthPayload, UserRole } from '../../shared/types'
import { UnauthorizedError, ConflictError } from '../../shared/errors'

interface RegisterDTO {
  name: string
  email: string
  password: string
  workspaceName?: string
}

interface LoginDTO {
  email: string
  password: string
  workspaceSlug?: string
}

export async function register(dto: RegisterDTO) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [dto.email])
  if (existing.rowCount) throw new ConflictError('E-mail já cadastrado')

  const password = await bcrypt.hash(dto.password, 12)

  // Cria usuário
  const userResult = await query<{ id: string; name: string; email: string }>(
    `INSERT INTO users (name, email, password)
     VALUES ($1, $2, $3)
     RETURNING id, name, email`,
    [dto.name, dto.email, password]
  )
  const user = userResult.rows[0]

  // Cria workspace automaticamente
  const wsName = dto.workspaceName ?? `Workspace de ${dto.name}`
  const slug = wsName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now()
  const wsResult = await query<{ id: string }>(
    `INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
    [wsName, slug]
  )
  const workspaceId = wsResult.rows[0].id

  // Vincula usuário como admin
  await query(
    `INSERT INTO workspace_users (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`,
    [workspaceId, user.id]
  )

  // Retorna token direto
  const payload: AuthPayload = { userId: user.id, workspaceId, role: 'admin' }
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] })

  return { token, user, workspaceId, role: 'admin' }
}

export async function login(dto: LoginDTO) {
  const userResult = await query<{
    id: string
    name: string
    email: string
    password: string
    is_active: boolean
  }>(
    `SELECT id, name, email, password, is_active FROM users WHERE email = $1`,
    [dto.email]
  )

  const user = userResult.rows[0]
  if (!user) throw new UnauthorizedError('Credenciais inválidas')
  if (!user.is_active) throw new UnauthorizedError('Usuário inativo')

  const valid = await bcrypt.compare(dto.password, user.password)
  if (!valid) throw new UnauthorizedError('Credenciais inválidas')

  // Busca workspace do usuário
  let workspaceId: string | null = null
  let role: UserRole = 'atendente'

  if (dto.workspaceSlug) {
    const wsResult = await query<{ id: string; role: UserRole }>(
      `SELECT w.id, wu.role
       FROM workspaces w
       JOIN workspace_users wu ON wu.workspace_id = w.id
       WHERE w.slug = $1 AND wu.user_id = $2 AND wu.is_active = true AND w.is_active = true`,
      [dto.workspaceSlug, user.id]
    )
    if (!wsResult.rowCount) throw new UnauthorizedError('Workspace não encontrado ou sem acesso')
    workspaceId = wsResult.rows[0].id
    role = wsResult.rows[0].role
  } else {
    // Pega o primeiro workspace ativo do usuário
    const wsResult = await query<{ id: string; role: UserRole }>(
      `SELECT w.id, wu.role
       FROM workspaces w
       JOIN workspace_users wu ON wu.workspace_id = w.id
       WHERE wu.user_id = $1 AND wu.is_active = true AND w.is_active = true
       ORDER BY w.created_at ASC LIMIT 1`,
      [user.id]
    )
    if (wsResult.rowCount) {
      workspaceId = wsResult.rows[0].id
      role = wsResult.rows[0].role
    }
  }

  if (!workspaceId) throw new UnauthorizedError('Nenhum workspace disponível')

  const payload: AuthPayload = { userId: user.id, workspaceId, role }
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] })

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email },
    workspaceId,
    role,
  }
}

export async function getUserWorkspaces(userId: string) {
  const result = await query<{ id: string; name: string; slug: string; role: UserRole }>(
    `SELECT w.id, w.name, w.slug, wu.role
     FROM workspaces w
     JOIN workspace_users wu ON wu.workspace_id = w.id
     WHERE wu.user_id = $1 AND wu.is_active = true AND w.is_active = true
     ORDER BY w.name`,
    [userId]
  )
  return result.rows
}
