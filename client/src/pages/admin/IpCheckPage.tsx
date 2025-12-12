import { useState } from 'react'
import { adminService } from '@/services/admin'
import { Card, Button, Input } from '@/components/ui'
import { Globe, Search, AlertTriangle, CheckCircle, Info } from 'lucide-react'

interface IpCheckResult {
  ip: string
  country?: string
  countryCode?: string
  region?: string
  city?: string
  isp?: string
  org?: string
  as?: string
  proxy?: boolean
  vpn?: boolean
  tor?: boolean
  hosting?: boolean
  mobile?: boolean
  threat?: string
  riskScore?: number
}

export function AdminIpCheckPage() {
  const [ip, setIp] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<IpCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ip.trim()) {
      setError('Введите IP-адрес')
      return
    }

    // Basic IP validation
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipPattern.test(ip.trim())) {
      setError('Неверный формат IP-адреса')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await adminService.checkIp(ip.trim())
      setResult(data.result as IpCheckResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка проверки')
    } finally {
      setLoading(false)
    }
  }

  const getRiskLevel = (score?: number) => {
    if (score === undefined) return { label: 'Неизвестно', color: 'text-muted' }
    if (score >= 80) return { label: 'Высокий', color: 'text-red-400' }
    if (score >= 50) return { label: 'Средний', color: 'text-yellow-400' }
    if (score >= 20) return { label: 'Низкий', color: 'text-green-400' }
    return { label: 'Минимальный', color: 'text-green-400' }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">IP Check</h1>
        <p className="text-muted">Проверка IP-адресов на подозрительную активность</p>
      </div>

      {/* Search Form */}
      <Card className="p-6">
        <form onSubmit={handleCheck} className="flex gap-4">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <Input
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="Введите IP-адрес (например: 8.8.8.8)"
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Проверка...
              </>
            ) : (
              <>
                <Search size={18} className="mr-2" />
                Проверить
              </>
            )}
          </Button>
        </form>
      </Card>

      {/* Error */}
      {error && (
        <Card className="p-4 border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        </Card>
      )}

      {/* Result */}
      {result && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Location Info */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Globe size={20} />
              Геолокация
            </h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-muted">IP-адрес</dt>
                <dd className="text-white font-mono">{result.ip}</dd>
              </div>
              {result.country && (
                <div className="flex justify-between">
                  <dt className="text-muted">Страна</dt>
                  <dd className="text-white">
                    {result.country} {result.countryCode && `(${result.countryCode})`}
                  </dd>
                </div>
              )}
              {result.region && (
                <div className="flex justify-between">
                  <dt className="text-muted">Регион</dt>
                  <dd className="text-white">{result.region}</dd>
                </div>
              )}
              {result.city && (
                <div className="flex justify-between">
                  <dt className="text-muted">Город</dt>
                  <dd className="text-white">{result.city}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Network Info */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Info size={20} />
              Сетевая информация
            </h2>
            <dl className="space-y-3">
              {result.isp && (
                <div className="flex justify-between">
                  <dt className="text-muted">ISP</dt>
                  <dd className="text-white">{result.isp}</dd>
                </div>
              )}
              {result.org && (
                <div className="flex justify-between">
                  <dt className="text-muted">Организация</dt>
                  <dd className="text-white">{result.org}</dd>
                </div>
              )}
              {result.as && (
                <div className="flex justify-between">
                  <dt className="text-muted">AS</dt>
                  <dd className="text-white font-mono text-sm">{result.as}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Мобильный</dt>
                <dd className={result.mobile ? 'text-yellow-400' : 'text-green-400'}>
                  {result.mobile ? 'Да' : 'Нет'}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Security Info */}
          <Card className="p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle size={20} />
              Безопасность
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className={`p-4 rounded-lg ${result.proxy ? 'bg-red-500/10 border border-red-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {result.proxy ? (
                    <AlertTriangle className="text-red-400" size={20} />
                  ) : (
                    <CheckCircle className="text-green-400" size={20} />
                  )}
                  <span className={result.proxy ? 'text-red-400' : 'text-green-400'}>
                    Proxy
                  </span>
                </div>
                <p className="text-white font-medium">{result.proxy ? 'Обнаружен' : 'Не обнаружен'}</p>
              </div>

              <div className={`p-4 rounded-lg ${result.vpn ? 'bg-red-500/10 border border-red-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {result.vpn ? (
                    <AlertTriangle className="text-red-400" size={20} />
                  ) : (
                    <CheckCircle className="text-green-400" size={20} />
                  )}
                  <span className={result.vpn ? 'text-red-400' : 'text-green-400'}>
                    VPN
                  </span>
                </div>
                <p className="text-white font-medium">{result.vpn ? 'Обнаружен' : 'Не обнаружен'}</p>
              </div>

              <div className={`p-4 rounded-lg ${result.tor ? 'bg-red-500/10 border border-red-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {result.tor ? (
                    <AlertTriangle className="text-red-400" size={20} />
                  ) : (
                    <CheckCircle className="text-green-400" size={20} />
                  )}
                  <span className={result.tor ? 'text-red-400' : 'text-green-400'}>
                    TOR
                  </span>
                </div>
                <p className="text-white font-medium">{result.tor ? 'Обнаружен' : 'Не обнаружен'}</p>
              </div>

              <div className={`p-4 rounded-lg ${result.hosting ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {result.hosting ? (
                    <AlertTriangle className="text-yellow-400" size={20} />
                  ) : (
                    <CheckCircle className="text-green-400" size={20} />
                  )}
                  <span className={result.hosting ? 'text-yellow-400' : 'text-green-400'}>
                    Хостинг
                  </span>
                </div>
                <p className="text-white font-medium">{result.hosting ? 'Да' : 'Нет'}</p>
              </div>
            </div>

            {/* Risk Score */}
            {result.riskScore !== undefined && (
              <div className="p-4 bg-dark rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Уровень риска</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${getRiskLevel(result.riskScore).color}`}>
                      {result.riskScore}/100
                    </span>
                    <span className={`text-sm ${getRiskLevel(result.riskScore).color}`}>
                      ({getRiskLevel(result.riskScore).label})
                    </span>
                  </div>
                </div>
                <div className="mt-2 h-2 bg-dark-lighter rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      result.riskScore >= 80 ? 'bg-red-500' :
                      result.riskScore >= 50 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${result.riskScore}%` }}
                  />
                </div>
              </div>
            )}

            {result.threat && (
              <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400">
                  <strong>Угроза:</strong> {result.threat}
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Help */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Справка</h3>
        <div className="text-muted text-sm space-y-2">
          <p>
            <strong className="text-white">Proxy/VPN/TOR:</strong> Если обнаружены, пользователь может
            скрывать своё реальное местоположение.
          </p>
          <p>
            <strong className="text-white">Хостинг:</strong> IP принадлежит дата-центру, а не
            обычному провайдеру. Может указывать на использование серверов.
          </p>
          <p>
            <strong className="text-white">Уровень риска:</strong> Оценка от 0 до 100. Высокий
            показатель может указывать на мошенническую активность.
          </p>
        </div>
      </Card>
    </div>
  )
}
