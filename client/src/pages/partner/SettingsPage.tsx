import { useState, useEffect, useRef } from 'react'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { partnerService } from '@/services/partner'
import { Input } from '@/components/ui'
import {
  Eye, EyeOff, CheckCircle2, AlertCircle, Wallet, ExternalLink,
  Shield, X, Loader2, ArrowRight,
} from 'lucide-react'

function MaskedAddress({ addr }: { addr: string }) {
  if (!addr || addr.length < 12) return <>{addr}</>
  return (
    <>
      {addr.slice(0, 6)}
      <span className="hidden sm:inline">••••••••••••••••••••••</span>
      <span className="sm:hidden">••••••</span>
      {addr.slice(-6)}
    </>
  )
}

type ModalStep = 'password' | 'address' | 'verifying' | null

export function PartnerSettingsPage() {
  const { platform } = usePartnerAuth()

  // Password change
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' })
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')

  // Wallet
  const [savedWallet, setSavedWallet] = useState<string | null>(null)
  const [walletLoading, setWalletLoading] = useState(true)

  // Modal
  const [modalStep, setModalStep] = useState<ModalStep>(null)
  const [modalPassword, setModalPassword] = useState('')
  const [modalAddress, setModalAddress] = useState('')
  const [modalError, setModalError] = useState('')
  const [showModalPw, setShowModalPw] = useState(false)
  const addressRef = useRef<HTMLInputElement>(null)

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    partnerService.getWithdrawals().then((data) => {
      setSavedWallet(data.walletAddress)
    }).catch(() => {}).finally(() => setWalletLoading(false))
  }, [])

  // Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')

    if (!passwords.current || !passwords.new || !passwords.confirm) { setPwError('Заполните все поля'); return }
    if (passwords.new.length < 6) { setPwError('Минимум 6 символов'); return }
    if (passwords.new !== passwords.confirm) { setPwError('Пароли не совпадают'); return }

    setPwLoading(true)
    try {
      await partnerService.updatePassword(passwords.current, passwords.new)
      setPasswords({ current: '', new: '', confirm: '' })
      showToast('success', 'Пароль успешно изменён')
    } catch (err: any) {
      setPwError(err?.response?.data?.error || 'Ошибка смены пароля')
    } finally {
      setPwLoading(false)
    }
  }

  // Wallet modal
  const openWalletModal = () => {
    setModalPassword('')
    setModalAddress('')
    setModalError('')
    setShowModalPw(false)
    setModalStep('password')
  }

  const handleModalPasswordNext = () => {
    if (!modalPassword.trim()) {
      setModalError('Введите пароль')
      return
    }
    setModalError('')
    setModalStep('address')
    setTimeout(() => addressRef.current?.focus(), 100)
  }

  const handleModalSubmit = async () => {
    if (!modalAddress || !modalAddress.startsWith('T') || modalAddress.length !== 34) {
      setModalError('Введите корректный адрес TRC-20')
      return
    }

    setModalError('')
    setModalStep('verifying')

    try {
      await partnerService.updateWallet(modalAddress, modalPassword)
      setSavedWallet(modalAddress)
      setModalStep(null)
      showToast('success', 'Кошелёк успешно сохранён')
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Ошибка сохранения'
      if (err?.response?.status === 403) {
        setModalStep('password')
        setModalError('Неверный пароль')
      } else {
        setModalStep('address')
        setModalError(msg)
      }
    }
  }

  const togglePassword = (field: 'current' | 'new' | 'confirm') => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-medium p-text">Настройки</h1>
      </div>

      {/* Account info */}
      <div className="mb-10">
        <h2 className="text-[11px] uppercase tracking-widest p-text-muted mb-4">Аккаунт</h2>
        <div className="divide-y [&>*]:border-[var(--p-divider)]">
          {[
            ['Название', platform?.name],
            ['Код', <span key="code" className="font-mono" style={{ color: 'var(--p-btn-accent)' }}>{platform?.code}</span>],
            ['Логин', platform?.login],
            ['Комиссия', `${platform?.commissionPercent || 0}%`],
            ['Telegram канал', platform?.telegramChannel || '—'],
            ['Статус', <span key="status" className={platform?.isActive ? 'text-emerald-500' : 'text-red-400'}>{platform?.isActive ? 'Активен' : 'Неактивен'}</span>],
          ].map(([label, value], i) => (
            <div key={i} className="flex items-center justify-between py-3.5">
              <span className="text-sm p-text-secondary">{label}</span>
              <span className="text-sm p-text">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Wallet */}
      <div className="border-t border-[var(--p-divider)] pt-8 mb-10">
        <h2 className="text-[11px] uppercase tracking-widest p-text-muted mb-2">Кошелёк для выплат</h2>
        <p className="text-xs p-text-faint mb-5">Адрес TRC-20 для получения партнёрской комиссии</p>

        {walletLoading ? (
          <div className="flex items-center gap-2 p-text-faint">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-sm">Загрузка...</span>
          </div>
        ) : savedWallet ? (
          <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--p-divider)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--p-avatar-bg)' }}>
                <Wallet size={14} className="p-text-muted" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-mono p-text"><MaskedAddress addr={savedWallet} /></p>
                <p className="text-[11px] p-text-faint">TRON (TRC-20)</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <a
                href={`https://tronscan.org/#/address/${savedWallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg transition-colors hover:opacity-70 p-text-muted"
              >
                <ExternalLink size={14} />
              </a>
              <button
                onClick={openWalletModal}
                className="text-xs px-3 py-1.5 rounded-full transition-colors"
                style={{ background: 'var(--p-btn-bg)', color: 'var(--p-btn-text)' }}
              >
                Сменить
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={openWalletModal}
            className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-full transition-colors"
            style={{ background: 'var(--p-btn-accent)', color: 'var(--p-btn-accent-text)' }}
          >
            <Wallet size={15} />
            Установить адрес
          </button>
        )}
      </div>

      {/* Stats */}
      {platform?.stats && (
        <div className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest p-text-muted mb-4">Статистика</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4">
            <div>
              <p className="text-2xl font-light p-text">{platform.stats.totalUsers}</p>
              <p className="text-xs p-text-muted">Пользователей</p>
            </div>
            <div>
              <p className="text-2xl font-light p-text">{platform.stats.totalDeals}</p>
              <p className="text-xs p-text-muted">Сделок</p>
            </div>
            <div>
              <p className="text-2xl font-light p-text">{platform.stats.totalVolume?.toLocaleString()}</p>
              <p className="text-xs p-text-muted">Оборот (USDT)</p>
            </div>
            <div>
              <p className="text-2xl font-light" style={{ color: 'var(--p-btn-accent)' }}>{platform.stats.totalCommission?.toLocaleString()}</p>
              <p className="text-xs p-text-muted">Комиссия (USDT)</p>
            </div>
          </div>
        </div>
      )}

      {/* Password */}
      <div className="border-t border-[var(--p-divider)] pt-8">
        <h2 className="text-[11px] uppercase tracking-widest p-text-muted mb-5">Смена пароля</h2>

        {pwError && (
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={14} className="text-red-400" />
            <p className="text-sm text-red-400">{pwError}</p>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
          {(['current', 'new', 'confirm'] as const).map((field) => (
            <div key={field}>
              <label className="block text-xs p-text-muted mb-1.5">
                {field === 'current' ? 'Текущий пароль' : field === 'new' ? 'Новый пароль' : 'Подтверждение'}
              </label>
              <div className="relative">
                <Input
                  type={showPasswords[field] ? 'text' : 'password'}
                  value={passwords[field]}
                  onChange={(e) => setPasswords({ ...passwords, [field]: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => togglePassword(field)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-text-muted transition-colors"
                >
                  {showPasswords[field] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          ))}

          <button
            type="submit"
            disabled={pwLoading}
            className="text-sm px-5 py-2.5 rounded-full transition-colors disabled:opacity-50"
            style={{ background: 'var(--p-btn-accent)', color: 'var(--p-btn-accent-text)' }}
          >
            {pwLoading ? 'Сохранение...' : 'Сменить пароль'}
          </button>
        </form>
      </div>

      {/* Wallet Modal */}
      {modalStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setModalStep(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 animate-fade-in"
            style={{ background: 'var(--p-chrome-bg)', border: '1px solid var(--p-chrome-border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Shield size={16} style={{ color: 'var(--p-btn-accent)' }} />
                <h3 className="text-sm font-medium p-text">
                  {modalStep === 'password' ? 'Подтверждение' : modalStep === 'verifying' ? 'Проверка адреса' : 'Адрес кошелька'}
                </h3>
              </div>
              <button onClick={() => setModalStep(null)} className="p-text-muted hover:opacity-70 transition-opacity">
                <X size={18} />
              </button>
            </div>

            {/* Error */}
            {modalError && (
              <div className="flex items-start gap-2 mb-4 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)' }}>
                <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{modalError}</p>
              </div>
            )}

            {/* Step: Password */}
            {modalStep === 'password' && (
              <>
                <p className="text-xs p-text-faint mb-4">Введите пароль от аккаунта для подтверждения действия</p>
                <div className="relative mb-4">
                  <input
                    type={showModalPw ? 'text' : 'password'}
                    value={modalPassword}
                    onChange={(e) => { setModalPassword(e.target.value); setModalError('') }}
                    placeholder="Пароль"
                    autoFocus
                    className="w-full h-10 px-3 pr-10 rounded-xl text-sm outline-none transition-colors focus:ring-1 focus:ring-[var(--p-btn-accent)]"
                    style={{ background: 'var(--p-input-bg)', border: '1px solid var(--p-input-border)', color: 'var(--p-text)' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleModalPasswordNext()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowModalPw(!showModalPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-text-muted"
                  >
                    {showModalPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <button
                  onClick={handleModalPasswordNext}
                  className="w-full py-2.5 text-sm font-medium rounded-full flex items-center justify-center gap-2 transition-colors"
                  style={{ background: 'var(--p-btn-accent)', color: 'var(--p-btn-accent-text)' }}
                >
                  Продолжить <ArrowRight size={14} />
                </button>
              </>
            )}

            {/* Step: Address */}
            {modalStep === 'address' && (
              <>
                <p className="text-xs p-text-faint mb-4">Введите адрес USDT кошелька TRC-20</p>
                <input
                  ref={addressRef}
                  type="text"
                  value={modalAddress}
                  onChange={(e) => { setModalAddress(e.target.value); setModalError('') }}
                  placeholder="T..."
                  autoFocus
                  className="w-full h-10 px-3 rounded-xl text-sm font-mono outline-none transition-colors focus:ring-1 focus:ring-[var(--p-btn-accent)] mb-4"
                  style={{ background: 'var(--p-input-bg)', border: '1px solid var(--p-input-border)', color: 'var(--p-text)' }}
                  onKeyDown={(e) => e.key === 'Enter' && handleModalSubmit()}
                />
                <button
                  onClick={handleModalSubmit}
                  className="w-full py-2.5 text-sm font-medium rounded-full transition-colors"
                  style={{ background: 'var(--p-btn-accent)', color: 'var(--p-btn-accent-text)' }}
                >
                  Проверить и сохранить
                </button>
              </>
            )}

            {/* Step: Verifying */}
            {modalStep === 'verifying' && (
              <div className="flex flex-col items-center py-6">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: 'var(--p-avatar-bg)' }}>
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--p-btn-accent)' }} />
                </div>
                <p className="text-sm p-text mb-1">Проверка адреса</p>
                <p className="text-xs p-text-faint font-mono">{modalAddress.slice(0, 8)}...{modalAddress.slice(-6)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm shadow-xl animate-fade-in"
          style={{
            background: toast.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: toast.type === 'success' ? '#10b981' : '#ef4444',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}
        >
          {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
