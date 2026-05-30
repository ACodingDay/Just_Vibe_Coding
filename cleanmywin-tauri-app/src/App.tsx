import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar, type PageId } from '@/components/Sidebar'
import { MainContent } from '@/components/MainContent'
import { Toaster } from '@/components/ui/sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { getCloseToTrayCache, setCloseToTrayCache, getIsOperating } from '@/lib/closeTrayCache'

function App() {
  const [activePage, setActivePage] = useState<PageId>('home')
  const [autoCleanupScan, setAutoCleanupScan] = useState(false)
  const [exitDialogOpen, setExitDialogOpen] = useState(false)

  // 初始化：从 store 加载关闭行为设置
  useEffect(() => {
    import('@tauri-apps/plugin-store').then(({ load }) => {
      load('settings.json').then((store) => {
        store.get<boolean>('close_to_tray').then((v) => {
          setCloseToTrayCache(v ?? false);
        });
      });
    });
  }, []);

  // 关闭窗口：同步读取缓存变量，避免异步延迟导致关闭失效
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      if (getCloseToTrayCache()) {
        // 托盘模式：隐藏到托盘
        await appWindow.hide();
      } else if (getIsOperating()) {
        // 正在扫描/清理：打开 shadcn 确认框
        setExitDialogOpen(true);
      } else {
        await appWindow.destroy();
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

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

      <AlertDialog open={exitDialogOpen} onOpenChange={setExitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定退出？</AlertDialogTitle>
            <AlertDialogDescription>
              正在扫描或清理中，退出将中断当前操作。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              await getCurrentWindow().destroy();
            }}>
              退出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default App