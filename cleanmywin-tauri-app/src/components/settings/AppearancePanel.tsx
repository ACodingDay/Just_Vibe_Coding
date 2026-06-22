import { Check, Sun, Moon } from "lucide-react";
import { useTheme, THEMES, type ThemeId } from "@/hooks/useTheme";
import { useNumberAnimation } from "@/hooks/useNumberAnimation";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";

function badgeStyle(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const light = r * 0.299 + g * 0.587 + b * 0.114 > 220;
  return light
    ? { backgroundColor: "#0a0a0a", color: "#f0f0f0" }
    : { backgroundColor: hex, color: "#f0f0f0" };
}

export function AppearancePanel() {
  const { theme, mode, setTheme, toggleMode } = useTheme();
  const { enabled: numAnim, setEnabled: setNumAnim } = useNumberAnimation();

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-lg font-semibold text-foreground">外观设置</h3>

      <Item size="sm" variant="outline">
        <ItemContent>
          <ItemTitle>显示模式</ItemTitle>
        </ItemContent>
        <button
          onClick={toggleMode}
          className="relative flex h-8 w-30 items-center rounded-full bg-secondary p-1 transition-colors shrink-0"
        >
          <div
            className={`absolute z-10 flex h-6 w-14 items-center justify-center gap-1 rounded-full bg-primary text-primary-foreground text-xs transition-all ${mode === "dark" ? "left-[calc(100%-60px)]" : "left-1"}`}
          >
            {mode === "light" ? (
              <Sun className="size-3" />
            ) : (
              <Moon className="size-3" />
            )}
            <span className="text-[11px] font-medium">
              {mode === "light" ? "白昼" : "暗夜"}
            </span>
          </div>
          <span
            className={`absolute text-[11px] text-foreground/70 transition-all ${mode === "light" ? "right-2.5" : "left-2.5"}`}
          >
            {mode === "light" ? "暗夜" : "白昼"}
          </span>
        </button>
      </Item>

      <Item size="sm" variant="outline">
        <ItemContent>
          <ItemTitle>数字动画</ItemTitle>
          <ItemDescription>是否使用平滑过渡效果</ItemDescription>
        </ItemContent>
        <Switch checked={numAnim} onCheckedChange={setNumAnim} />
      </Item>

      <p className="text-sm text-muted-foreground">选择主题配色方案</p>
      <div className="grid gap-3">
        {THEMES.map((t) => {
          const isActive = theme === t.id;
          const colors = mode === "light" ? t.lightColors : t.darkColors;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id as ThemeId)}
              className={`flex items-center gap-4 rounded-lg border p-4 text-left transition-all ${isActive ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"}`}
            >
              <div className="flex h-10 w-24 shrink-0 overflow-hidden rounded-md border border-border">
                {colors.map((c, i) => (
                  <div
                    key={i}
                    className="flex-1"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <p className="text-sm font-medium text-foreground">{t.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {colors.map((c, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] leading-none"
                      style={badgeStyle(c)}
                    >
                      <span
                        className="inline-block size-2 rounded-full border border-current/20"
                        style={{ backgroundColor: c }}
                      />
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className={`flex size-6 shrink-0 items-center justify-center rounded-full transition-colors ${isActive ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              >
                {isActive && <Check className="size-3.5" strokeWidth={2.5} />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
