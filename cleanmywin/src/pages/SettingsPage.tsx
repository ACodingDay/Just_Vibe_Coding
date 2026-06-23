import { useState } from "react";
import { Palette, Bell, Info } from "lucide-react";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { AppearancePanel } from "@/components/settings/AppearancePanel";
import { NotificationPanel } from "@/components/settings/NotificationPanel";
import { AboutPanel } from "@/components/settings/AboutPanel";

type SettingTab = "appearance" | "notification" | "about";

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

const tabPanels: Record<SettingTab, React.FC> = {
  appearance: AppearancePanel,
  notification: NotificationPanel,
  about: AboutPanel,
};

const springTransition = {
  type: "spring" as const,
  stiffness: 350,
  damping: 30,
  mass: 0.8,
};

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingTab>("appearance");
  const ActivePanel = tabPanels[activeTab];

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex basis-[30%] flex-col gap-1 overflow-y-auto border-r border-border p-4">
        <AnimatedBackground
          value={activeTab}
          onValueChange={(id) => id && setActiveTab(id as SettingTab)}
          className="rounded-lg bg-primary/10"
          transition={springTransition}
        >
          {settingTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                data-id={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors data-[checked=true]:text-primary data-[checked=false]:text-muted-foreground data-[checked=false]:hover:bg-accent/50 data-[checked=false]:hover:text-foreground"
                style={{ borderRadius: "0.5rem" }}
              >
                <Icon className="size-5 shrink-0" strokeWidth={1.8} />
                <div>
                  <p className="text-sm font-medium">{tab.label}</p>
                  <p className="text-xs opacity-70">{tab.desc}</p>
                </div>
              </button>
            );
          })}
        </AnimatedBackground>
      </div>
      <div className="flex basis-[70%] flex-col overflow-y-auto p-6">
        <ActivePanel />
      </div>
    </div>
  );
}
