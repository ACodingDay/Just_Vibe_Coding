import { useMemo } from 'react'
import { DataTable } from '@/components/ui/data-table'
import { createColumns } from './columns'
import type { BaseRule, ScanPageState } from '@/types/scan'

interface ScanRulesTableProps {
  rules: BaseRule[]
  enabledIds: Set<string>
  pageState: ScanPageState
  onToggleRule: (id: string) => void
  onToggleAll: (checked: boolean) => void
}

export function ScanRulesTable({
  rules,
  enabledIds,
  pageState,
  onToggleRule,
  onToggleAll,
}: ScanRulesTableProps) {
  const isOperating = pageState === 'scanning' || pageState === 'cleaning'

  const allSafeChecked =
    rules.filter((r) => !r.is_interactive).length > 0 &&
    rules
      .filter((r) => !r.is_interactive)
      .every((r) => enabledIds.has(r.id))

  const columns = useMemo<ReturnType<typeof createColumns>>(
    () => createColumns({ enabledIds, pageState, onToggleRule, onToggleAll, allSafeChecked, isOperating }),
    [enabledIds, pageState, onToggleRule, onToggleAll, allSafeChecked, isOperating]
  )

  const getRowClassName = (row: BaseRule) =>
    row.risk_level === 'High' ? 'bg-destructive/5' : undefined

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <DataTable
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        columns={columns as any}
        data={rules}
        defaultPageSize={10}
        getRowClassName={getRowClassName}
        className="flex flex-1 flex-col min-h-0"
      />
    </div>
  )
}
