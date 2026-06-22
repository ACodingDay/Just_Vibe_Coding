import { cn } from "@/lib/utils";
import { motion, useSpring, useTransform, type SpringOptions } from "motion/react";
import { useEffect } from "react";

export type AnimatedNumberProps = {
  value: number;
  className?: string;
  springOptions?: SpringOptions;
  as?: React.ElementType;
  /** 自定义格式化函数，默认 toLocaleString() */
  format?: (v: number) => string;
};

export function AnimatedNumber({
  value,
  className,
  springOptions,
  as = "span",
  format = (v) => Math.round(v).toLocaleString(),
}: AnimatedNumberProps) {
  const MotionComponent = motion.create(as);

  const spring = useSpring(value, springOptions);
  const display = useTransform(spring, format);

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return (
    <MotionComponent className={cn("tabular-nums", className)}>
      {display}
    </MotionComponent>
  );
}
