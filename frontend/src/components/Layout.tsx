import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useTheme } from '../hooks/useTheme'

export function Layout() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <div className="min-h-screen relative">
      {/* Layered ambient atmosphere — different treatment per theme */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {isDark ? (
          <>
            {/* Dark: colored glows for atmosphere */}
            <div className="absolute -top-32 right-[15%] w-[700px] h-[500px] bg-amber-500/[0.04] rounded-full blur-[140px]" />
            <div className="absolute bottom-[10%] -left-32 w-[500px] h-[500px] bg-blue-500/[0.025] rounded-full blur-[120px]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-amber-900/[0.015] rounded-full blur-[160px]" />
          </>
        ) : (
          <>
            {/* Light: warm subtle gradient for depth, not colored glows */}
            <div className="absolute -top-40 right-[10%] w-[800px] h-[600px] rounded-full blur-[160px]" style={{ background: 'radial-gradient(ellipse, rgba(212,168,83,0.06) 0%, transparent 70%)' }} />
            <div className="absolute bottom-[5%] -left-40 w-[600px] h-[600px] rounded-full blur-[140px]" style={{ background: 'radial-gradient(ellipse, rgba(180,140,60,0.04) 0%, transparent 70%)' }} />
          </>
        )}
        {/* Top edge accent — shared, adapts via opacity */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/[0.08] to-transparent" />
      </div>
      {/* Centered shell */}
      <div className="max-w-[1600px] mx-auto flex relative">
        <Sidebar />
        <main className="flex-1 min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 relative z-10">
          <div className="max-w-7xl mx-auto px-5 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
