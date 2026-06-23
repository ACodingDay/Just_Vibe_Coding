import { createColumnHelper } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { BaseRule, ScanPageState } from "@/types/scan";
import { CATEGORY_LABELS, RISK_LABELS } from "@/types/scan";

interface ColumnContext {
  enabledIds: Set<string>;
  pageState: ScanPageState;
  onToggleRule: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  allSafeChecked: boolean;
  isOperating: boolean;
}

const columnHelper = createColumnHelper<BaseRule>();

export function createColumns(ctx: ColumnContext) {
  return [
    columnHelper.display({
      id: "select",
      enableSorting: false,
      header: () => (
        <Checkbox
          checked={ctx.allSafeChecked}
          onCheckedChange={(checked) => ctx.onToggleAll(!!checked)}
          disabled={ctx.isOperating}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={ctx.enabledIds.has(row.original.id)}
          onCheckedChange={() => ctx.onToggleRule(row.original.id)}
          disabled={
            ctx.pageState === "scanning" || ctx.pageState === "cleaning"
          }
        />
      ),
      size: 40,
    }),
    columnHelper.accessor("name", {
      enableSorting: false,
      header: "基本规则",
      cell: ({ row }) => (
        <div className="flex flex-col min-w-0">
          <span className="truncate font-medium">{row.original.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {row.original.description}
          </span>
        </div>
      ),
    }),
    columnHelper.accessor("category", {
      enableSorting: false,
      header: "分类",
      cell: ({ row }) => {
        const cat = row.original.category;
        const variant =
          cat === "AdvancedClean"
            ? "destructive"
            : cat === "BrowserClean"
              ? "secondary"
              : cat === "DevClean"
                ? "outline"
                : cat === "AppClean"
                  ? "default"
                  : cat === "UserCustom"
                    ? "outline"
                    : "secondary";
        return (
          <Badge variant={variant} className="text-xs">
            {CATEGORY_LABELS[cat]}
          </Badge>
        );
      },
      size: 100,
    }),
    columnHelper.accessor("risk_level", {
      sortingFn: (rowA: any, rowB: any) => {
        const order: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
        return order[rowA.original.risk_level] - order[rowB.original.risk_level];
      },
      header: "风险",
      cell: ({ row }) => {
        const risk = row.original.risk_level;
        const color = risk === "Medium" ? "#ffd73d" : risk === "Low" ? "#2AAE6F" : undefined;
        const variant = risk === "High" ? "destructive" : "default";
        return (
          <Badge variant={variant} className="text-xs text-white" style={color ? { backgroundColor: color } : undefined}>
            {RISK_LABELS[risk]}
          </Badge>
        );
      },
      size: 80,
    }),
  ];
}
