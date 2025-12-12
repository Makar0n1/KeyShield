import { useState, useEffect } from 'react'
import { adminService } from '@/services/admin'
import { Card, Button, Input } from '@/components/ui'
import { formatDateShort, formatFileSize } from '@/utils/format'
import { Download, FileText, User, Calendar, History, Trash2 } from 'lucide-react'

interface ExportRecord {
  _id: string
  exportType: string
  targetUserId: number
  targetUsername: string | null
  dealId: string | null
  dealsCount: number
  fileName: string
  filePath: string
  fileSize: number
  createdAt: string
}

const exportTypeLabels: Record<string, string> = {
  single_deal: 'Сделка',
  all_user_deals: 'Все сделки пользователя',
}

export function AdminExportsPage() {
  const [dealId, setDealId] = useState('')
  const [dealUserIdentifier, setDealUserIdentifier] = useState('')
  const [userId, setUserId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf')
  const [exporting, setExporting] = useState<string | null>(null)
  const [history, setHistory] = useState<ExportRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    refreshHistory()
  }, [])

  const refreshHistory = async () => {
    try {
      const data = await adminService.getExportHistory()
      setHistory((data.exports || []) as unknown as ExportRecord[])
    } catch (error) {
      console.error('Error loading history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleExportDeal = async () => {
    if (!dealId.trim()) {
      alert('Введите ID сделки')
      return
    }
    if (!dealUserIdentifier.trim()) {
      alert('Введите Telegram ID или @username участника')
      return
    }
    setExporting('deal')
    try {
      const { blob, filename } = await adminService.exportDealPdf(dealId.trim(), dealUserIdentifier.trim())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setDealId('')
      setDealUserIdentifier('')
      refreshHistory()
    } catch (error: any) {
      console.error('Export error:', error)
      const msg = error?.response?.data?.error || 'Ошибка экспорта. Проверьте данные.'
      alert(msg)
    } finally {
      setExporting(null)
    }
  }

  const handleExportUser = async () => {
    if (!userId.trim()) {
      alert('Введите Telegram ID или @username')
      return
    }
    setExporting('user')
    try {
      const { blob, filename } = await adminService.exportUserPdf(userId.trim())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setUserId('')
      refreshHistory()
    } catch (error: any) {
      console.error('Export error:', error)
      const msg = error?.response?.data?.error || 'Ошибка экспорта. Проверьте данные.'
      alert(msg)
    } finally {
      setExporting(null)
    }
  }

  const handleExportReport = async () => {
    if (!startDate || !endDate) {
      alert('Выберите период')
      return
    }
    setExporting('report')
    try {
      const blob = await adminService.exportDealsReport({
        startDate,
        endDate,
        format,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `deals-report-${startDate}-${endDate}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export error:', error)
      alert('Ошибка экспорта отчёта')
    } finally {
      setExporting(null)
    }
  }

  const handleDeleteExport = async (id: string) => {
    if (!confirm('Удалить запись экспорта?')) return
    try {
      await adminService.deleteExport(id)
      refreshHistory()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Ошибка удаления')
    }
  }

  const handleDownloadExport = async (id: string) => {
    try {
      const { blob, filename } = await adminService.downloadExport(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (error: unknown) {
      console.error('Download error:', error)
      const err = error as { response?: { status?: number } }
      if (err?.response?.status === 404) {
        alert('Файл не найден на сервере')
      } else {
        alert('Ошибка скачивания')
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Экспорт</h1>
        <p className="text-muted">Экспорт данных в PDF и CSV</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Export Deal */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText size={20} />
            Экспорт сделки
          </h2>
          <p className="text-muted text-sm mb-4">
            Экспортируйте полную информацию о сделке в PDF
          </p>
          <div className="space-y-3">
            <Input
              type="text"
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              placeholder="ID сделки (например: DL-123456)"
            />
            <div className="flex gap-2">
              <Input
                type="text"
                value={dealUserIdentifier}
                onChange={(e) => setDealUserIdentifier(e.target.value)}
                placeholder="ID или @username участника"
                className="flex-1"
              />
              <Button
                onClick={handleExportDeal}
                disabled={exporting === 'deal'}
              >
                {exporting === 'deal' ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <Download size={18} />
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Export User */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User size={20} />
            Экспорт сделок пользователя
          </h2>
          <p className="text-muted text-sm mb-4">
            Экспортируйте все завершённые сделки пользователя
          </p>
          <div className="flex gap-2">
            <Input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Telegram ID или @username"
              className="flex-1"
            />
            <Button
              onClick={handleExportUser}
              disabled={exporting === 'user'}
            >
              {exporting === 'user' ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <Download size={18} />
              )}
            </Button>
          </div>
        </Card>

        {/* Export Report */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar size={20} />
            Отчёт по сделкам за период
          </h2>
          <p className="text-muted text-sm mb-4">
            Экспортируйте сводный отчёт по всем сделкам за выбранный период
          </p>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Начало периода
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Конец периода
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Формат
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as 'pdf' | 'csv')}
                className="w-full h-10 bg-dark border border-border rounded-lg px-3 text-white focus:outline-none focus:border-primary"
              >
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleExportReport}
                disabled={exporting === 'report'}
                className="h-10"
              >
                {exporting === 'report' ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Экспорт...
                  </>
                ) : (
                  <>
                    <Download size={18} className="mr-2" />
                    Экспорт
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Export History */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <History size={20} />
            История экспортов
          </h2>
          {loadingHistory ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-muted text-center py-8">История экспортов пуста</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-sm font-medium text-muted">Тип</th>
                    <th className="text-left p-3 text-sm font-medium text-muted">Пользователь</th>
                    <th className="text-left p-3 text-sm font-medium text-muted">Файл</th>
                    <th className="text-left p-3 text-sm font-medium text-muted">Размер</th>
                    <th className="text-left p-3 text-sm font-medium text-muted">Дата</th>
                    <th className="text-left p-3 text-sm font-medium text-muted"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item._id} className="border-b border-border hover:bg-dark-lighter/50">
                      <td className="p-3 text-sm text-gray-300">
                        {exportTypeLabels[item.exportType] || item.exportType}
                        {item.dealId && (
                          <span className="text-muted ml-1">({item.dealId})</span>
                        )}
                      </td>
                      <td className="p-3 text-sm">
                        {item.targetUsername ? (
                          <span className="text-primary">@{item.targetUsername}</span>
                        ) : (
                          <span className="text-gray-400">{item.targetUserId}</span>
                        )}
                        {item.dealsCount > 1 && (
                          <span className="text-muted ml-1">({item.dealsCount} сделок)</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-xs text-gray-300 max-w-[250px] truncate" title={item.fileName}>
                        {item.fileName}
                      </td>
                      <td className="p-3 text-sm text-muted">
                        {formatFileSize(item.fileSize)}
                      </td>
                      <td className="p-3 text-sm text-muted">
                        {formatDateShort(item.createdAt)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadExport(item._id)}
                            className="text-gray-400 hover:text-primary transition-colors"
                            title="Скачать"
                          >
                            <Download size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteExport(item._id)}
                            className="text-gray-400 hover:text-red-400 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
