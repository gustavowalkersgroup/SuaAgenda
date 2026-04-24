'use client'
import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { useFlows, useUpsertFlow, useUpdateFlow, useDeleteFlow } from '@/hooks/useFlows'
import { formatRelative, cn } from '@/lib/utils'
import {
  Plus, Trash2, Pencil, Play, ChevronRight, ChevronDown,
  MessageSquare, AlignLeft, GitBranch, Zap, Bot,
  Clock, Type, RotateCcw, GripVertical, X, Save,
  ArrowDown, Circle, CheckCircle2, ToggleLeft, ToggleRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
function shortId() { return Math.random().toString(36).slice(2, 9) }

// ─── Node types ─────────────────────────────────────────────────────────────────
const NODE_TYPES = {
  message: {
    label: 'Mensagem',
    icon: MessageSquare,
    color: 'bg-blue-50 border-blue-300 text-blue-700',
    dot: 'bg-blue-500',
    description: 'Envia uma mensagem de texto',
  },
  input: {
    label: 'Aguardar resposta',
    icon: AlignLeft,
    color: 'bg-purple-50 border-purple-300 text-purple-700',
    dot: 'bg-purple-500',
    description: 'Aguarda a resposta do contato',
  },
  condition: {
    label: 'Condição',
    icon: GitBranch,
    color: 'bg-orange-50 border-orange-300 text-orange-700',
    dot: 'bg-orange-500',
    description: 'Bifurca o fluxo com base em uma regra',
  },
  action: {
    label: 'Ação',
    icon: Zap,
    color: 'bg-green-50 border-green-300 text-green-700',
    dot: 'bg-green-500',
    description: 'Executa uma ação no sistema',
  },
  ai: {
    label: 'IA',
    icon: Bot,
    color: 'bg-indigo-50 border-indigo-300 text-indigo-700',
    dot: 'bg-indigo-500',
    description: 'Processa com o agente de IA',
  },
  delay: {
    label: 'Aguardar',
    icon: Clock,
    color: 'bg-yellow-50 border-yellow-300 text-yellow-700',
    dot: 'bg-yellow-500',
    description: 'Pausa o fluxo por X segundos',
  },
  typing: {
    label: 'Digitando...',
    icon: Type,
    color: 'bg-gray-50 border-gray-300 text-gray-700',
    dot: 'bg-gray-400',
    description: 'Mostra o indicador de digitação',
  },
  follow_up: {
    label: 'Follow-up',
    icon: RotateCcw,
    color: 'bg-pink-50 border-pink-300 text-pink-700',
    dot: 'bg-pink-500',
    description: 'Reagenda mensagem se não houver resposta',
  },
} as const

type NodeType = keyof typeof NODE_TYPES

type FlowNode = {
  id: string
  type: NodeType
  data: Record<string, unknown>
  nextNodeId?: string
  conditionTrue?: string
  conditionFalse?: string
}

type Flow = {
  id: string
  name: string
  triggerType: string
  isActive: boolean
  nodes: FlowNode[]
  createdAt: string
  updatedAt?: string
}

const TRIGGER_TYPES = [
  { value: 'inbound_message', label: 'Mensagem recebida' },
  { value: 'keyword', label: 'Palavra-chave' },
  { value: 'contact_created', label: 'Novo contato' },
  { value: 'appointment_confirmed', label: 'Agendamento confirmado' },
  { value: 'appointment_cancelled', label: 'Agendamento cancelado' },
  { value: 'manual', label: 'Manual' },
]

const ACTION_TYPES = [
  { value: 'assign_human', label: 'Transferir para humano' },
  { value: 'assign_ai', label: 'Transferir para IA' },
  { value: 'add_tag', label: 'Adicionar tag' },
  { value: 'remove_tag', label: 'Remover tag' },
  { value: 'update_status', label: 'Atualizar status do contato' },
  { value: 'create_appointment', label: 'Criar agendamento' },
  { value: 'close_conversation', label: 'Encerrar conversa' },
]

// ─── Node editor form ──────────────────────────────────────────────────────────
function NodeEditor({
  node, allNodes, onChange, onDelete,
}: {
  node: FlowNode
  allNodes: FlowNode[]
  onChange: (updated: FlowNode) => void
  onDelete: () => void
}) {
  const meta = NODE_TYPES[node.type]
  const Icon = meta.icon
  const [expanded, setExpanded] = useState(true)

  function setData(key: string, value: unknown) {
    onChange({ ...node, data: { ...node.data, [key]: value } })
  }

  const otherNodes = allNodes.filter(n => n.id !== node.id)

  return (
    <div className={cn('rounded-xl border-2 transition-all', meta.color)}>
      {/* Node header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={cn('p-1.5 rounded-lg bg-white/70')}>
          <Icon size={15} />
        </div>
        <span className="text-sm font-semibold flex-1">{meta.label}</span>
        <span className="text-xs opacity-60 mr-2">{node.id.slice(0, 6)}</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-1 rounded-md opacity-50 hover:opacity-100 hover:bg-white/50"
        >
          <X size={13} />
        </button>
        {expanded ? <ChevronDown size={14} className="opacity-60" /> : <ChevronRight size={14} className="opacity-60" />}
      </div>

      {/* Node body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-current/10">
          {/* message */}
          {node.type === 'message' && (
            <div className="pt-3">
              <label className="text-xs font-medium opacity-70 block mb-1">Texto da mensagem</label>
              <textarea
                value={String(node.data.text ?? '')}
                onChange={e => setData('text', e.target.value)}
                className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-current/30 resize-none"
                rows={3}
                placeholder="Olá {{nome}}! Como posso ajudar?"
              />
              <p className="text-xs opacity-50 mt-1">Use {'{{nome}}'}, {'{{primeiro_nome}}'}</p>
            </div>
          )}

          {/* input */}
          {node.type === 'input' && (
            <div className="pt-3 space-y-3">
              <div>
                <label className="text-xs font-medium opacity-70 block mb-1">Salvar resposta em variável</label>
                <input
                  value={String(node.data.variable ?? '')}
                  onChange={e => setData('variable', e.target.value)}
                  className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                  placeholder="Ex: nome_cliente"
                />
              </div>
              <div>
                <label className="text-xs font-medium opacity-70 block mb-1">Timeout (segundos, 0 = sem limite)</label>
                <input
                  type="number"
                  value={Number(node.data.timeoutSeconds ?? 0)}
                  onChange={e => setData('timeoutSeconds', Number(e.target.value))}
                  className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                  min={0}
                />
              </div>
            </div>
          )}

          {/* condition */}
          {node.type === 'condition' && (
            <div className="pt-3 space-y-3">
              <div>
                <label className="text-xs font-medium opacity-70 block mb-1">Variável</label>
                <input
                  value={String(node.data.variable ?? '')}
                  onChange={e => setData('variable', e.target.value)}
                  className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                  placeholder="Ex: nome_cliente"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium opacity-70 block mb-1">Operador</label>
                  <select
                    value={String(node.data.operator ?? 'equals')}
                    onChange={e => setData('operator', e.target.value)}
                    className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="equals">Igual a</option>
                    <option value="contains">Contém</option>
                    <option value="starts_with">Começa com</option>
                    <option value="is_empty">Está vazio</option>
                    <option value="not_empty">Não está vazio</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium opacity-70 block mb-1">Valor</label>
                  <input
                    value={String(node.data.value ?? '')}
                    onChange={e => setData('value', e.target.value)}
                    className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                    placeholder="Valor"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium opacity-70 block mb-1">✅ Se verdadeiro → nó</label>
                  <select
                    value={node.conditionTrue ?? ''}
                    onChange={e => onChange({ ...node, conditionTrue: e.target.value || undefined })}
                    className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">Fim do fluxo</option>
                    {otherNodes.map(n => (
                      <option key={n.id} value={n.id}>{NODE_TYPES[n.type].label} ({n.id.slice(0, 6)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium opacity-70 block mb-1">❌ Se falso → nó</label>
                  <select
                    value={node.conditionFalse ?? ''}
                    onChange={e => onChange({ ...node, conditionFalse: e.target.value || undefined })}
                    className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">Fim do fluxo</option>
                    {otherNodes.map(n => (
                      <option key={n.id} value={n.id}>{NODE_TYPES[n.type].label} ({n.id.slice(0, 6)})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* action */}
          {node.type === 'action' && (
            <div className="pt-3 space-y-3">
              <div>
                <label className="text-xs font-medium opacity-70 block mb-1">Tipo de ação</label>
                <select
                  value={String(node.data.actionType ?? 'assign_human')}
                  onChange={e => setData('actionType', e.target.value)}
                  className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                >
                  {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              {['add_tag', 'remove_tag'].includes(String(node.data.actionType)) && (
                <div>
                  <label className="text-xs font-medium opacity-70 block mb-1">Nome da tag</label>
                  <input
                    value={String(node.data.tag ?? '')}
                    onChange={e => setData('tag', e.target.value)}
                    className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                    placeholder="vip"
                  />
                </div>
              )}
              {String(node.data.actionType) === 'update_status' && (
                <div>
                  <label className="text-xs font-medium opacity-70 block mb-1">Novo status</label>
                  <select
                    value={String(node.data.status ?? 'ativo')}
                    onChange={e => setData('status', e.target.value)}
                    className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="lead">Lead</option>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    <option value="bloqueado">Bloqueado</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ai */}
          {node.type === 'ai' && (
            <div className="pt-3">
              <label className="text-xs font-medium opacity-70 block mb-1">Instrução adicional para a IA</label>
              <textarea
                value={String(node.data.instruction ?? '')}
                onChange={e => setData('instruction', e.target.value)}
                className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none resize-none"
                rows={2}
                placeholder="Ex: Foque em oferecer o serviço X nesta etapa"
              />
            </div>
          )}

          {/* delay */}
          {node.type === 'delay' && (
            <div className="pt-3">
              <label className="text-xs font-medium opacity-70 block mb-1">Aguardar (segundos)</label>
              <input
                type="number"
                min={1}
                value={Number(node.data.seconds ?? 3)}
                onChange={e => setData('seconds', Number(e.target.value))}
                className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}

          {/* typing */}
          {node.type === 'typing' && (
            <div className="pt-3">
              <label className="text-xs font-medium opacity-70 block mb-1">Duração do indicador (segundos)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={Number(node.data.seconds ?? 2)}
                onChange={e => setData('seconds', Number(e.target.value))}
                className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}

          {/* follow_up */}
          {node.type === 'follow_up' && (
            <div className="pt-3 space-y-3">
              <div>
                <label className="text-xs font-medium opacity-70 block mb-1">Aguardar resposta por (minutos)</label>
                <input
                  type="number"
                  min={1}
                  value={Number(node.data.waitMinutes ?? 60)}
                  onChange={e => setData('waitMinutes', Number(e.target.value))}
                  className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium opacity-70 block mb-1">Mensagem de follow-up</label>
                <textarea
                  value={String(node.data.text ?? '')}
                  onChange={e => setData('text', e.target.value)}
                  className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none resize-none"
                  rows={2}
                  placeholder="Ainda está por aí? Posso ajudar?"
                />
              </div>
            </div>
          )}

          {/* Next node (for non-condition types) */}
          {node.type !== 'condition' && (
            <div className="pt-1">
              <label className="text-xs font-medium opacity-70 block mb-1">Próximo nó</label>
              <select
                value={node.nextNodeId ?? ''}
                onChange={e => onChange({ ...node, nextNodeId: e.target.value || undefined })}
                className="w-full rounded-lg border bg-white/70 px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">Fim do fluxo</option>
                {otherNodes.map(n => (
                  <option key={n.id} value={n.id}>{NODE_TYPES[n.type].label} ({n.id.slice(0, 6)})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Flow editor modal ─────────────────────────────────────────────────────────
function FlowEditor({
  initial, onSave, onClose, loading,
}: {
  initial?: Partial<Flow>
  onSave: (data: object) => void
  onClose: () => void
  loading: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [triggerType, setTriggerType] = useState(initial?.triggerType ?? 'inbound_message')
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)
  const [nodes, setNodes] = useState<FlowNode[]>(initial?.nodes ?? [])
  const [showPicker, setShowPicker] = useState(false)

  function addNode(type: NodeType) {
    const newNode: FlowNode = { id: `node_${shortId()}`, type, data: {} }
    setNodes(prev => [...prev, newNode])
    setShowPicker(false)
  }

  function updateNode(idx: number, updated: FlowNode) {
    setNodes(prev => prev.map((n, i) => i === idx ? updated : n))
  }

  function deleteNode(idx: number) {
    const deletedId = nodes[idx].id
    setNodes(prev => prev
      .filter((_, i) => i !== idx)
      .map(n => ({
        ...n,
        nextNodeId: n.nextNodeId === deletedId ? undefined : n.nextNodeId,
        conditionTrue: n.conditionTrue === deletedId ? undefined : n.conditionTrue,
        conditionFalse: n.conditionFalse === deletedId ? undefined : n.conditionFalse,
      }))
    )
  }

  function moveNode(idx: number, dir: -1 | 1) {
    const arr = [...nodes]
    const target = idx + dir
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]]
    setNodes(arr)
  }

  return (
    <div className="flex flex-col gap-0 -m-6">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-4">
        <div className="flex-1">
          <Input
            placeholder="Nome do fluxo *"
            value={name}
            onChange={e => setName(e.target.value)}
            className="font-semibold text-lg border-0 bg-transparent px-0 focus:ring-0 shadow-none text-gray-900 placeholder-gray-400"
          />
        </div>
        <Select value={triggerType} onChange={e => setTriggerType(e.target.value)} className="w-52">
          {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <button onClick={() => setIsActive(v => !v)}>
          {isActive
            ? <ToggleRight size={28} className="text-primary-600" />
            : <ToggleLeft size={28} className="text-gray-400" />}
        </button>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
        <Button
          size="sm"
          onClick={() => onSave({ name, triggerType, isActive, nodes })}
          loading={loading}
          disabled={!name || nodes.length === 0}
        >
          <Save size={14} /> Salvar
        </Button>
      </div>

      <div className="flex gap-0 min-h-[520px]">
        {/* Canvas */}
        <div className="flex-1 overflow-y-auto p-6 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-[size:20px_20px]">
          {nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 min-h-[300px]">
              <Circle size={40} className="opacity-20 mb-3" />
              <p className="font-medium text-sm">Nenhum nó adicionado</p>
              <p className="text-xs mt-1">Clique em um tipo de nó para começar</p>
            </div>
          ) : (
            <div className="max-w-xl mx-auto space-y-2">
              {/* Start marker */}
              <div className="flex items-center justify-center mb-4">
                <div className="flex items-center gap-2 bg-primary-600 text-white px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm">
                  <Play size={11} />
                  Início do fluxo
                </div>
              </div>

              {nodes.map((node, idx) => (
                <div key={node.id} className="relative">
                  {/* Connector */}
                  {idx > 0 && (
                    <div className="flex justify-center mb-1">
                      <ArrowDown size={16} className="text-gray-300" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    {/* Reorder */}
                    <div className="flex flex-col gap-1 justify-start pt-3">
                      <button onClick={() => moveNode(idx, -1)} disabled={idx === 0} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-0">
                        <ChevronRight size={13} className="-rotate-90" />
                      </button>
                      <button onClick={() => moveNode(idx, 1)} disabled={idx === nodes.length - 1} className="p-1 text-gray-300 hover:text-gray-500 disabled:opacity-0">
                        <ChevronRight size={13} className="rotate-90" />
                      </button>
                    </div>
                    <div className="flex-1">
                      <NodeEditor
                        node={node}
                        allNodes={nodes}
                        onChange={updated => updateNode(idx, updated)}
                        onDelete={() => deleteNode(idx)}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* End marker */}
              <div className="flex items-center justify-center mt-4">
                <div className="flex items-center gap-2 bg-gray-200 text-gray-600 px-4 py-1.5 rounded-full text-xs font-semibold">
                  <CheckCircle2 size={11} />
                  Fim do fluxo
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Node picker sidebar */}
        <div className="w-56 border-l border-gray-200 bg-white p-4 shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Adicionar nó</p>
          <div className="space-y-1.5">
            {(Object.entries(NODE_TYPES) as [NodeType, typeof NODE_TYPES[NodeType]][]).map(([type, meta]) => {
              const Icon = meta.icon
              return (
                <button
                  key={type}
                  onClick={() => addNode(type)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all hover:shadow-sm',
                    meta.color
                  )}
                >
                  <Icon size={14} />
                  {meta.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Flow list card ────────────────────────────────────────────────────────────
function FlowCard({
  flow, onEdit, onDelete,
}: { flow: Flow; onEdit: () => void; onDelete: () => void }) {
  const triggerLabel = TRIGGER_TYPES.find(t => t.value === flow.triggerType)?.label ?? flow.triggerType
  const nodeCount = flow.nodes?.length ?? 0

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onEdit}>
      <CardContent className="py-4">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-primary-50 rounded-xl shrink-0">
            <GitBranch size={18} className="text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-sm truncate">{flow.name}</h3>
              <Badge className={flow.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                {flow.isActive ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Zap size={11} /> {triggerLabel}
              </span>
              <span className="flex items-center gap-1">
                <Circle size={11} /> {nodeCount} nó{nodeCount !== 1 ? 's' : ''}
              </span>
              <span>{formatRelative(flow.createdAt)}</span>
            </div>

            {/* Node type pills */}
            {nodeCount > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {[...new Set(flow.nodes.map(n => n.type))].map(type => {
                  const meta = NODE_TYPES[type]
                  const Icon = meta.icon
                  return (
                    <span
                      key={type}
                      className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border', meta.color)}
                    >
                      <Icon size={9} /> {meta.label}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function FlowsPage() {
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<Flow | null>(null)

  const { data, isLoading } = useFlows()
  const upsertFlow = useUpsertFlow()
  const updateFlow = useUpdateFlow()
  const deleteFlow = useDeleteFlow()

  const flows: Flow[] = data?.data ?? data ?? []

  async function handleSave(formData: object) {
    try {
      if (editing) {
        await updateFlow.mutateAsync({ id: editing.id, ...formData })
        toast.success('Fluxo atualizado!')
      } else {
        await upsertFlow.mutateAsync(formData)
        toast.success('Fluxo criado!')
      }
      setShowEditor(false)
      setEditing(null)
    } catch {
      toast.error('Erro ao salvar fluxo')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este fluxo?')) return
    try {
      await deleteFlow.mutateAsync(id)
      toast.success('Fluxo removido')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  function openCreate() { setEditing(null); setShowEditor(true) }
  function openEdit(flow: Flow) { setEditing(flow); setShowEditor(true) }

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flow Engine</h1>
            <p className="text-sm text-gray-500 mt-0.5">Automatize conversas com fluxos visuais</p>
          </div>
          <Button onClick={openCreate}>
            <Plus size={16} /> Novo fluxo
          </Button>
        </div>

        {/* Node type legend */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tipos de nó disponíveis</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(NODE_TYPES) as [NodeType, typeof NODE_TYPES[NodeType]][]).map(([type, meta]) => {
                const Icon = meta.icon
                return (
                  <div
                    key={type}
                    className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium', meta.color)}
                    title={meta.description}
                  >
                    <Icon size={12} />
                    {meta.label}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Flows list */}
        {isLoading ? (
          <PageSpinner />
        ) : flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <GitBranch size={48} className="opacity-20 mb-4" />
            <p className="font-medium">Nenhum fluxo criado</p>
            <p className="text-sm mt-1">Crie fluxos para automatizar suas conversas de WhatsApp</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus size={15} /> Criar primeiro fluxo
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {flows.map(flow => (
              <FlowCard
                key={flow.id}
                flow={flow}
                onEdit={() => openEdit(flow)}
                onDelete={() => handleDelete(flow.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Editor modal — full width */}
      <Modal
        open={showEditor}
        onClose={() => { setShowEditor(false); setEditing(null) }}
        size="lg"
      >
        {showEditor && (
          <FlowEditor
            initial={editing ?? undefined}
            onSave={handleSave}
            onClose={() => { setShowEditor(false); setEditing(null) }}
            loading={upsertFlow.isPending || updateFlow.isPending}
          />
        )}
      </Modal>
    </AppLayout>
  )
}
