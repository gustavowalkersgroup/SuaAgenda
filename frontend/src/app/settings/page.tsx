'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import {
  Settings, Smartphone, Key, Users, Save,
  CheckCircle, XCircle, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'workspace' | 'whatsapp' | 'ai' | 'payments'>('workspace')

  const tabs = [
    { id: 'workspace', label: 'Workspace', icon: Settings },
    { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
    { id: 'ai', label: 'IA / OpenAI', icon: Key },
    { id: 'payments', label: 'Pagamentos', icon: Users },
  ] as const

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie o seu workspace e integrações</p>
        </div>

        <div className="flex gap-8">
          {/* Tab nav */}
          <nav className="w-44 shrink-0 space-y-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1">
            {tab === 'workspace' && <WorkspaceSettings />}
            {tab === 'whatsapp' && <WhatsAppSettings />}
            {tab === 'ai' && <AISettings />}
            {tab === 'payments' && <PaymentSettings />}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function WorkspaceSettings() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['workspace'],
    queryFn: () => api.get('/workspaces/current').then(r => r.data),
  })
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')

  const save = useMutation({
    mutationFn: (d: object) => api.put('/workspaces/current', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspace'] }); toast.success('Salvo') },
    onError: () => toast.error('Erro ao salvar'),
  })

  if (isLoading) return <PageSpinner />

  return (
    <Card>
      <CardHeader><CardTitle>Dados do workspace</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Input
          label="Nome do workspace"
          value={name || data?.name || ''}
          onChange={e => setName(e.target.value)}
        />
        <Select
          label="Fuso horário"
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
        >
          <option value="America/Sao_Paulo">America/São_Paulo (UTC-3)</option>
          <option value="America/Manaus">America/Manaus (UTC-4)</option>
          <option value="America/Belem">America/Belém (UTC-3)</option>
        </Select>
        <Button onClick={() => save.mutate({ name: name || data?.name, timezone })} loading={save.isPending}>
          <Save size={15} />
          Salvar
        </Button>
      </CardContent>
    </Card>
  )
}

function WhatsAppSettings() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-numbers'],
    queryFn: () => api.get('/whatsapp/numbers').then(r => r.data),
  })
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')

  const add = useMutation({
    mutationFn: (d: object) => api.post('/whatsapp/numbers', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['whatsapp-numbers'] }); setPhone(''); setName(''); toast.success('Número adicionado') },
    onError: () => toast.error('Erro ao adicionar'),
  })

  const numbers = data?.data ?? []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Números conectados</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <PageSpinner /> : numbers.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum número conectado</p>
          ) : (
            <div className="space-y-3">
              {numbers.map((n: { id: string; phoneNumber: string; displayName: string; status: string }) => (
                <div key={n.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{n.displayName}</p>
                    <p className="text-xs text-gray-500">{n.phoneNumber}</p>
                  </div>
                  <Badge className={n.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                    {n.status === 'connected' ? (
                      <span className="flex items-center gap-1"><CheckCircle size={11} /> Conectado</span>
                    ) : (
                      <span className="flex items-center gap-1"><XCircle size={11} /> Desconectado</span>
                    )}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Adicionar número</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input label="Nome de exibição" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Atendimento Principal" />
          <Input label="Número (com DDI)" value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" />
          <Button onClick={() => add.mutate({ phoneNumber: phone, displayName: name })} loading={add.isPending} disabled={!phone || !name}>
            Adicionar número
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function AISettings() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api.get('/ai/config').then(r => r.data),
  })
  const [systemPrompt, setSystemPrompt] = useState('')
  const [model, setModel] = useState('gpt-4o')

  const save = useMutation({
    mutationFn: (d: object) => api.put('/ai/config', d).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-config'] }); toast.success('Configuração salva') },
    onError: () => toast.error('Erro ao salvar'),
  })

  if (isLoading) return <PageSpinner />

  return (
    <Card>
      <CardHeader><CardTitle>Configuração da IA</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Select
          label="Modelo OpenAI"
          value={model}
          onChange={e => setModel(e.target.value)}
        >
          <option value="gpt-4o">GPT-4o (recomendado)</option>
          <option value="gpt-4o-mini">GPT-4o mini (econômico)</option>
          <option value="gpt-4-turbo">GPT-4 Turbo</option>
        </Select>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Prompt do sistema</label>
          <textarea
            value={systemPrompt || data?.systemPrompt || ''}
            onChange={e => setSystemPrompt(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            rows={8}
            placeholder="Você é um assistente de atendimento para..."
          />
        </div>
        <Button onClick={() => save.mutate({ model, systemPrompt: systemPrompt || data?.systemPrompt })} loading={save.isPending}>
          <Save size={15} />
          Salvar
        </Button>
      </CardContent>
    </Card>
  )
}

function PaymentSettings() {
  const [provider, setProvider] = useState('mercadopago')
  const [accessToken, setAccessToken] = useState('')
  const qc = useQueryClient()

  const save = useMutation({
    mutationFn: (d: object) => api.post('/payments/gateway/config', d).then(r => r.data),
    onSuccess: () => { toast.success('Gateway configurado'); setAccessToken('') },
    onError: () => toast.error('Erro ao salvar'),
  })

  return (
    <Card>
      <CardHeader><CardTitle>Gateway de pagamento</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Select
          label="Provedor"
          value={provider}
          onChange={e => setProvider(e.target.value)}
        >
          <option value="mercadopago">MercadoPago</option>
          <option value="asaas">Asaas</option>
        </Select>
        <Input
          label="Access Token / API Key"
          type="password"
          value={accessToken}
          onChange={e => setAccessToken(e.target.value)}
          placeholder="••••••••••••••••"
        />
        <p className="text-xs text-gray-400">
          A chave é criptografada com AES-256 antes de ser armazenada.
        </p>
        <Button
          onClick={() => save.mutate({ provider, accessToken })}
          loading={save.isPending}
          disabled={!accessToken}
        >
          <Save size={15} />
          Salvar configuração
        </Button>
      </CardContent>
    </Card>
  )
}
