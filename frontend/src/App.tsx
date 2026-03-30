import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ModelLayout } from './components/ModelLayout'
import { LegacyAdRedirect } from './components/LegacyRedirect'
import { LandingPage } from './pages/LandingPage'
import { AdDetailPage } from './pages/AdDetailPage'
import { StatsPage } from './pages/StatsPage'
import { RankingPage } from './pages/RankingPage'
import { CrawlPage } from './pages/CrawlPage'
import { CatalogPage } from './pages/CatalogPage'
import { AdsPage } from './pages/AdsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/models/:slug" element={<ModelLayout />}>
                <Route index element={<Navigate to="rankings" replace />} />
                <Route path="rankings" element={<RankingPage />} />
                <Route path="ads" element={<AdsPage />} />
                <Route path="ads/:id" element={<AdDetailPage />} />
                <Route path="stats" element={<StatsPage />} />
                <Route path="crawl" element={<CrawlPage />} />
                <Route path="crawl/:sessionId" element={<CrawlPage />} />
                <Route path="crawl/:sessionId/ad/:adId" element={<CrawlPage />} />
                <Route path="catalog" element={<CatalogPage />} />
              </Route>
              {/* Legacy redirects */}
              <Route path="/models" element={<Navigate to="/" replace />} />
              <Route path="/rankings" element={<Navigate to="/models/himalayan-450/rankings" replace />} />
              <Route path="/stats" element={<Navigate to="/models/himalayan-450/stats" replace />} />
              <Route path="/catalog" element={<Navigate to="/models/himalayan-450/catalog" replace />} />
              <Route path="/crawl" element={<Navigate to="/models/himalayan-450/crawl" replace />} />
              <Route path="/ads/:id" element={<LegacyAdRedirect />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
