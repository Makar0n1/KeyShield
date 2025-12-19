import { useState } from 'react'
import { X, Clock } from 'lucide-react'

interface DeadlineOption {
  value: number // hours, 0 = keep current
  label: string
}

const deadlineOptions: DeadlineOption[] = [
  { value: 0, label: 'Оставить как был' },
  { value: 12, label: '12 часов' },
  { value: 24, label: '24 часа' },
  { value: 48, label: '48 часов' },
  { value: 72, label: '72 часа' },
  { value: 168, label: '7 дней' },
  { value: 336, label: '14 дней' },
]

interface DeadlineSelectModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (deadlineHours: number) => void
  loading?: boolean
}

export function DeadlineSelectModal({
  isOpen,
  onClose,
  onConfirm,
  loading = false,
}: DeadlineSelectModalProps) {
  const [selected, setSelected] = useState<number>(0)

  if (!isOpen) return null

  const handleConfirm = () => {
    onConfirm(selected)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-dark-lighter border border-border rounded-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-primary" />
            <h2 className="text-lg font-semibold text-white">Отмена спора</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            disabled={loading}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-gray-300 mb-4">
            Выберите новый дедлайн для сделки или оставьте прежний:
          </p>

          <div className="space-y-2">
            {deadlineOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelected(option.value)}
                disabled={loading}
                className={`
                  w-full px-4 py-3 rounded-lg text-left transition-all
                  ${selected === option.value
                    ? 'bg-primary text-white border-2 border-primary'
                    : 'bg-dark border border-border text-gray-300 hover:border-gray-500'
                  }
                  ${loading ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Отмена спора...</span>
              </>
            ) : (
              'Отменить спор'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
