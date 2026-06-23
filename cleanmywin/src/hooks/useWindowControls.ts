import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const appWindow = getCurrentWindow()
    appWindow.isMaximized().then(setIsMaximized).catch(() => {})

    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized).catch(() => {})
    })

    return () => {
      unlisten.then((fn) => fn()).catch(() => {})
    }
  }, [])

  const handleStartDragging = async () => {
    try {
      await getCurrentWindow().startDragging()
    } catch { /* noop */ }
  }

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize()
    } catch { /* noop */ }
  }

  const handleToggleMaximize = async () => {
    try {
      await getCurrentWindow().toggleMaximize()
    } catch { /* noop */ }
  }

  const handleClose = async () => {
    try {
      await getCurrentWindow().close()
    } catch { /* noop */ }
  }

  return {
    isMaximized,
    handleStartDragging,
    handleMinimize,
    handleToggleMaximize,
    handleClose,
  }
}
