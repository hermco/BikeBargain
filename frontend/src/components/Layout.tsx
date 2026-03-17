import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function Layout() {
  return (
    <div className="flex min-h-screen relative">
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-amber-500/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/6 w-[400px] h-[400px] bg-blue-500/[0.02] rounded-full blur-[100px]" />
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
