import { cn } from "@/lib/utils";
import { AnimatePresence, motion, type Transition } from "motion/react";
import {
  Children,
  cloneElement,
  type ReactElement,
  useEffect,
  useState,
  useId,
} from "react";

export type AnimatedBackgroundProps = {
  children:
    | ReactElement<{ "data-id": string }>[]
    | ReactElement<{ "data-id": string }>;
  defaultValue?: string;
  /** 受控模式：外部传入当前激活项 ID */
  value?: string;
  onValueChange?: (newActiveId: string | null) => void;
  className?: string;
  transition?: Transition;
  enableHover?: boolean;
};

export function AnimatedBackground({
  children,
  defaultValue,
  value,
  onValueChange,
  className,
  transition,
  enableHover = false,
}: AnimatedBackgroundProps) {
  const [activeId, setActiveId] = useState<string | null>(
    defaultValue ?? null,
  );
  const uniqueId = useId();

  // 受控模式：外部 value 变化时同步
  useEffect(() => {
    if (value !== undefined) {
      setActiveId(value);
    }
  }, [value]);

  // 非受控模式：defaultValue 初始化
  useEffect(() => {
    if (value === undefined && defaultValue !== undefined) {
      setActiveId(defaultValue);
    }
  }, [defaultValue, value]);

  const handleSetActiveId = (id: string | null) => {
    if (value !== undefined) return; // 受控模式不响应内部点击
    setActiveId(id);
    onValueChange?.(id);
  };

  return Children.map(children, (child: ReactElement<{ "data-id": string }>, index: number) => {
    const id = child.props["data-id"];

    const interactionProps =
      value !== undefined
        ? {} // 受控模式：不接管交互，让子元素自行处理
        : enableHover
          ? {
              onMouseEnter: () => handleSetActiveId(id),
              onMouseLeave: () => handleSetActiveId(null),
            }
          : {
              onClick: () => handleSetActiveId(id),
            };

    return cloneElement(
      child as ReactElement<Record<string, unknown>>,
      {
        key: index,
        className: cn("relative inline-flex", (child.props as Record<string, unknown>).className as string),
        "data-checked": activeId === id ? "true" : "false",
        ...interactionProps,
      },
      <>
        <AnimatePresence initial={false}>
          {activeId === id && (
            <motion.div
              layoutId={`background-${uniqueId}`}
              className={cn("absolute inset-0", className)}
              transition={transition}
              initial={{ opacity: defaultValue || value ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>
        <div className="contents">{(child.props as Record<string, unknown>).children as React.ReactNode}</div>
      </>,
    );
  });
}
