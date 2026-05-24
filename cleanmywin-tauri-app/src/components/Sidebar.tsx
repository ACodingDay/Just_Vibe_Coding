import {
  Home,
  Sparkles,
  ScanSearch,
  PencilRuler,
  Settings,
} from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export type PageId = "home" | "cleanup" | "scan" | "custom" | "settings";

const navItems: { id: PageId; icon: typeof Home; label: string }[] = [
  { id: "cleanup", icon: Sparkles, label: "系统清理" },
  { id: "scan", icon: ScanSearch, label: "扫描规则" },
  { id: "custom", icon: PencilRuler, label: "自定义规则" },
];

interface SidebarProps {
  activePage: PageId;
  onPageChange: (page: PageId) => void;
}

const btnSize = "clamp(44px, 5.2vw, 68px)";
const iconSize = "clamp(22px, 2.6vw, 34px)";
const gap = "clamp(8px, 1vw, 16px)";
const radius = "clamp(10px, 1.2vw, 16px)";
const py = "clamp(12px, 2vw, 28px)";
const dividerW = "clamp(28px, 4vw, 52px)";
const mb = "clamp(12px, 1.5vw, 20px)";

const btnBase =
  "flex items-center justify-center transition-colors cursor-pointer";
const active = "bg-sidebar-accent text-primary";
const inactive =
  "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground";

function NavButton({
  pageId,
  label,
  children,
  activePage,
  onPageChange,
}: {
  pageId: PageId;
  label: string;
  children: React.ReactNode;
  activePage: PageId;
  onPageChange: (page: PageId) => void;
}) {
  const isActive = activePage === pageId;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onPageChange(pageId)}
          className={`${btnBase} ${isActive ? active : inactive}`}
          style={{ width: btnSize, height: btnSize, borderRadius: radius }}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ activePage, onPageChange }: SidebarProps) {
  return (
    <div
      className="flex min-w-18 basis-[10%] flex-col items-center bg-sidebar select-none"
      style={{ paddingTop: py, paddingBottom: py }}
    >
      <NavButton
        pageId="home"
        label="主页"
        activePage={activePage}
        onPageChange={onPageChange}
      >
        <Home style={{ width: iconSize, height: iconSize }} strokeWidth={1.8} />
      </NavButton>

      <div
        className="border-t border-sidebar-border"
        style={{ width: dividerW, marginBottom: mb }}
      />

      <nav className="flex flex-col" style={{ gap }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavButton
              key={item.id}
              pageId={item.id}
              label={item.label}
              activePage={activePage}
              onPageChange={onPageChange}
            >
              <Icon
                style={{ width: iconSize, height: iconSize }}
                strokeWidth={1.8}
              />
            </NavButton>
          );
        })}
      </nav>

      <div className="mt-auto">
        <div
          className="border-t border-sidebar-border"
          style={{ width: dividerW, marginBottom: mb }}
        />
        <NavButton
          pageId="settings"
          label="设置"
          activePage={activePage}
          onPageChange={onPageChange}
        >
          <Settings
            style={{ width: iconSize, height: iconSize }}
            strokeWidth={1.8}
          />
        </NavButton>
      </div>
    </div>
  );
}
