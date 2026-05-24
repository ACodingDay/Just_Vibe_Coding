import { useState } from 'react'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar, type PageId } from '@/components/Sidebar'
import { MainContent } from '@/components/MainContent'
import { Toaster } from '@/components/ui/sonner'

function App() {
  const [activePage, setActivePage] = useState<PageId>('home')
  const [autoCleanupScan, setAutoCleanupScan] = useState(false)

  function handlePageChange(page: PageId) {
    if (page !== 'cleanup') setAutoCleanupScan(false)
    setActivePage(page)
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activePage={activePage} onPageChange={handlePageChange} />
        <MainContent
          activePage={activePage}
          onPageChange={handlePageChange}
          autoCleanupScan={autoCleanupScan}
          setAutoCleanupScan={setAutoCleanupScan}
        />
      </div>
      <Toaster />
    </div>
  )
}

export default App
