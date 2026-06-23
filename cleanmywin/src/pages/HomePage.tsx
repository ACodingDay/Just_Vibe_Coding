import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLottie } from "lottie-react";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { useNumberAnimation } from "@/hooks/useNumberAnimation";

const fmtCount = (v: number) => Math.round(v).toLocaleString();

function HomeLottie() {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    fetch("/lottie/home.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setAnimationData(data))
      .catch(() => {});
  }, []);

  const { View } = useLottie({
    animationData: animationData ?? undefined,
    loop: true,
    autoplay: true,
  });

  if (!animationData) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex h-[320px] w-full max-w-[360px] items-center justify-center rounded-2xl bg-background">
          <span className="text-xs text-muted-foreground">
            将动画文件放在 public/lottie/home.json
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex h-[320px] w-full max-w-[360px] items-center justify-center rounded-2xl bg-background">
        {View}
      </div>
    </div>
  );
}

interface HomePageProps {
  onQuickScan: () => void;
}

export function HomePage({ onQuickScan }: HomePageProps) {
  const [days, setDays] = useState(1);
  const { enabled: numAnim } = useNumberAnimation();

  useEffect(() => {
    invoke<number>("get_protection_days")
      .then(setDays)
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-center">
        <div className="flex flex-col items-start justify-start px-10 select-none text-left">
          <Item size="sm" className="mb-2 w-full">
            <ItemContent>
              <ItemTitle className="text-2xl font-bold">
                极简操作 一键清爽
              </ItemTitle>
            </ItemContent>
          </Item>
          <p className="mb-6 text-sm text-muted-foreground">
            深度扫描，准确清理，保持Windows干净清爽
          </p>
          <Button
            size="lg"
            onClick={onQuickScan}
            className="rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
          >
            快速扫描
          </Button>
        </div>
        <HomeLottie />
      </div>
      <div className="flex items-center px-10 pb-4 select-none">
        <p className="text-xs text-muted-foreground">
          已使用 <span className="font-semibold text-primary">{numAnim ? <AnimatedNumber value={days} format={fmtCount} /> : days}</span> 天
        </p>
      </div>
    </div>
  );
}
