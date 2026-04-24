'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', password: '', workspaceName: '',
  })

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', form)
      setAuth(
        { id: data.user.id, name: data.user.name, email: data.user.email, role: data.user.role, workspaceId: data.user.workspaceId },
        data.token
      )
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Erro ao criar conta'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600 mb-4">
            <MessageSquare size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Criar conta</h1>
          <p className="text-gray-500 mt-1 text-sm">Configure seu workspace em minutos</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Seu nome" placeholder="Maria Silva" value={form.name} onChange={set('name')} required />
            <Input label="Nome do workspace" placeholder="Barbearia Silva" value={form.workspaceName} onChange={set('workspaceName')} required />
            <Input label="E-mail" type="email" placeholder="voce@empresa.com" value={form.email} onChange={set('email')} required />
            <Input label="Senha" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Criar conta grátis
            </Button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-6">
            Já tem conta?{' '}
            <a href="/login" className="text-primary-600 hover:underline">Entrar</a>
          </p>
        </div>
      </div>
    </div>
  )
}
