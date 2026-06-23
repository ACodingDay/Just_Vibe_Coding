import { Minus, Square, Maximize2, X } from 'lucide-react'
import { useWindowControls } from '@/hooks/useWindowControls'

export function TitleBar() {
  const {
    isMaximized,
    handleStartDragging,
    handleMinimize,
    handleToggleMaximize,
    handleClose,
  } = useWindowControls()

  return (
    <div
      className="flex h-8 items-center select-none bg-titlebar-bg"
      onMouseDown={handleStartDragging}
    >
      {/* 拖拽区域占满剩余空间 */}
      <div className="flex-1" data-tauri-drag-region />

      {/* 窗口控制按钮 */}
      <div className="flex h-full" onMouseDown={(e) => e.stopPropagation()}>
        <button
          onClick={handleMinimize}
          className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-titlebar-btn-hover hover:text-foreground"
        >
          <Minus className="size-3.5" strokeWidth={2} />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-titlebar-btn-hover hover:text-foreground"
        >
          {isMaximized ? (
            <Maximize2 className="size-3.5" strokeWidth={2} />
          ) : (
            <Square className="size-3" strokeWidth={2} />
          )}
        </button>
        <button
          onClick={handleClose}
          className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-titlebar-close-hover hover:text-white"
        >
          <X className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
