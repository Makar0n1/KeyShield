import { useState } from 'react'
import { ThumbsUp, ThumbsDown, Send, User } from 'lucide-react'
import type { BlogComment } from '@/types'
import { formatRelativeDate, formatNumber } from '@/utils/format'
import { getVisitorId } from '@/utils/visitor'
import { blogService } from '@/services/blog'
import { trackContact, trackViewContent } from '@/hooks/useMetaPixel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface CommentSectionProps {
  postSlug: string
  comments: BlogComment[]
  onCommentAdded: () => void
}

export function CommentSection({ postSlug, comments, onCommentAdded }: CommentSectionProps) {
  const [authorName, setAuthorName] = useState('')
  const [content, setContent] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!authorName.trim() || !content.trim()) {
      setError('Пожалуйста, заполните все поля')
      return
    }

    if (content.length < 10) {
      setError('Комментарий должен быть не менее 10 символов')
      return
    }

    setIsSubmitting(true)

    try {
      await blogService.addComment(postSlug, {
        authorName: authorName.trim(),
        content: content.trim(),
      })
      setAuthorName('')
      setContent('')
      setSuccess('Комментарий отправлен на модерацию')
      trackContact({ content_name: 'comment_submitted', content_category: postSlug })
      onCommentAdded()
    } catch {
      setError('Ошибка при отправке комментария')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVote = async (commentId: string, voteType: 'like' | 'dislike') => {
    const visitorId = getVisitorId()
    try {
      await blogService.vote('comment', commentId, voteType, visitorId)
      trackViewContent({ content_name: `comment_${voteType}`, content_category: postSlug })
      onCommentAdded() // Refresh comments
    } catch {
      // Silently fail
    }
  }

  const approvedComments = comments.filter((c) => c.status === 'approved')

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold text-white mb-6">
        Комментарии ({approvedComments.length})
      </h2>

      {/* Comment Form */}
      <form onSubmit={handleSubmit} className="bg-dark-light rounded-xl p-6 border border-border mb-8">
        <h3 className="text-white font-semibold mb-4">Оставить комментарий</h3>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-2 rounded-lg mb-4">
            {success}
          </div>
        )}

        <div className="space-y-4">
          <Input
            placeholder="Ваше имя"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            maxLength={50}
          />
          <Textarea
            placeholder="Ваш комментарий..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={1000}
          />
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted">{content.length}/1000</span>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                'Отправка...'
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Отправить
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Comments List */}
      {approvedComments.length > 0 ? (
        <div className="space-y-4">
          {approvedComments.map((comment) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              onVote={handleVote}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted">
          <p>Пока нет комментариев. Будьте первым!</p>
        </div>
      )}
    </section>
  )
}

interface CommentItemProps {
  comment: BlogComment
  onVote: (id: string, type: 'like' | 'dislike') => void
}

function CommentItem({ comment, onVote }: CommentItemProps) {
  return (
    <div className="bg-dark-light rounded-xl p-6 border border-border">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-white">{comment.authorName}</span>
            <span className="text-sm text-muted">
              {formatRelativeDate(comment.createdAt)}
            </span>
          </div>
          <p className="text-gray-300 whitespace-pre-wrap">{comment.content}</p>
          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={() => onVote(comment._id, 'like')}
              className="flex items-center gap-1 text-sm text-muted hover:text-secondary transition-colors"
            >
              <ThumbsUp className="w-4 h-4" />
              {formatNumber(comment.likes)}
            </button>
            <button
              onClick={() => onVote(comment._id, 'dislike')}
              className="flex items-center gap-1 text-sm text-muted hover:text-red-400 transition-colors"
            >
              <ThumbsDown className="w-4 h-4" />
              {formatNumber(comment.dislikes)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
