import { Node, mergeAttributes } from '@tiptap/core'

export interface ImageGalleryOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageGallery: {
      setImageGallery: (images: { url: string; alt: string }[]) => ReturnType
    }
  }
}

export const ImageGallery = Node.create<ImageGalleryOptions>({
  name: 'imageGallery',

  group: 'block',

  content: 'inline*',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'image-gallery',
        'data-gallery': 'true',
      },
    }
  },

  addAttributes() {
    return {
      images: {
        default: [],
        parseHTML: (element) => {
          const imgs = element.querySelectorAll('img')
          return Array.from(imgs).map((img) => ({
            url: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || '',
          }))
        },
        renderHTML: () => ({}), // Images are rendered in renderHTML
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div.image-gallery',
      },
      {
        tag: 'div[data-gallery="true"]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const images = node.attrs.images as { url: string; alt: string }[]
    const imageElements = images.map((img) => [
      'img',
      { src: img.url, alt: img.alt || '' },
    ])

    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      ...imageElements,
    ]
  },

  addCommands() {
    return {
      setImageGallery:
        (images) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { images },
          })
        },
    }
  },
})
