import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Home, MessageCircle } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center py-20">
      <div className="text-center">
        <h1 className="text-9xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          404
        </h1>
        <h2 className="text-2xl font-semibold text-white mt-4 mb-2">
          Страница не найдена
        </h2>
        <p className="text-muted text-lg mb-8 max-w-md mx-auto">
          К сожалению, запрашиваемая страница не существует или была перемещена.
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild>
            <Link to="/">
              <Home className="mr-2 h-4 w-4" />
              На главную
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <a href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              Открыть бота
            </a>
          </Button>
        </div>

        {/* Decorative elements */}
        <div className="mt-12 flex justify-center gap-4 text-muted">
          <Link to="/blog" className="hover:text-white transition-colors">
            Блог
          </Link>
          <span>•</span>
          <Link to="/terms" className="hover:text-white transition-colors">
            Документы
          </Link>
          <span>•</span>
          <a href="https://t.me/mamlyga" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
            Поддержка
          </a>
        </div>
      </div>
    </div>
  )
}
