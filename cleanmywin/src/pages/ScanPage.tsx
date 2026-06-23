import { ScanRulesTable } from '@/components/scan/ScanRulesTable'
import { useScanRules } from '@/hooks/useScanRules'

export function ScanPage() {
  const {
    rules,
    enabledIds,
    pageState,
    toggleRule,
    toggleAll,
  } = useScanRules()

  return (
    <div className="flex flex-1 flex-col gap-4 px-8 py-6 select-none overflow-hidden min-h-0">
      <ScanRulesTable
        rules={rules}
        enabledIds={enabledIds}
        pageState={pageState}
        onToggleRule={toggleRule}
        onToggleAll={toggleAll}
      />
    </div>
  )
}
