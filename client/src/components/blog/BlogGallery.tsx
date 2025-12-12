import { useState } from 'react'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { Images } from 'lucide-react'

interface GalleryConfig {
  autoplay?: boolean
  speed?: string
  align?: 'left' | 'center' | 'right'
  images: string[]
}

interface BlogGalleryProps {
  config: GalleryConfig
}

export function BlogGallery({ config }: BlogGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const { images, align = 'center' } = config

  if (!images || images.length === 0) return null

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  const alignClass = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end'
  }[align]

  return (
    <>
      <div className={`not-prose my-8 flex flex-wrap gap-3 ${alignClass}`}>
        {images.map((src, idx) => (
          <button
            key={idx}
            onClick={() => openLightbox(idx)}
            className="relative group overflow-hidden rounded-xl border border-border hover:border-primary/50 transition-all"
          >
            <img
              src={src}
              alt={`Gallery image ${idx + 1}`}
              className="w-auto h-40 md:h-52 object-cover transition-transform group-hover:scale-105"
            />
            {/* Overlay with icon */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <Images className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {/* Multi-image indicator */}
            {images.length > 1 && idx === 0 && (
              <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-xs font-medium">
                1/{images.length}
              </div>
            )}
          </button>
        ))}
      </div>

      <ImageLightbox
        images={images}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        alt="Gallery image"
      />
    </>
  )
}

// Content segment - either HTML content or a gallery
export interface ContentSegment {
  type: 'html' | 'gallery'
  content?: string
  gallery?: GalleryConfig
  id: string
}

// Decode HTML entities that Quill editor might have added
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]*>/g, '') // Remove any HTML tags Quill added inside the JSON
}

// Parse [GALLERY]...[/GALLERY] tags and split content into segments
// Handles cases where tags might be wrapped in HTML elements like <em>, <p>, etc.
export function parseGalleryTags(content: string): { segments: ContentSegment[] } {
  // First, clean up: remove HTML wrappers around [GALLERY] tags
  // e.g. <em>[GALLERY]...[/GALLERY]</em> -> [GALLERY]...[/GALLERY]
  // Also handle <p><em>[GALLERY]...[/GALLERY]</em></p>
  let cleanedContent = content
    .replace(/<p>\s*<em>\s*\[GALLERY\]/gi, '[GALLERY]')
    .replace(/\[\/GALLERY\]\s*<\/em>\s*<\/p>/gi, '[/GALLERY]')
    .replace(/<em>\s*\[GALLERY\]/gi, '[GALLERY]')
    .replace(/\[\/GALLERY\]\s*<\/em>/gi, '[/GALLERY]')
    .replace(/<p>\s*\[GALLERY\]/gi, '[GALLERY]')
    .replace(/\[\/GALLERY\]\s*<\/p>/gi, '[/GALLERY]')

  const segments: ContentSegment[] = []
  const galleryRegex = /\[GALLERY\]([\s\S]*?)\[\/GALLERY\]/g

  let lastIndex = 0
  let match
  let galleryIndex = 0

  while ((match = galleryRegex.exec(cleanedContent)) !== null) {
    // Add HTML content before this gallery
    if (match.index > lastIndex) {
      const htmlContent = cleanedContent.substring(lastIndex, match.index)
      if (htmlContent.trim()) {
        segments.push({
          type: 'html',
          content: htmlContent,
          id: `html-${segments.length}`
        })
      }
    }

    // Add gallery
    try {
      // Decode HTML entities that editor might have added
      const jsonStr = decodeHtmlEntities(match[1].trim())
      const config = JSON.parse(jsonStr) as GalleryConfig
      segments.push({
        type: 'gallery',
        gallery: config,
        id: `gallery-${galleryIndex++}`
      })
    } catch (e) {
      console.error('Failed to parse gallery config:', e)
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining HTML content after last gallery
  if (lastIndex < cleanedContent.length) {
    const htmlContent = cleanedContent.substring(lastIndex)
    if (htmlContent.trim()) {
      segments.push({
        type: 'html',
        content: htmlContent,
        id: `html-${segments.length}`
      })
    }
  }

  // If no galleries found, return entire content as single segment
  if (segments.length === 0) {
    segments.push({
      type: 'html',
      content: cleanedContent,
      id: 'html-0'
    })
  }

  return { segments }
}
