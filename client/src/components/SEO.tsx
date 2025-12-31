import { useEffect } from 'react'

interface SEOProps {
  title?: string
  description?: string
  image?: string
  url?: string
  type?: 'website' | 'article'
  publishedTime?: string
  modifiedTime?: string
  author?: string
  noindex?: boolean
  schema?: object | object[]
}

const SITE_NAME = 'KeyShield'
const DEFAULT_DESCRIPTION = 'KeyShield — надёжный escrow-сервис для безопасных сделок с криптовалютой. Мультисиг-кошельки, автоматический контроль депозитов, справедливый арбитраж.'
const DEFAULT_IMAGE = '/logo.png'
const SITE_URL = import.meta.env.VITE_WEB_DOMAIN || 'https://keyshield.io'

// Check if indexation is enabled globally (VITE_INDEXATION=yes)
const INDEXATION_ENABLED = import.meta.env.VITE_INDEXATION === 'yes'

// Helper to set or update meta tag
function setMetaTag(name: string, content: string, isProperty = false) {
  const attr = isProperty ? 'property' : 'name'
  let element = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attr, name)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

// Helper to set or update link tag
function setLinkTag(rel: string, href: string) {
  let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', rel)
    document.head.appendChild(element)
  }
  element.setAttribute('href', href)
}

// Helper to set JSON-LD schema
function setJsonLd(schema: object | object[]) {
  // Remove existing schema
  const existing = document.querySelector('script[data-seo-schema]')
  if (existing) {
    existing.remove()
  }

  const script = document.createElement('script')
  script.type = 'application/ld+json'
  script.setAttribute('data-seo-schema', 'true')
  script.textContent = JSON.stringify(Array.isArray(schema) ? schema : [schema])
  document.head.appendChild(script)
}

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  publishedTime,
  modifiedTime,
  author,
  noindex = false,
  schema,
}: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Безопасный Escrow для криптосделок`
  const fullUrl = url ? `${SITE_URL}${url}` : SITE_URL
  const fullImage = image?.startsWith('http') ? image : `${SITE_URL}${image}`

  useEffect(() => {
    // Title
    document.title = fullTitle

    // Basic meta tags
    setMetaTag('description', description)
    setLinkTag('canonical', fullUrl)

    // Robots - noindex if:
    // 1. noindex prop is true
    // 2. Global INDEXATION is disabled (VITE_INDEXATION !== 'yes')
    const shouldNoindex = noindex || !INDEXATION_ENABLED
    if (shouldNoindex) {
      setMetaTag('robots', 'noindex, nofollow')
    } else {
      setMetaTag('robots', 'index, follow')
    }

    // Open Graph
    setMetaTag('og:title', fullTitle, true)
    setMetaTag('og:description', description, true)
    setMetaTag('og:image', fullImage, true)
    setMetaTag('og:url', fullUrl, true)
    setMetaTag('og:type', type, true)
    setMetaTag('og:site_name', SITE_NAME, true)
    setMetaTag('og:locale', 'ru_RU', true)

    // Article specific
    if (type === 'article') {
      if (publishedTime) {
        setMetaTag('article:published_time', publishedTime, true)
      }
      if (modifiedTime) {
        setMetaTag('article:modified_time', modifiedTime, true)
      }
      if (author) {
        setMetaTag('article:author', author, true)
      }
    }

    // Twitter Card
    setMetaTag('twitter:card', 'summary_large_image')
    setMetaTag('twitter:title', fullTitle)
    setMetaTag('twitter:description', description)
    setMetaTag('twitter:image', fullImage)

    // JSON-LD Schema
    if (schema) {
      setJsonLd(schema)
    }

    // Cleanup function
    return () => {
      // Remove article-specific tags when unmounting
      if (type === 'article') {
        document.querySelector('meta[property="article:published_time"]')?.remove()
        document.querySelector('meta[property="article:modified_time"]')?.remove()
        document.querySelector('meta[property="article:author"]')?.remove()
      }
    }
  }, [fullTitle, description, fullUrl, fullImage, type, publishedTime, modifiedTime, author, noindex, schema])

  return null
}

// Helper to generate Article schema
// Note: AggregateRating is NOT supported for Article type in Google Rich Results
// Only interactionStatistic is allowed for engagement metrics
export function generateArticleSchema(article: {
  title: string
  description: string
  image?: string
  url: string
  publishedTime: string
  modifiedTime?: string
  author?: string
  commentCount?: number
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    image: article.image,
    url: `${SITE_URL}${article.url}`,
    datePublished: article.publishedTime,
    dateModified: article.modifiedTime || article.publishedTime,
    author: {
      '@type': 'Person',
      name: article.author || 'KeyShield',
    },
    publisher: {
      '@type': 'Organization',
      name: 'KeyShield',
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.png`,
      },
    },
    // Comment count via interactionStatistic (valid for Article)
    ...(article.commentCount !== undefined && article.commentCount > 0 && {
      commentCount: article.commentCount,
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: article.commentCount,
      },
    }),
  }
}

// Helper to generate FAQ schema
export function generateFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }
}

// Helper to generate BreadcrumbList schema
export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  }
}

// Helper to generate Organization schema
export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'KeyShield',
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description: DEFAULT_DESCRIPTION,
    sameAs: [
      // Add social media links here
    ],
  }
}
