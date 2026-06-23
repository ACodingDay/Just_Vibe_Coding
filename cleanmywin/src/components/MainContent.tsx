import { lazy, Suspense, useId } from 'react'
import type { PageId } from '@/components/Sidebar'

const HomePage = lazy(() => import('@/pages/HomePage').then(m => ({ default: m.HomePage }))) as React.LazyExoticComponent<React.ComponentType<{ onQuickScan: () => void }>>
const CleanupPage = lazy(() => import('@/pages/CleanupPage').then(m => ({ default: m.CleanupPage }))) as React.LazyExoticComponent<React.ComponentType<{ autoStartScan?: boolean }>>
const ScanPage = lazy(() => import('@/pages/ScanPage').then(m => ({ default: m.ScanPage })))
const CustomPage = lazy(() => import('@/pages/CustomPage').then(m => ({ default: m.CustomPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))

interface MainContentProps {
  activePage: PageId
  onPageChange: (page: PageId) => void
  autoCleanupScan: boolean
  setAutoCleanupScan: (v: boolean) => void
}

function PageFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <span className="text-sm text-muted-foreground">加载中...</span>
    </div>
  )
}

export function MainContent({ activePage, onPageChange, autoCleanupScan, setAutoCleanupScan }: MainContentProps) {
  const id = useId()
  const key = `${activePage}-${id}`

  function handleQuickScan() {
    setAutoCleanupScan(true)
    onPageChange('cleanup')
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Suspense fallback={<PageFallback />}>
        {activePage === 'home' && (
          <HomePage key={key} onQuickScan={handleQuickScan} />
        )}
        {activePage === 'cleanup' && (
          <CleanupPage key={key} autoStartScan={autoCleanupScan} />
        )}
        {activePage === 'scan' && (
          <ScanPage key={key} />
        )}
        {activePage === 'custom' && (
          <CustomPage key={key} />
        )}
        {activePage === 'settings' && (
          <SettingsPage key={key} />
        )}
      </Suspense>
    </div>
  )
}
