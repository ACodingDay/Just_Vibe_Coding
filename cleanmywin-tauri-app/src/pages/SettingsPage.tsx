import { useState, useEffect } from "react";
import { Palette, Bell, Info, Check, Sun, Moon } from "lucide-react";
import { setCloseToTrayCache } from "@/lib/closeTrayCache";
import { useTheme, THEMES, type ThemeId } from "@/hooks/useTheme";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";

type SettingTab = "appearance" | "notification" | "about";

function badgeStyle(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const light = r * 0.299 + g * 0.587 + b * 0.114 > 220;
  return light
    ? { backgroundColor: "#0a0a0a", color: "#f0f0f0" }
    : { backgroundColor: hex, color: "#f0f0f0" };
}

const settingTabs: {
  id: SettingTab;
  icon: typeof Palette;
  label: string;
  desc: string;
}[] = [
  {
    id: "appearance",
    icon: Palette,
    label: "外观",
    desc: "主题、颜色、界面设置",
  },
  { id: "notification", icon: Bell, label: "通知", desc: "提醒方式与通知频率" },
  { id: "about", icon: Info, label: "关于", desc: "版本信息与许可证" },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingTab>("appearance");
  const [notifyScan, setNotifyScan] = useState(true);
  const [closeToTray, setCloseToTray] = useState(false);
  const { theme, mode, setTheme, toggleMode } = useTheme();

  useEffect(() => {
    import("@tauri-apps/plugin-store").then(({ load }) => {
      load("settings.json").then((store) => {
        store.get<boolean>("notify_scan_complete").then((v) => {
          if (v !== null && v !== undefined) setNotifyScan(v);
        });
        store.get<boolean>("close_to_tray").then((v) => {
          if (v !== null && v !== undefined) setCloseToTray(v);
        });
      });
    });
  }, []);

  function persistSetting(key: string, value: unknown) {
    import("@tauri-apps/plugin-store").then(({ load }) => {
      load("settings.json").then((store) => {
        store.set(key, value);
        store.save();
      });
    });
  }

  function handleNotifyScanChange(checked: boolean) {
    setNotifyScan(checked);
    import("@tauri-apps/plugin-store").then(({ load }) => {
      load("settings.json").then((store) => {
        store.set("notify_scan_complete", checked);
        store.save();
      });
    });
  }

  function renderContent() {
    switch (activeTab) {
      case "appearance":
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
                      <p className="text-sm font-medium text-foreground">
                        {t.label}
                      </p>
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
                      {isActive && (
                        <Check className="size-3.5" strokeWidth={2.5} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case "notification":
        return (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-foreground">通知设置</h3>
            <Item size="sm" variant="outline">
              <ItemContent>
                <ItemTitle>扫描完成通知</ItemTitle>
                <ItemDescription>发送系统通知</ItemDescription>
              </ItemContent>
              <Switch
                checked={notifyScan}
                onCheckedChange={handleNotifyScanChange}
              />
            </Item>
            <Item size="sm" variant="outline">
              <ItemContent>
                <ItemTitle>关闭窗口时最小化到托盘</ItemTitle>
                <ItemDescription>点击关闭按钮时不退出，隐藏到系统托盘</ItemDescription>
              </ItemContent>
              <Switch
                checked={closeToTray}
                onCheckedChange={(checked) => {
                  setCloseToTray(checked);
                  setCloseToTrayCache(checked);
                  persistSetting("close_to_tray", checked);
                }}
              />
            </Item>
          </div>
        );

      case "about":
        return (
          <div className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold text-foreground">关于</h3>
            <Item size="sm" variant="outline">
              <ItemContent>
                <ItemTitle>CleanMyWin</ItemTitle>
                <ItemDescription>版本 0.1.0</ItemDescription>
              </ItemContent>
            </Item>
            <p className="text-xs text-muted-foreground">
              基于 Tauri + React 构建的 Windows 系统清理工具。
            </p>
          </div>
        );
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex basis-[30%] flex-col gap-1 overflow-y-auto border-r border-border p-4">
        {settingTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              <Icon className="size-5 shrink-0" strokeWidth={1.8} />
              <div>
                <p className="text-sm font-medium">{tab.label}</p>
                <p className="text-xs opacity-70">{tab.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex basis-[70%] flex-col overflow-y-auto p-6">
        {renderContent()}
      </div>
    </div>
  );
}
