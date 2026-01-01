import api from './api'
import type {
  BlogPost,
  BlogCategory,
  BlogTag,
  BlogComment,
  BlogSidebarData,
  BlogPostsResponse,
  ApiResponse,
} from '@/types'

// Input type for creating/updating posts (category and tags as IDs)
interface BlogPostInput {
  title: string
  slug?: string
  summary?: string
  content: string
  coverImage?: string
  coverImageAlt?: string
  category?: string
  tags?: string[]
  status?: 'draft' | 'published'
  seoTitle?: string
  seoDescription?: string
  seoKeywords?: string
  faq?: Array<{ question: string; answer: string }>
  notifySubscribers?: boolean
}

export const blogService = {
  // ========== Public API ==========

  getPosts: async (params: {
    page?: number
    limit?: number
    sort?: 'newest' | 'popular' | 'oldest'
    category?: string
    tag?: string
    q?: string
  }): Promise<BlogPostsResponse> => {
    const { data } = await api.get('/blog/posts', { params })
    return data
  },

  getPost: async (slug: string): Promise<BlogPost> => {
    const { data } = await api.get(`/blog/posts/${slug}`)
    return data.post
  },

  getCategories: async (): Promise<BlogCategory[]> => {
    const { data } = await api.get('/blog/categories')
    return data.categories || []
  },

  getTags: async (): Promise<BlogTag[]> => {
    const { data } = await api.get('/blog/tags')
    return data.tags || []
  },

  getSidebar: async (): Promise<BlogSidebarData> => {
    const { data } = await api.get('/blog/sidebar')
    return data
  },

  // Get smart interlinking suggestions for a post
  getInterlinking: async (postId: string): Promise<Array<{ _id: string; title: string; slug: string }>> => {
    const { data } = await api.get(`/blog/interlinking/${postId}`)
    return data.posts || []
  },

  getCategory: async (slug: string): Promise<BlogCategory> => {
    const { data } = await api.get(`/blog/categories/${slug}`)
    return data.category
  },

  getTag: async (slug: string): Promise<BlogTag> => {
    const { data } = await api.get(`/blog/tags/${slug}`)
    return data.tag
  },

  // Voting
  vote: async (
    type: 'post' | 'comment',
    id: string,
    voteType: 'like' | 'dislike',
    visitorId: string
  ): Promise<{ likes: number; dislikes: number }> => {
    const { data } = await api.post('/blog/vote', { type, id, voteType, visitorId })
    return data
  },

  // Comments
  getComments: async (slug: string): Promise<BlogComment[]> => {
    const { data } = await api.get(`/blog/posts/${slug}/comments`)
    return data.comments || []
  },

  addComment: async (
    slug: string,
    comment: { authorName: string; authorEmail?: string; content: string }
  ): Promise<ApiResponse<BlogComment>> => {
    const { data } = await api.post(`/blog/posts/${slug}/comments`, comment)
    return data
  },

  // Search
  search: async (q: string, limit = 10): Promise<BlogPost[]> => {
    const { data } = await api.get('/blog/search', { params: { q, limit } })
    return data.posts || []
  },

  // Share tracking
  trackShare: async (postId: string, platform: string): Promise<void> => {
    await api.post('/blog/share', { postId, platform })
  },
}

// ========== Admin Blog API ==========

export const blogAdminService = {
  // Stats
  getStats: async () => {
    const { data } = await api.get('/admin/blog/stats')
    return data
  },

  // Posts CRUD
  getAllPosts: async (params?: { status?: string; page?: number; limit?: number }) => {
    const { data } = await api.get('/admin/blog/posts', { params })
    return data
  },

  getPostById: async (id: string): Promise<BlogPost> => {
    const { data } = await api.get(`/admin/blog/posts/${id}`)
    return data.post
  },

  createPost: async (post: BlogPostInput): Promise<BlogPost> => {
    const { data } = await api.post('/admin/blog/posts', post)
    return data.post
  },

  updatePost: async (id: string, post: BlogPostInput): Promise<BlogPost> => {
    const { data } = await api.put(`/admin/blog/posts/${id}`, post)
    return data.post
  },

  deletePost: async (id: string): Promise<void> => {
    await api.delete(`/admin/blog/posts/${id}`)
  },

  // Send notification to all bot users
  notifyUsers: async (postId: string): Promise<{ sent: number; failed: number; skipped: number }> => {
    const { data } = await api.post(`/admin/blog/posts/${postId}/notify`)
    return data
  },

  // Categories CRUD
  getAllCategories: async (): Promise<BlogCategory[]> => {
    const { data } = await api.get('/admin/blog/categories')
    return data.categories || []
  },

  createCategory: async (category: Partial<BlogCategory>): Promise<BlogCategory> => {
    const { data } = await api.post('/admin/blog/categories', category)
    return data.category
  },

  updateCategory: async (id: string, category: Partial<BlogCategory>): Promise<BlogCategory> => {
    const { data } = await api.put(`/admin/blog/categories/${id}`, category)
    return data.category
  },

  deleteCategory: async (id: string): Promise<void> => {
    await api.delete(`/admin/blog/categories/${id}`)
  },

  // Tags CRUD
  getAllTags: async (): Promise<BlogTag[]> => {
    const { data } = await api.get('/admin/blog/tags')
    return data.tags || []
  },

  createTag: async (tag: Partial<BlogTag>): Promise<BlogTag> => {
    const { data } = await api.post('/admin/blog/tags', tag)
    return data.tag
  },

  updateTag: async (id: string, tag: Partial<BlogTag>): Promise<BlogTag> => {
    const { data } = await api.put(`/admin/blog/tags/${id}`, tag)
    return data.tag
  },

  deleteTag: async (id: string): Promise<void> => {
    await api.delete(`/admin/blog/tags/${id}`)
  },

  // Comments moderation
  getAllComments: async (params?: { status?: string; page?: number; limit?: number }) => {
    const { data } = await api.get('/admin/blog/comments', { params })
    return data
  },

  updateCommentStatus: async (id: string, status: 'approved' | 'hidden'): Promise<void> => {
    await api.put(`/admin/blog/comments/${id}`, { status })
  },

  deleteComment: async (id: string): Promise<void> => {
    await api.delete(`/admin/blog/comments/${id}`)
  },

  // Media
  uploadMedia: async (file: File): Promise<{ url: string; filename: string }> => {
    const formData = new FormData()
    formData.append('image', file)
    const { data } = await api.post('/admin/blog/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  getAllMedia: async (params?: { page?: number; limit?: number }) => {
    const { data } = await api.get('/admin/blog/media', { params })
    // API returns 'files', map to 'media' for frontend
    return { media: data.files || [], total: data.total || 0, totalPages: 1 }
  },

  deleteMedia: async (filename: string): Promise<void> => {
    await api.delete(`/admin/blog/media/${filename}`)
  },

  // Settings
  getSettings: async () => {
    const { data } = await api.get('/admin/blog/settings')
    return data.settings
  },

  updateSettings: async (settings: Partial<BlogSettings>): Promise<void> => {
    await api.put('/admin/blog/settings', settings)
  },
}

interface BlogSettings {
  siteTitle: string
  siteDescription: string
  postsPerPage: number
  allowComments: boolean
  moderateComments: boolean
}
