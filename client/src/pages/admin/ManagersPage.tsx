import { useState, useEffect, useCallback } from 'react'
import { adminService } from '@/services/admin'
import { Card, Button, Input } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { UserPlus, KeyRound, ShieldOff, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { formatDate } from '@/utils/format'

interface Manager {
  _id: string
  username: string
  displayName: string
  active: boolean
  createdBy: string | null
  lastLoginAt: string | null
  disputesResolved: number
  createdAt: string
}

export function AdminManagersPage() {
  const [managers, setManagers] = useState<Manager[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  // create form
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { managers } = await adminService.listManagers()
      setManagers(managers)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateErr(null)
    if (password.length < 8) {
      setCreateErr('Пароль должен быть минимум 8 символов')
      return
    }
    setCreating(true)
    try {
      await adminService.createManager({ username, password, displayName })
      setUsername(''); setPassword(''); setDisplayName('')
      setShowCreate(false)
      load()
    } catch (err: any) {
      setCreateErr(err?.response?.data?.error || err?.message || 'Ошибка')
    } finally {
      setCreating(false)
    }
  }

  const handleDisable = async (m: Manager) => {
    if (!confirm(`Отключить менеджера @${m.username}? Он не сможет войти, но история останется.`)) return
    await adminService.disableManager(m._id)
    load()
  }

  const handleEnable = async (m: Manager) => {
    await adminService.enableManager(m._id)
    load()
  }

  const handleReset = async (m: Manager) => {
    const pw = prompt(`Новый пароль для @${m.username} (мин. 8 символов):`)
    if (!pw) return
    if (pw.length < 8) { alert('Пароль слишком короткий'); return }
    try {
      await adminService.resetManagerPassword(m._id, pw)
      alert(`Пароль для @${m.username} обновлён. Передайте его менеджеру лично.`)
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Ошибка')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <UsersIcon size={24} /> Менеджеры
          </h1>
          <p className="text-muted text-sm">
            Менеджеры заходят на <span className="font-mono">/manager/login</span> и видят только споры и чаты, без личных данных сторон.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} variant="default">
          <UserPlus size={18} className="mr-2" />
          {showCreate ? 'Отмена' : 'Создать менеджера'}
        </Button>
      </div>

      {showCreate && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Новый менеджер</h2>
          <form onSubmit={handleCreate} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm text-muted mb-1">Логин (a-z, 0-9, _)</label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={32} />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Имя для отображения (опционально)</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={64} />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Пароль (мин. 8 символов)</label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <p className="text-xs text-muted mt-1">Пароль виден один раз — сохрани и передай менеджеру лично.</p>
            </div>
            {createErr && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{createErr}</div>
            )}
            <Button type="submit" disabled={creating || !username || !password}>
              {creating ? 'Создаём...' : 'Создать'}
            </Button>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : managers.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          Менеджеров пока нет. Создайте первого через кнопку выше или через скрипт <span className="font-mono">scripts/create-manager.js</span>.
        </Card>
      ) : (
        <div className="space-y-2">
          {managers.map((m) => (
            <Card key={m._id} className="p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-mono">@{m.username}</span>
                    {m.displayName && <span className="text-muted text-sm">· {m.displayName}</span>}
                    <Badge variant={m.active ? 'success' : 'default'}>
                      {m.active ? 'Активен' : 'Отключён'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted">
                    Споров решено: <span className="text-white">{m.disputesResolved}</span>
                    {' · '}Создан: {formatDate(m.createdAt)}
                    {m.lastLoginAt && <> · последний вход: {formatDate(m.lastLoginAt)}</>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => handleReset(m)} title="Сбросить пароль">
                    <KeyRound size={16} />
                  </Button>
                  {m.active ? (
                    <Button size="sm" variant="ghost" onClick={() => handleDisable(m)} title="Отключить">
                      <ShieldOff size={16} />
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => handleEnable(m)} title="Включить">
                      <ShieldCheck size={16} />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
