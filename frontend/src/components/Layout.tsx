import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function Layout() {
  return (
    <div className="flex min-h-screen relative">
      {/* Layered ambient atmosphere */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Primary warm glow — top right */}
        <div className="absolute -top-32 right-[15%] w-[700px] h-[500px] bg-amber-500/[0.04] rounded-full blur-[140px]" />
        {/* Secondary cool accent — bottom left */}
        <div className="absolute bottom-[10%] -left-32 w-[500px] h-[500px] bg-blue-500/[0.025] rounded-full blur-[120px]" />
        {/* Subtle center warmth */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-amber-900/[0.015] rounded-full blur-[160px]" />
        {/* Top edge vignette */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/[0.08] to-transparent" />
      </div>
      <Sidebar />
      <main className="flex-1 ml-0 md:ml-60 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 relative z-10">
        <div className="max-w-7xl mx-auto px-5 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
