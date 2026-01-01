import { useRef, useMemo, useLayoutEffect } from 'react'

interface BlogContentProps {
  content: string
  postId: string
  interlinkPosts: Array<{ _id: string; slug: string; title: string }>
  enableInterlinking?: boolean
}

interface GalleryConfig {
  images: string[]
  autoplay?: boolean
  speed?: string
  align?: string
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

// Convert [GALLERY]...[/GALLERY] tags to <div class="image-gallery"> HTML
function convertGalleryTags(content: string): string {
  // First, clean up HTML wrappers around [GALLERY] tags
  let cleaned = content
    .replace(/<p>\s*<em>\s*\[GALLERY\]/gi, '[GALLERY]')
    .replace(/\[\/GALLERY\]\s*<\/em>\s*<\/p>/gi, '[/GALLERY]')
    .replace(/<em>\s*\[GALLERY\]/gi, '[GALLERY]')
    .replace(/\[\/GALLERY\]\s*<\/em>/gi, '[/GALLERY]')
    .replace(/<p>\s*\[GALLERY\]/gi, '[GALLERY]')
    .replace(/\[\/GALLERY\]\s*<\/p>/gi, '[/GALLERY]')
    .replace(/<span[^>]*>\s*\[GALLERY\]/gi, '[GALLERY]')
    .replace(/\[\/GALLERY\]\s*<\/span>/gi, '[/GALLERY]')

  // Replace [GALLERY]JSON[/GALLERY] with HTML
  return cleaned.replace(/\[GALLERY\]([\s\S]*?)\[\/GALLERY\]/g, (_, jsonStr) => {
    try {
      const decoded = decodeHtmlEntities(jsonStr.trim())
      const config = JSON.parse(decoded) as GalleryConfig
      if (!config.images || config.images.length === 0) return ''

      const imagesHtml = config.images.map((url, i) =>
        `<img src="${url}" alt="Slide ${i + 1}" />`
      ).join('')

      return `<div class="image-gallery" data-gallery="true">${imagesHtml}</div>`
    } catch (e) {
      console.error('Failed to parse gallery:', e)
      return ''
    }
  })
}

// This component processes content ONCE and never re-renders
// All interactivity is handled via vanilla JS to prevent React re-renders
export function BlogContent({ content, postId, interlinkPosts, enableInterlinking = true }: BlogContentProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const processedPostId = useRef<string | null>(null)

  // Convert [GALLERY] tags to HTML before rendering
  const processedContent = useMemo(() => convertGalleryTags(content), [content])

  useLayoutEffect(() => {
    // Only process once per post (reset when postId changes)
    if (processedPostId.current === postId) return
    const node = contentRef.current
    if (!node) return

    // Wait for DOM to be fully rendered
    const timer = setTimeout(() => {
      if (processedPostId.current === postId) return
      processedPostId.current = postId

      // Clean up previous lightbox if exists
      const oldLightbox = document.getElementById('blog-lightbox')
      if (oldLightbox) oldLightbox.remove()

    // Create lightbox element once
    const isMobile = () => window.innerWidth < 768

    const createLightbox = () => {
      const lb = document.createElement('div')
      lb.id = 'blog-lightbox'
      lb.style.cssText = `
        display: none;
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0,0,0,0.95);
        overflow: hidden;
      `
      lb.innerHTML = `
        <button class="lb-close" style="position:absolute;top:20px;right:20px;background:none;border:none;color:white;font-size:32px;cursor:pointer;z-index:10;padding:10px;">&times;</button>
        <button class="lb-prev" style="position:absolute;left:20px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:none;color:white;width:50px;height:50px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg>
        </button>
        <button class="lb-next" style="position:absolute;right:20px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:none;color:white;width:50px;height:50px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,6 15,12 9,18"></polyline></svg>
        </button>
        <div class="lb-track" style="display:flex;height:100%;transition:transform 0.3s ease;touch-action:none;"></div>
        <div class="lb-counter" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:white;font-size:14px;z-index:10;"></div>
      `
      document.body.appendChild(lb)

      let currentImages: string[] = []
      let currentIndex = 0
      let touchStartX = 0
      let touchStartY = 0
      let touchCurrentX = 0
      let touchCurrentY = 0
      let isDragging = false
      let swipeDirection: 'none' | 'horizontal' | 'vertical' = 'none'

      const track = lb.querySelector('.lb-track') as HTMLElement
      const counter = lb.querySelector('.lb-counter') as HTMLElement
      const prevBtn = lb.querySelector('.lb-prev') as HTMLElement
      const nextBtn = lb.querySelector('.lb-next') as HTMLElement

      const buildSlides = () => {
        track.innerHTML = ''
        currentImages.forEach((src, i) => {
          const slide = document.createElement('div')
          slide.style.cssText = 'flex:0 0 100%;width:100%;height:100%;display:flex;align-items:center;justify-content:center;'
          const img = document.createElement('img')
          img.src = src
          img.alt = `Image ${i + 1}`
          img.draggable = false
          img.style.cssText = 'max-width:90vw;max-height:90vh;object-fit:contain;user-select:none;-webkit-user-drag:none;'
          slide.appendChild(img)
          track.appendChild(slide)
        })
      }

      const updatePosition = (animate = true) => {
        track.style.transition = animate ? 'transform 0.3s ease' : 'none'
        track.style.transform = `translateX(-${currentIndex * 100}%)`
        counter.textContent = currentImages.length > 1 ? `${currentIndex + 1} / ${currentImages.length}` : ''

        // Hide arrows on mobile, show on desktop if multiple images
        const showArrows = !isMobile() && currentImages.length > 1
        prevBtn.style.display = showArrows ? 'flex' : 'none'
        nextBtn.style.display = showArrows ? 'flex' : 'none'
      }

      const openLightbox = (images: string[], index: number) => {
        currentImages = images
        currentIndex = index
        buildSlides()
        updatePosition(false)
        lb.style.display = 'block'
        lb.style.background = 'rgba(0,0,0,0.95)'
        document.body.style.overflow = 'hidden'
      }

      const closeLightbox = () => {
        lb.style.display = 'none'
        document.body.style.overflow = ''
        lb.style.background = 'rgba(0,0,0,0.95)'
        track.style.transform = `translateX(-${currentIndex * 100}%)`
      }

      const closeWithAnimation = (direction: 'up' | 'down') => {
        track.style.transition = 'transform 0.3s ease, opacity 0.3s ease'
        track.style.transform = `translate(-${currentIndex * 100}%, ${direction === 'up' ? '-100vh' : '100vh'})`
        track.style.opacity = '0'
        setTimeout(() => {
          closeLightbox()
          track.style.opacity = '1'
        }, 300)
      }

      const goNext = () => {
        if (currentImages.length <= 1 || currentIndex >= currentImages.length - 1) return
        currentIndex++
        updatePosition()
      }

      const goPrev = () => {
        if (currentImages.length <= 1 || currentIndex <= 0) return
        currentIndex--
        updatePosition()
      }

      // Touch handlers for swipe with finger tracking
      track.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX
        touchStartY = e.touches[0].clientY
        touchCurrentX = touchStartX
        touchCurrentY = touchStartY
        isDragging = true
        swipeDirection = 'none'
        track.style.transition = 'none'
      }, { passive: true })

      track.addEventListener('touchmove', (e) => {
        if (!isDragging) return

        const currentX = e.touches[0].clientX
        const currentY = e.touches[0].clientY
        const diffX = currentX - touchStartX
        const diffY = currentY - touchStartY

        // Determine swipe direction on first significant movement
        if (swipeDirection === 'none' && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
          swipeDirection = Math.abs(diffX) > Math.abs(diffY) ? 'horizontal' : 'vertical'
        }

        touchCurrentX = currentX
        touchCurrentY = currentY

        if (swipeDirection === 'horizontal') {
          e.preventDefault()
          // Calculate position - track moves, showing prev/next slides
          const baseOffset = -currentIndex * 100
          const dragPercent = (diffX / window.innerWidth) * 100

          // Add resistance at edges
          let finalPercent = dragPercent
          if ((currentIndex === 0 && diffX > 0) || (currentIndex === currentImages.length - 1 && diffX < 0)) {
            finalPercent = dragPercent * 0.3
          }

          track.style.transform = `translateX(${baseOffset + finalPercent}%)`
        } else if (swipeDirection === 'vertical') {
          e.preventDefault()
          // Vertical swipe - for closing, move whole track up/down
          const opacity = Math.max(0.3, 1 - Math.abs(diffY) / 400)
          const bgOpacity = Math.max(0, 0.95 - Math.abs(diffY) / 500)
          track.style.transform = `translate(-${currentIndex * 100}%, ${diffY}px)`
          track.style.opacity = String(opacity)
          lb.style.background = `rgba(0,0,0,${bgOpacity})`
        }
      }, { passive: false })

      track.addEventListener('touchend', () => {
        if (!isDragging) return
        isDragging = false

        const diffX = touchStartX - touchCurrentX
        const diffY = touchStartY - touchCurrentY
        const threshold = window.innerWidth * 0.15 // 15% threshold

        track.style.transition = 'transform 0.3s ease, opacity 0.3s ease'

        if (swipeDirection === 'horizontal') {
          if (Math.abs(diffX) > threshold) {
            if (diffX > 0 && currentIndex < currentImages.length - 1) {
              currentIndex++
            } else if (diffX < 0 && currentIndex > 0) {
              currentIndex--
            }
          }
          updatePosition()
          track.style.opacity = '1'
          lb.style.background = 'rgba(0,0,0,0.95)'
        } else if (swipeDirection === 'vertical') {
          if (Math.abs(diffY) > 100) {
            closeWithAnimation(diffY > 0 ? 'down' : 'up')
          } else {
            track.style.transform = `translateX(-${currentIndex * 100}%)`
            track.style.opacity = '1'
            lb.style.background = 'rgba(0,0,0,0.95)'
          }
        } else {
          updatePosition()
          track.style.opacity = '1'
          lb.style.background = 'rgba(0,0,0,0.95)'
        }

        swipeDirection = 'none'
      }, { passive: true })

      // Close on tap background (not on image)
      lb.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        if (target === lb || target.classList.contains('lb-track') || target.tagName === 'DIV') {
          if (target.tagName !== 'IMG') closeLightbox()
        }
      })

      lb.querySelector('.lb-close')?.addEventListener('click', closeLightbox)
      prevBtn.addEventListener('click', (e) => { e.stopPropagation(); goPrev() })
      nextBtn.addEventListener('click', (e) => { e.stopPropagation(); goNext() })

      // Keyboard navigation
      document.addEventListener('keydown', (e) => {
        if (lb.style.display !== 'block') return
        if (e.key === 'Escape') closeLightbox()
        if (e.key === 'ArrowLeft') goPrev()
        if (e.key === 'ArrowRight') goNext()
      })

      // Update arrows visibility on resize
      window.addEventListener('resize', () => {
        if (lb.style.display === 'block') {
          const showArrows = !isMobile() && currentImages.length > 1
          prevBtn.style.display = showArrows ? 'flex' : 'none'
          nextBtn.style.display = showArrows ? 'flex' : 'none'
        }
      })

      return openLightbox
    }

    const openLightbox = createLightbox()

    // STEP 1: Process galleries
    const galleries = node.querySelectorAll('.image-gallery')
    galleries.forEach((gallery) => {
      const images = gallery.querySelectorAll('img')
      if (images.length === 0) return

      const imageUrls = Array.from(images).map(img => img.src)
      gallery.innerHTML = ''

      const wrapper = document.createElement('div')
      wrapper.className = 'gallery-carousel'
      wrapper.style.cssText = 'position:relative;aspect-ratio:16/9;background:#1a1a2e;border-radius:0.75rem;overflow:hidden;border:1px solid rgba(255,255,255,0.1);margin:1.5rem 0;'

      const slidesContainer = document.createElement('div')
      slidesContainer.style.cssText = 'display:flex;height:100%;transition:transform 0.3s ease;'

      imageUrls.forEach((src, idx) => {
        const slide = document.createElement('div')
        slide.style.cssText = 'flex:0 0 100%;height:100%;display:flex;align-items:center;justify-content:center;'
        const img = document.createElement('img')
        img.src = src
        img.alt = `Slide ${idx + 1}`
        img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;cursor:pointer;'
        img.onclick = () => openLightbox(imageUrls, idx)
        slide.appendChild(img)
        slidesContainer.appendChild(slide)
      })
      wrapper.appendChild(slidesContainer)

      const counter = document.createElement('div')
      counter.style.cssText = 'position:absolute;top:12px;left:12px;background:rgba(0,0,0,0.6);color:white;padding:4px 12px;border-radius:20px;font-size:14px;'
      counter.textContent = `1 / ${imageUrls.length}`
      wrapper.appendChild(counter)

      if (imageUrls.length > 1) {
        // Arrow buttons - only for desktop
        const prevBtn = document.createElement('button')
        prevBtn.className = 'carousel-arrow carousel-prev'
        prevBtn.style.cssText = 'position:absolute;left:12px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.6);color:white;border:none;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;'
        prevBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15,18 9,12 15,6"></polyline></svg>'
        if (isMobile()) prevBtn.style.display = 'none'

        const nextBtn = document.createElement('button')
        nextBtn.className = 'carousel-arrow carousel-next'
        nextBtn.style.cssText = 'position:absolute;right:12px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.6);color:white;border:none;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;'
        nextBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9,6 15,12 9,18"></polyline></svg>'
        if (isMobile()) nextBtn.style.display = 'none'

        wrapper.appendChild(prevBtn)
        wrapper.appendChild(nextBtn)

        const dotsContainer = document.createElement('div')
        dotsContainer.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;'
        imageUrls.forEach((_, idx) => {
          const dot = document.createElement('button')
          dot.style.cssText = `width:${idx === 0 ? '20px' : '8px'};height:8px;border-radius:4px;border:none;cursor:pointer;transition:all 0.3s;background:${idx === 0 ? 'white' : 'rgba(255,255,255,0.5)'};`
          dot.dataset.index = String(idx)
          dotsContainer.appendChild(dot)
        })
        wrapper.appendChild(dotsContainer)

        let currentIndex = 0
        const updateCarousel = (animate = true) => {
          slidesContainer.style.transition = animate ? 'transform 0.3s ease' : 'none'
          slidesContainer.style.transform = `translateX(-${currentIndex * 100}%)`
          counter.textContent = `${currentIndex + 1} / ${imageUrls.length}`
          dotsContainer.querySelectorAll('button').forEach((d, i) => {
            ;(d as HTMLElement).style.width = i === currentIndex ? '20px' : '8px'
            ;(d as HTMLElement).style.background = i === currentIndex ? 'white' : 'rgba(255,255,255,0.5)'
          })
        }

        prevBtn.onclick = (e) => { e.stopPropagation(); currentIndex = (currentIndex - 1 + imageUrls.length) % imageUrls.length; updateCarousel() }
        nextBtn.onclick = (e) => { e.stopPropagation(); currentIndex = (currentIndex + 1) % imageUrls.length; updateCarousel() }
        dotsContainer.onclick = (e) => {
          const t = e.target as HTMLElement
          if (t.dataset.index) { e.stopPropagation(); currentIndex = parseInt(t.dataset.index); updateCarousel() }
        }

        // Touch swipe with finger tracking
        let touchStartX = 0
        let touchCurrentX = 0
        let isDragging = false
        const wrapperWidth = () => wrapper.getBoundingClientRect().width

        wrapper.addEventListener('touchstart', (e) => {
          touchStartX = e.touches[0].clientX
          touchCurrentX = touchStartX
          isDragging = true
          slidesContainer.style.transition = 'none'
        }, { passive: true })

        wrapper.addEventListener('touchmove', (e) => {
          if (!isDragging) return
          touchCurrentX = e.touches[0].clientX
          const diff = touchCurrentX - touchStartX
          const width = wrapperWidth()

          // Calculate offset with resistance at edges
          let offsetPercent = -currentIndex * 100 + (diff / width) * 100

          // Add resistance at edges
          if ((currentIndex === 0 && diff > 0) || (currentIndex === imageUrls.length - 1 && diff < 0)) {
            offsetPercent = -currentIndex * 100 + (diff / width) * 30 // 30% resistance
          }

          slidesContainer.style.transform = `translateX(${offsetPercent}%)`
        }, { passive: true })

        wrapper.addEventListener('touchend', () => {
          if (!isDragging) return
          isDragging = false

          const diff = touchStartX - touchCurrentX
          const threshold = wrapperWidth() * 0.2 // 20% threshold

          slidesContainer.style.transition = 'transform 0.3s ease'

          if (Math.abs(diff) > threshold) {
            if (diff > 0 && currentIndex < imageUrls.length - 1) {
              currentIndex++
            } else if (diff < 0 && currentIndex > 0) {
              currentIndex--
            }
          }
          updateCarousel()
        }, { passive: true })

        // Update arrows on resize
        window.addEventListener('resize', () => {
          const mobile = isMobile()
          prevBtn.style.display = mobile ? 'none' : 'flex'
          nextBtn.style.display = mobile ? 'none' : 'flex'
        })
      }

      gallery.appendChild(wrapper)
    })

    // STEP 2: Headings
    node.querySelectorAll('h2, h3').forEach((h, i) => { if (!h.id) h.id = `heading-${i}` })

    // STEP 3: Interlinks - place BEFORE H2-H6 headers only
    // Posts are pre-selected by backend with smart algorithm (popular/new mix)
    // First block in first half, second block near end
    if (enableInterlinking && interlinkPosts.length > 0) {
      const headers = Array.from(node.querySelectorAll('h2, h3, h4, h5, h6'))

      if (headers.length >= 2) {
        const count = Math.min(interlinkPosts.length, 2)

        // Calculate positions: first in first half, second near end
        const midPoint = Math.floor(headers.length / 2)
        // First block: between 1st and middle header (prefer around 25-40% of headers)
        const firstPos = Math.max(1, Math.min(Math.floor(headers.length * 0.3), midPoint - 1))
        // Second block: in last third (prefer around 70-85% of headers)
        const secondPos = Math.max(midPoint + 1, Math.floor(headers.length * 0.75))

        const positions = count === 1 ? [firstPos] : [firstPos, secondPos]

        const createInterlinkBlock = (post: typeof interlinkPosts[0]) => {
          const link = document.createElement('div')
          link.className = 'inline-interlink not-prose my-6 p-4 bg-dark-light/50 border-l-4 border-primary rounded-r-lg'
          link.innerHTML = `<p class="text-sm text-muted mb-1">Читайте также:</p><a href="/blog/${post.slug}" class="text-primary hover:text-primary/80 font-medium hover:underline">→ ${post.title}</a>`
          return link
        }

        positions.forEach((pos, idx) => {
          const post = interlinkPosts[idx]
          if (!post || pos >= headers.length) return
          const targetHeader = headers[pos]
          // Check if interlink already exists before this header
          if (targetHeader.previousElementSibling?.classList.contains('inline-interlink')) return
          const link = createInterlinkBlock(post)
          targetHeader.parentNode?.insertBefore(link, targetHeader)
        })
      }
    }

    // STEP 4: Process all standalone images (both vertical and horizontal)
    const processImages = () => {
      node.querySelectorAll('img').forEach((img) => {
        if (img.parentElement?.classList.contains('content-image-wrapper')) return
        if (img.parentElement?.classList.contains('vertical-image-wrapper')) return
        if (img.closest('.image-gallery') || img.closest('.gallery-carousel')) return

        const process = () => {
          if (img.parentElement?.classList.contains('content-image-wrapper')) return
          if (img.parentElement?.classList.contains('vertical-image-wrapper')) return

          const isVertical = img.naturalHeight > img.naturalWidth

          const wrapper = document.createElement('div')
          wrapper.className = isVertical ? 'vertical-image-wrapper' : 'content-image-wrapper'
          wrapper.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;border-radius:0.75rem;overflow:hidden;margin:1.5rem 0;background:#1e293b;'

          const bg = img.cloneNode() as HTMLImageElement
          bg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;filter:blur(20px);transform:scale(1.1);opacity:0.4;z-index:0;'
          bg.removeAttribute('alt')
          bg.setAttribute('aria-hidden', 'true')

          img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;margin:0;border-radius:0;z-index:1;cursor:pointer;'
          img.onclick = () => openLightbox([img.src], 0)

          img.parentNode?.insertBefore(wrapper, img)
          wrapper.appendChild(bg)
          wrapper.appendChild(img)
        }

        if (img.complete && img.naturalHeight > 0) process()
        else img.onload = process
      })
    }
    processImages()
    setTimeout(processImages, 300)
    setTimeout(processImages, 600)

    // Regular image clicks
    node.querySelectorAll('img').forEach(img => {
      if (!img.onclick) {
        img.style.cursor = 'pointer'
        img.onclick = () => openLightbox([img.src], 0)
      }
    })

    }, 50) // End setTimeout

    return () => clearTimeout(timer)
  }, [postId, processedContent, enableInterlinking, interlinkPosts]) // Re-run when post changes

  return (
    <div
      ref={contentRef}
      className="prose prose-invert prose-lg max-w-none overflow-hidden break-words
        prose-headings:text-white prose-headings:font-bold
        prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-5
        prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-4 prose-h3:text-white
        prose-p:text-gray-300 prose-p:leading-relaxed prose-p:mb-5
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-strong:text-white
        prose-ul:text-gray-300 prose-ul:my-5 prose-ul:space-y-2
        prose-ol:text-gray-300 prose-ol:my-5 prose-ol:space-y-2
        prose-li:marker:text-primary prose-li:my-1
        prose-blockquote:border-primary prose-blockquote:text-gray-400 prose-blockquote:my-6
        prose-code:text-primary prose-code:bg-dark prose-code:px-1 prose-code:rounded prose-code:break-all
        prose-pre:bg-dark prose-pre:border prose-pre:border-border prose-pre:overflow-x-auto prose-pre:my-6
        prose-img:rounded-xl prose-img:max-w-full prose-img:my-6 prose-img:cursor-pointer"
      dangerouslySetInnerHTML={{ __html: processedContent }}
    />
  )
}
