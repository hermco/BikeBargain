import { useParams, Outlet } from 'react-router-dom'
import { useMemo } from 'react'
import { useBikeModel, useBikeVariants } from '../hooks/queries'
import { ModelCtx, type ModelContext } from '../hooks/useCurrentModel'
import { Sidebar } from './Sidebar'
import { Loader2 } from 'lucide-react'

export function ModelLayout() {
  const { slug } = useParams<{ slug: string }>()
  const { data: modelDetail, isLoading: modelLoading, error: modelError } = useBikeModel(slug ?? '')
  const { data: variants, isLoading: variantsLoading } = useBikeVariants(slug ?? '')

  const ctx = useMemo<ModelContext | null>(() => {
    if (!slug || !modelDetail || !variants) return null
    return {
      slug,
      model: modelDetail,
      variants,
      modelUrl: (path: string) => `/models/${slug}${path.startsWith('/') ? path : '/' + path}`,
    }
  }, [slug, modelDetail, variants])

  if (modelLoading || variantsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  if (modelError || !ctx) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-text-muted">Model not found</p>
          <a href="/" className="text-accent hover:text-accent-text text-sm mt-2 inline-block">
            Back to home
          </a>
        </div>
      </div>
    )
  }

  return (
    <ModelCtx.Provider value={ctx}>
      <div className="min-h-screen relative">
        {/* Ambient background glow */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-amber-500/[0.03] rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 left-1/6 w-[400px] h-[400px] bg-blue-500/[0.02] rounded-full blur-[100px]" />
        </div>
        {/* Centered shell: sidebar + content capped together */}
        <div className="max-w-[1600px] mx-auto flex relative">
          <Sidebar />
          <main className="flex-1 min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 relative z-10">
            <div className="max-w-7xl mx-auto px-5 py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </ModelCtx.Provider>
  )
}
