import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item";

export function AboutPanel() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-foreground">关于</h3>
      <Item size="sm" variant="outline">
        <ItemContent>
          <ItemTitle>CleanMyWin</ItemTitle>
          <ItemDescription>版本 {__APP_VERSION__}</ItemDescription>
        </ItemContent>
      </Item>
      <p className="text-xs text-muted-foreground">
        基于 Tauri + React 构建的 Windows 系统清理工具
      </p>
    </div>
  );
}
