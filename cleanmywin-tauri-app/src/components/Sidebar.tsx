import {
  Home,
  Sparkles,
  ScanSearch,
  PencilRuler,
  Settings,
} from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
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
  "relative flex items-center justify-center transition-colors cursor-pointer";
const activeText = "text-primary";
const inactiveText =
  "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground";

const springTransition = {
  type: "spring" as const,
  stiffness: 350,
  damping: 30,
  mass: 0.8,
};

function StandaloneButton({
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
          className={`${btnBase} ${isActive ? `bg-sidebar-accent ${activeText}` : inactiveText}`}
          style={{ width: btnSize, height: btnSize, borderRadius: radius }}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavIconButton({
  pageId,
  label,
  children,
  isActive,
  onPageChange,
  registerRef,
}: {
  pageId: PageId;
  label: string;
  children: React.ReactNode;
  isActive: boolean;
  onPageChange: (page: PageId) => void;
  registerRef: (id: PageId, el: HTMLButtonElement | null) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={(el) => registerRef(pageId, el)}
          onClick={() => onPageChange(pageId)}
          className={`${btnBase} ${isActive ? activeText : inactiveText}`}
          style={{ width: btnSize, height: btnSize, borderRadius: radius }}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** 测量激活按钮相对于 nav 容器的位置 */
function useMeasurePosition(
  navRef: React.RefObject<HTMLDivElement | null>,
  buttonRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>,
  activePage: PageId,
) {
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const measure = useCallback(() => {
    const nav = navRef.current;
    const btn = buttonRefs.current.get(activePage);
    if (!nav || !btn) {
      setPos(null);
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setPos({
      top: btnRect.top - navRect.top,
      left: btnRect.left - navRect.left,
      width: btnRect.width,
      height: btnRect.height,
    });
  }, [activePage, navRef, buttonRefs]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return pos;
}

export function Sidebar({ activePage, onPageChange }: SidebarProps) {
  const navRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const registerRef = (id: PageId, el: HTMLButtonElement | null) => {
    if (el) buttonRefs.current.set(id, el);
    else buttonRefs.current.delete(id);
  };

  const pos = useMeasurePosition(navRef, buttonRefs, activePage);
  const isNavActive = navItems.some((item) => item.id === activePage);

  return (
    <div
      className="flex min-w-18 basis-[10%] flex-col items-center bg-sidebar select-none"
      style={{ paddingTop: py, paddingBottom: py }}
    >
      <StandaloneButton
        pageId="home"
        label="主页"
        activePage={activePage}
        onPageChange={onPageChange}
      >
        <Home style={{ width: iconSize, height: iconSize }} strokeWidth={1.8} />
      </StandaloneButton>

      <div
        className="border-t border-sidebar-border"
        style={{ width: dividerW, marginBottom: mb }}
      />

      <nav
        ref={navRef}
        className="relative flex flex-col"
        style={{ gap }}
      >
        <motion.div
          className="absolute bg-sidebar-accent"
          style={{
            borderRadius: radius,
            visibility: isNavActive && pos ? "visible" : "hidden",
          }}
          animate={
            isNavActive && pos
              ? {
                  top: pos.top,
                  left: pos.left,
                  width: pos.width,
                  height: pos.height,
                  opacity: 1,
                }
              : { opacity: 0 }
          }
          transition={springTransition}
        />
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavIconButton
              key={item.id}
              pageId={item.id}
              label={item.label}
              isActive={activePage === item.id}
              onPageChange={onPageChange}
              registerRef={registerRef}
            >
              <Icon
                style={{ width: iconSize, height: iconSize }}
                strokeWidth={1.8}
              />
            </NavIconButton>
          );
        })}
      </nav>

      <div className="mt-auto">
        <div
          className="border-t border-sidebar-border"
          style={{ width: dividerW, marginBottom: mb }}
        />
        <StandaloneButton
          pageId="settings"
          label="设置"
          activePage={activePage}
          onPageChange={onPageChange}
        >
          <Settings
            style={{ width: iconSize, height: iconSize }}
            strokeWidth={1.8}
          />
        </StandaloneButton>
      </div>
    </div>
  );
}
