'use client'
import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import {
  useContacts, useContact, useCreateContact,
  useUpdateContact, useContactAppointments,
} from '@/hooks/useContacts'
import { formatPhone, formatDate, formatCurrency, statusLabel, statusColor, cn } from '@/lib/utils'
import {
  Search, Plus, ChevronLeft, ChevronRight,
  Phone, Mail, Calendar, MessageSquare, Tag, User,
} from 'lucide-react'
import toast from 'react-hot-toast'

type Contact = {
  id: string
  name: string
  phone: string
  email?: string
  status: string
  tags: { id: string; name: string; color: string }[]
  createdAt: string
  lastInteraction?: string
}

type Appt = {
  id: string
  startAt: string
  status: string
  services: { name: string }[]
  professional: { name: string }
}

function ContactRow({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  return (
    <tr
      className="hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={contact.name} size="md" />
          <div>
            <p className="font-medium text-gray-900 text-sm">{contact.name}</p>
            <p className="text-xs text-gray-400">{formatPhone(contact.phone)}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <p className="text-sm text-gray-600">{contact.email ?? '—'}</p>
      </td>
      <td className="px-6 py-4">
        <Badge className={statusColor(contact.status)}>{statusLabel(contact.status)}</Badge>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-wrap gap-1">
          {contact.tags?.slice(0, 3).map(tag => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: tag.color + '20', color: tag.color }}
            >
              <Tag size={9} />
              {tag.name}
            </span>
          ))}
          {contact.tags?.length > 3 && (
            <span className="text-xs text-gray-400">+{contact.tags.length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-gray-400">
        {contact.createdAt ? formatDate(contact.createdAt) : '—'}
      </td>
    </tr>
  )
}

function ContactDetail({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const { data: contact, isLoading } = useContact(contactId)
  const { data: apptData } = useContactAppointments(contactId)
  const update = useUpdateContact()
  const [editStatus, setEditStatus] = useState('')

  if (isLoading) return <PageSpinner />
  if (!contact) return null

  const c = contact as Contact
  const appointments: Appt[] = apptData?.data ?? []

  async function handleStatusChange(status: string) {
    try {
      await update.mutateAsync({ id: contactId, status })
      setEditStatus('')
      toast.success('Status atualizado')
    } catch {
      toast.error('Erro ao atualizar status')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Avatar name={c.name} size="lg" />
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">{c.name}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <Phone size={13} />{formatPhone(c.phone)}
            </span>
            {c.email && (
              <span className="flex items-center gap-1 text-sm text-gray-500">
                <Mail size={13} />{c.email}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge className={statusColor(c.status)}>{statusLabel(c.status)}</Badge>
            <select
              value={editStatus || c.status}
              onChange={e => handleStatusChange(e.target.value)}
              className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
            >
              <option value="lead">Lead</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="bloqueado">Bloqueado</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <MessageSquare size={14} />
            Conversa
          </Button>
          <Button variant="outline" size="sm">
            <Calendar size={14} />
            Agendar
          </Button>
        </div>
      </div>

      {/* Tags */}
      {c.tags?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Tags</p>
          <div className="flex flex-wrap gap-2">
            {c.tags.map(tag => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium"
                style={{ backgroundColor: tag.color + '20', color: tag.color }}
              >
                <Tag size={11} />
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Appointment history */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Histórico de agendamentos</p>
        {appointments.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum agendamento</p>
        ) : (
          <div className="space-y-2">
            {appointments.map(a => (
              <div
                key={a.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 text-sm"
              >
                <div className="flex items-center gap-3">
                  <Calendar size={15} className="text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-800">
                      {a.services.map(s => s.name).join(', ')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDate(a.startAt)} — {a.professional.name}
                    </p>
                  </div>
                </div>
                <Badge className={statusColor(a.status)}>{statusLabel(a.status)}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
        <div>
          <p className="text-xs text-gray-400">Criado em</p>
          <p className="text-sm font-medium text-gray-700 mt-0.5">{formatDate(c.createdAt)}</p>
        </div>
        {c.lastInteraction && (
          <div>
            <p className="text-xs text-gray-400">Última interação</p>
            <p className="text-sm font-medium text-gray-700 mt-0.5">{formatDate(c.lastInteraction)}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CRMPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const { data, isLoading } = useContacts({ search, status, page })
  const createContact = useCreateContact()

  const contacts: Contact[] = data?.data ?? []
  const total: number = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  async function handleCreate() {
    if (!newName || !newPhone) return
    try {
      await createContact.mutateAsync({ name: newName, phone: newPhone, email: newEmail || undefined })
      toast.success('Contato criado!')
      setShowCreate(false)
      setNewName('')
      setNewPhone('')
      setNewEmail('')
    } catch {
      toast.error('Erro ao criar contato')
    }
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">CRM — Contatos</h1>
            <p className="text-sm text-gray-500 mt-1">
              {total} contato{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Novo contato
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            leftIcon={<Search size={15} />}
            className="flex-1 max-w-md"
          />
          <Select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="w-44"
          >
            <option value="">Todos os status</option>
            <option value="lead">Lead</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="bloqueado">Bloqueado</option>
          </Select>
        </div>

        {/* Table */}
        <Card>
          {isLoading ? (
            <PageSpinner />
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <User size={40} className="opacity-20 mb-3" />
              <p className="font-medium">Nenhum contato encontrado</p>
              <p className="text-sm mt-1">Tente ajustar os filtros</p>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="px-6 py-3 text-left font-medium">Contato</th>
                    <th className="px-6 py-3 text-left font-medium">E-mail</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-left font-medium">Tags</th>
                    <th className="px-6 py-3 text-left font-medium">Criado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {contacts.map(c => (
                    <ContactRow
                      key={c.id}
                      contact={c}
                      onClick={() => setSelectedId(c.id)}
                    />
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                  <p className="text-sm text-gray-400">
                    Página {page} de {totalPages} — {total} contatos
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      <ChevronLeft size={15} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === totalPages}
                      onClick={() => setPage(p => p + 1)}
                    >
                      <ChevronRight size={15} />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Contact detail modal */}
      <Modal
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        size="lg"
      >
        {selectedId && (
          <ContactDetail contactId={selectedId} onClose={() => setSelectedId(null)} />
        )}
      </Modal>

      {/* Create modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Novo contato"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Nome *"
            placeholder="Nome completo"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <Input
            label="Telefone (WhatsApp) *"
            placeholder="5511999999999"
            value={newPhone}
            onChange={e => setNewPhone(e.target.value)}
          />
          <Input
            label="E-mail"
            type="email"
            placeholder="email@exemplo.com"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
          />
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowCreate(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreate}
              loading={createContact.isPending}
              disabled={!newName || !newPhone}
            >
              Criar contato
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  )
}
