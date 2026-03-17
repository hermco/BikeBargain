import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { AdsPage } from './pages/AdsPage'
import { AdDetailPage } from './pages/AdDetailPage'
import { StatsPage } from './pages/StatsPage'
import { RankingPage } from './pages/RankingPage'
import { CrawlPage } from './pages/CrawlPage'
import { CatalogPage } from './pages/CatalogPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<AdsPage />} />
              <Route path="/ads/:id" element={<AdDetailPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/rankings" element={<RankingPage />} />
              <Route path="/crawl" element={<CrawlPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
