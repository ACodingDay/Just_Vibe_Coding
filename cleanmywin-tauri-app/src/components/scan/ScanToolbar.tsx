import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/format'
import { Loader2, Search, Trash2 } from 'lucide-react'
import type { ScanPageState } from '@/types/scan'

interface ScanToolbarProps {
  pageState: ScanPageState
  totalSize: number
  enabledCount: number
  onScan: () => void
  onClean: () => void
}

export function ScanToolbar({
  pageState,
  totalSize,
  enabledCount,
  onScan,
  onClean,
}: ScanToolbarProps) {
  return (
    <div className="flex items-center justify-between border-t pt-4">
      <div className="text-sm text-muted-foreground">
        {pageState === 'scanned' || pageState === 'cleaned' ? (
          <span>
            已选择 <span className="font-medium text-foreground">{enabledCount}</span> 项，
            共发现{' '}
            <span className="font-semibold text-primary">{formatBytes(totalSize)}</span>{' '}
            可清理
          </span>
        ) : pageState === 'cleaning' ? (
          <span>正在清理中...</span>
        ) : (
          <span>选择要扫描的规则，点击"开始扫描"</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={onScan}
          disabled={pageState === 'scanning' || pageState === 'cleaning' || enabledCount === 0}
        >
          {pageState === 'scanning' ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              扫描中...
            </>
          ) : (
            <>
              <Search className="size-4" />
              {pageState === 'scanned' || pageState === 'cleaned' ? '重新扫描' : '开始扫描'}
            </>
          )}
        </Button>

        <Button
          onClick={onClean}
          disabled={
            pageState !== 'scanned' || enabledCount === 0
          }
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {pageState === 'cleaning' ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              清理中...
            </>
          ) : (
            <>
              <Trash2 className="size-4" />
              一键清理
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
