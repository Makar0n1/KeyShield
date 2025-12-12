// ========== Blog Types ==========

export interface BlogPost {
  _id: string
  title: string
  slug: string
  summary?: string
  excerpt?: string
  content: string
  coverImage?: string
  coverImageAlt?: string
  category?: BlogCategory
  tags?: BlogTag[]
  status: 'draft' | 'published'
  publishedAt?: string
  views: number
  likes: number
  dislikes: number
  commentsCount: number
  shares: number
  seoTitle?: string
  seoDescription?: string
  seoKeywords?: string
  faq?: Array<{ question: string; answer: string }>
  interlinks?: Array<{ text: string; slug: string }>
  readTime?: number
  featured?: boolean
  allowComments?: boolean
  notifySubscribers?: boolean
  createdAt: string
  updatedAt: string
}

export interface BlogCategory {
  _id: string
  name: string
  slug: string
  description?: string
  coverImage?: string
  coverImageAlt?: string
  seoTitle?: string
  seoDescription?: string
  sortOrder: number
  postsCount?: number
  createdAt?: string
}

export interface BlogTag {
  _id: string
  name: string
  slug: string
  description?: string
  color?: string
  seoTitle?: string
  seoDescription?: string
  postsCount?: number
  createdAt?: string
}

export interface BlogComment {
  _id: string
  postId: string
  post?: BlogPost | { slug: string; title: string }
  authorName: string
  authorEmail?: string
  content: string
  status: 'pending' | 'approved' | 'hidden'
  likes: number
  dislikes: number
  ip?: string
  createdAt: string
}

export interface BlogMedia {
  _id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  path: string
  url: string
  alt?: string
  createdAt: string
}

export interface BlogSettings {
  _id: string
  siteTitle: string
  siteDescription: string
  postsPerPage: number
  allowComments: boolean
  moderateComments: boolean
  showAuthor: boolean
  showDate: boolean
  showViews: boolean
  showLikes: boolean
  showShares: boolean
  socialLinks?: {
    telegram?: string
    twitter?: string
    facebook?: string
  }
}

export interface BlogSidebarData {
  categories: BlogCategory[]
  tags: BlogTag[]
  recentPosts: BlogPost[]
}

// ========== Deal Types ==========

export type DealStatus =
  | 'created'
  | 'waiting_for_seller_wallet'
  | 'waiting_for_buyer_wallet'
  | 'waiting_for_deposit'
  | 'locked'
  | 'in_progress'
  | 'work_submitted'
  | 'completed'
  | 'dispute'
  | 'resolved'
  | 'expired'
  | 'cancelled'
  | 'refunded'

export interface Deal {
  _id: string
  dealId: string
  initiatorId: number
  counterpartyId?: number
  buyerId: number
  sellerId: number
  initiatorRole: 'buyer' | 'seller'
  productName: string
  description: string
  amount: number
  asset: string
  commission: number
  commissionType: 'buyer' | 'seller' | 'split'
  status: DealStatus
  multisigAddress?: string
  buyerAddress?: string
  sellerAddress?: string
  depositTxHash?: string
  payoutTxHash?: string
  deadline: string
  createdAt: string
  completedAt?: string
  platformCode?: string
  operationalCosts?: {
    // Activation costs
    activationTrxSent?: number
    activationTxFee?: number
    activationTrxReturned?: number
    activationTrxNet?: number
    // Energy costs
    energyMethod?: 'feesaver' | 'trx' | 'none'
    feesaverCostTrx?: number
    fallbackTrxSent?: number
    fallbackTxFee?: number
    fallbackTrxReturned?: number
    fallbackTrxNet?: number
    // Totals
    totalTrxSpent?: number
    totalCostUsd?: number
    trxPriceAtCompletion?: number
    // Legacy
    operations?: Array<{
      operation: string
      trxSpent: number
      costUsd: number
      timestamp: string
    }>
  }
  workSubmission?: {
    description: string
    submittedAt: string
  }
}

// ========== User Types ==========

export interface User {
  _id: string
  telegramId: number
  username?: string
  firstName?: string
  lastName?: string
  languageCode?: string
  role: 'buyer' | 'seller' | 'both'
  blacklisted: boolean
  blacklistReason?: string
  disputeStats: {
    totalWon: number
    totalLost: number
    lossStreak: number
  }
  platformCode?: string
  referralCode?: string
  referredBy?: string
  createdAt: string
  lastActivity?: string
}

// ========== Dispute Types ==========

export type DisputeStatus = 'open' | 'in_review' | 'resolved' | 'pending'

export interface DisputeComment {
  userId: number
  text: string
  media: string[]
  createdAt: string
}

export interface Dispute {
  _id: string
  dealId: Deal | string
  // Backend uses openedBy, frontend alias initiatorId
  openedBy: number
  initiatorId?: number // alias for openedBy
  // Backend uses reasonText, frontend alias reason
  reasonText: string
  reason?: string // alias for reasonText
  // Backend uses media, frontend alias evidence
  media: string[]
  evidence?: string[] // alias for media
  comments?: DisputeComment[]
  counterEvidence?: string[]
  status: DisputeStatus
  decision?: string | null
  winner?: 'buyer' | 'seller'
  arbiterId?: number | null
  resolvedBy?: string
  resolvedAt?: string
  createdAt: string
}

// ========== Platform/Partner Types ==========

export interface Platform {
  _id: string
  code: string
  name: string
  telegramChannel?: string
  login: string
  password?: string
  commissionPercent: number
  isActive: boolean
  stats: {
    totalUsers: number
    totalDeals: number
    completedDeals?: number
    cancelledDeals?: number
    disputedDeals?: number
    activeDeals?: number
    totalVolume: number
    totalCommission: number
    totalTrxSpent?: number
    totalTrxSpentUsdt?: number
    netProfit?: number
    platformEarnings?: number
  }
  createdAt: string
  updatedAt?: string
}

// ========== Transaction Types ==========

export interface Transaction {
  _id: string
  dealId: string
  type: 'deposit' | 'payout' | 'refund' | 'commission'
  txHash: string
  fromAddress: string
  toAddress: string
  amount: number
  asset: string
  status: 'pending' | 'confirmed' | 'failed'
  block?: number
  timestamp: string
}

// ========== Export Types ==========

export interface ExportLog {
  _id: string
  type: 'deal' | 'user' | 'report'
  referenceId?: string
  filename: string
  format: 'pdf' | 'csv' | 'xlsx'
  size: number
  createdBy: string
  createdAt: string
}

// ========== API Response Types ==========

export interface ApiResponse<T = unknown> {
  success: boolean
  error?: string
  message?: string
  data?: T
}

export interface PaginatedResponse<T> {
  success: boolean
  posts?: T[]
  items?: T[]
  total: number
  totalPages?: number
  page?: number
  limit?: number
}

export interface BlogPostsResponse extends PaginatedResponse<BlogPost> {
  posts: BlogPost[]
}

// ========== Admin Types ==========

export interface AdminFinanceStats {
  totalVolume: string
  totalCommission: string
  totalTrxSpent: string
  totalTrxSpentUsdt: string
  totalCostUsd: string
  netProfit: string
  trxRate: number
  trxPerDeal: string
  avgTrxPerDeal: string
  avgCostPerDeal: string
  dealsWithCostData: number
  feesaverDeals: number
  fallbackDeals: number
}

export interface PartnerDetail {
  name: string
  code: string
  deals: number
  commission: number
  costUsd: number
  netProfit: number
  percent: number
  payout: number
}

export interface AdminPartnersStats {
  count: number
  totalPayouts: string
  pureProfit: string
  details: PartnerDetail[]
}

export interface AdminStats {
  deals: {
    total: number
    active: number
    completed: number
    disputed: number
    resolved: number
    cancelled: number
    expired: number
    finished: number
  }
  users: {
    total: number
    banned: number
  }
  finance: AdminFinanceStats
  partners: AdminPartnersStats
  // Legacy fields for backward compat
  totalDeals: number
  activeDeals: number
  completedDeals: number
  totalVolume: number
  totalCommission: number
  totalUsers: number
  activeDisputes: number
  todayDeals: number
  todayVolume: number
}

export interface AdminUser {
  username: string
  role: 'admin' | 'superadmin'
}
