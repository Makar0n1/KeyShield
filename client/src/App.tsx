import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PublicLayout, AdminLayout } from '@/components/layout'
import { PartnerLayout } from '@/layouts/PartnerLayout'
import { PartnerAuthProvider, usePartnerAuth } from '@/contexts/PartnerAuthContext'

// Protected route wrapper for partner pages
function PartnerProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = usePartnerAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/partner/login" replace />
  }

  return <>{children}</>
}
import {
  HomePage,
  NotFoundPage,
  TermsPage,
  PrivacyPage,
  OfferPage,
} from '@/pages/public'
import {
  BlogListPage,
  BlogPostPage,
  CategoryPage,
  TagPage,
} from '@/pages/blog'
import {
  AdminLoginPage,
  AdminDashboardPage,
  AdminDealsPage,
  AdminDealDetailsPage,
  AdminUsersPage,
  AdminUserDetailsPage,
  AdminDisputesPage,
  AdminDisputeDetailsPage,
  AdminPlatformsPage,
  AdminExportsPage,
  AdminTransactionsPage,
  AdminIpCheckPage,
} from '@/pages/admin'
import {
  BlogPostsPage,
  BlogPostEditorPage,
  BlogCategoriesPage,
  BlogTagsPage,
  BlogMediaPage,
  BlogCommentsPage,
  BlogSettingsPage,
} from '@/pages/admin/blog'
import {
  PartnerLoginPage,
  PartnerDashboardPage,
  PartnerUsersPage,
  PartnerDealsPage,
  PartnerSettingsPage,
} from '@/pages/partner'

// Create a React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public Routes with Header/Footer */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/offer" element={<OfferPage />} />

            {/* Blog routes */}
            <Route path="/blog" element={<BlogListPage />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/category/:slug" element={<CategoryPage />} />
            <Route path="/tag/:slug" element={<TagPage />} />

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Admin Login (no layout) */}
          <Route path="/admin/login" element={<AdminLoginPage />} />

          {/* Admin Routes with AdminLayout */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="deals" element={<AdminDealsPage />} />
            <Route path="deals/:id" element={<AdminDealDetailsPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="users/:telegramId" element={<AdminUserDetailsPage />} />
            <Route path="disputes" element={<AdminDisputesPage />} />
            <Route path="disputes/:id" element={<AdminDisputeDetailsPage />} />
            <Route path="platforms" element={<AdminPlatformsPage />} />
            <Route path="exports" element={<AdminExportsPage />} />
            <Route path="transactions" element={<AdminTransactionsPage />} />
            <Route path="ip-check" element={<AdminIpCheckPage />} />
            {/* Blog admin routes */}
            <Route path="blog" element={<Navigate to="/admin/blog/posts" replace />} />
            <Route path="blog/posts" element={<BlogPostsPage />} />
            <Route path="blog/posts/new" element={<BlogPostEditorPage />} />
            <Route path="blog/posts/:id" element={<BlogPostEditorPage />} />
            <Route path="blog/categories" element={<BlogCategoriesPage />} />
            <Route path="blog/tags" element={<BlogTagsPage />} />
            <Route path="blog/media" element={<BlogMediaPage />} />
            <Route path="blog/comments" element={<BlogCommentsPage />} />
            <Route path="blog/settings" element={<BlogSettingsPage />} />
          </Route>

          {/* Partner Login (needs auth provider for login function) */}
          <Route
            path="/partner/login"
            element={
              <PartnerAuthProvider>
                <PartnerLoginPage />
              </PartnerAuthProvider>
            }
          />

          {/* Partner Routes with PartnerLayout */}
          <Route
            path="/partner"
            element={
              <PartnerAuthProvider>
                <PartnerProtectedRoute>
                  <PartnerLayout />
                </PartnerProtectedRoute>
              </PartnerAuthProvider>
            }
          >
            <Route index element={<PartnerDashboardPage />} />
            <Route path="users" element={<PartnerUsersPage />} />
            <Route path="deals" element={<PartnerDealsPage />} />
            <Route path="settings" element={<PartnerSettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
