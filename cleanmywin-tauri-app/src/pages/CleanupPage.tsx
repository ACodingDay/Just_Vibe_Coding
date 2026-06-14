import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { setIsOperating } from "@/lib/closeTrayCache";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSmoothProgress } from "@/hooks/useSmoothProgress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { formatBytes } from "@/lib/format";
import {
  Loader2,
  FileText,
  ChevronDown,
  ChevronRight,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

/* ─── 类型 ─── */

interface CleanupStats {
  total_count: number;
  total_bytes: number;
}

interface ScanFileItem {
  rule_id: string;
  rule_name: string;
  path: string;
  size: number;
}

interface UserRulePrefs {
  enabled_ids: string[];
  custom_rules: BaseRule[];
}

interface BaseRule {
  id: string;
  name: string;
  is_interactive: boolean;
  [key: string]: unknown;
}

interface ScanProgressEvent {
  rule_id: string;
  rule_name: string;
  files: ScanFileItem[];
}

interface ScanCompleteEvent {
  total_files: number;
  total_size: number;
}

interface CleanProgressEvent {
  rule_id: string;
  path: string;
  size: number;
  error: string | null;
}

interface CleanCompleteEvent {
  total_cleaned: number;
  total_freed: number;
}

type PageState = "idle" | "scanning" | "scanned" | "cleaning";

/* ─── 虚拟文件列表子组件 ─── */

interface VirtualizedFileListProps {
  files: ScanFileItem[];
  selectedPaths: Set<string>;
  toggleFile: (path: string) => void;
  isScanning: boolean;
  isCleaning: boolean;
}

function VirtualizedFileList({
  files,
  selectedPaths,
  toggleFile,
  isScanning,
  isCleaning,
}: VirtualizedFileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  return (
    <div
      ref={parentRef}
      className="border-t border-border bg-muted/30"
      style={{ maxHeight: 320, overflowY: "auto" }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const file = files[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full flex items-center gap-2 border-b border-border/50 px-12 py-2 text-xs hover:bg-muted/50"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <Checkbox
                checked={selectedPaths.has(file.path)}
                onCheckedChange={() => toggleFile(file.path)}
                disabled={isScanning || isCleaning}
              />
              <FileText className="size-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-muted-foreground">
                {file.path}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatBytes(file.size)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 组件 ─── */

interface CleanupPageProps {
  autoStartScan?: boolean;
}

export function CleanupPage({ autoStartScan }: CleanupPageProps) {
  const [stats, setStats] = useState<CleanupStats>({
    total_count: 0,
    total_bytes: 0,
  });
  const [pageState, setPageState] = useState<PageState>("idle");
  const [scanFiles, setScanFiles] = useState<ScanFileItem[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [cleanProgress, setCleanProgress] = useState(0);
  const smoothScan = useSmoothProgress(scanProgress);
  const smoothClean = useSmoothProgress(cleanProgress);
  const scanTotalRef = useRef(0); // 启用规则数，用于扫描进度
  const cleanTargetRef = useRef(0); // 待清理文件数，用于清理进度

  // 同步操作状态到全局变量（供 App.tsx 关闭窗口时检查）
  useEffect(() => {
    setIsOperating(pageState === "scanning" || pageState === "cleaning");
  }, [pageState]);

  const [cleanedFiles, setCleanedFiles] = useState<ScanFileItem[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const rulesRef = useRef<BaseRule[]>([]);
  const enabledIdsRef = useRef<string[]>([]);
  const unlistenRef = useRef<UnlistenFn[]>([]);
  const listenersReady = useRef(false);
  const regPermToastShown = useRef(false);

  /* 卸载标记 */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* 加载规则 */
  useEffect(() => {
    Promise.all([
      fetch("/base_rules.json").then((r) => r.json()),
      invoke<UserRulePrefs>("get_user_rule_prefs"),
    ])
      .then(([base, prefs]) => {
        rulesRef.current = base;
        enabledIdsRef.current =
          prefs.enabled_ids.length > 0
            ? prefs.enabled_ids
            : base
                .filter((r: BaseRule) => r.default_enabled)
                .map((r: BaseRule) => r.id);
      })
      .catch(() => {});
  }, []);

  /* 事件监听 — 等待全部就绪后才允许 invoke */
  useEffect(() => {
    const unlistens: UnlistenFn[] = [];

    const p1 = listen<ScanProgressEvent>("cleanup-scan-progress", (e) => {
      setScanFiles((prev) => [...prev, ...e.payload.files]);
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        for (const f of e.payload.files) next.add(f.path);
        return next;
      });
      // 扫描进度：按已完成的规则数递增
      scanTotalRef.current += 1;
      const ruleCount = rulesRef.current.filter((r) =>
        enabledIdsRef.current.includes(r.id),
      ).length;
      setScanProgress(
        ruleCount > 0
          ? Math.min((scanTotalRef.current / ruleCount) * 100, 99)
          : 0,
      );
    }).then((fn) => {
      unlistens.push(fn);
    });

    const p2 = listen<ScanCompleteEvent>("cleanup-scan-complete", (e) => {
      setScanProgress(100);
      if (mountedRef.current) {
        if (e.payload.total_files === 0) {
          toast.success("扫描完成，未发现可清理的垃圾文件", {
            position: "top-center",
          });
          setPageState("idle");
        } else {
          setPageState("scanned");
        }
      }
    }).then((fn) => {
      unlistens.push(fn);
    });

    const p3 = listen<CleanProgressEvent>("cleanup-clean-progress", (e) => {
      // 注册表 HKLM 删除需要管理员权限，失败时弹一次提示
      if (
        e.payload.error &&
        e.payload.path.includes("HKLM:") &&
        !regPermToastShown.current
      ) {
        regPermToastShown.current = true;
        toast.warning("部分注册表条目需要管理员权限才能删除", {
          description: "请以管理员身份运行应用以清理 HKLM 下的残留条目",
          duration: 5000,
        });
      }
      setCleanedFiles((prev) => {
        const next = [
          ...prev,
          {
            rule_id: e.payload.rule_id,
            rule_name: "",
            path: e.payload.path,
            size: e.payload.size,
          },
        ];
        setCleanProgress(
          cleanTargetRef.current > 0
            ? Math.min((next.length / cleanTargetRef.current) * 100, 100)
            : 0,
        );
        return next;
      });
    }).then((fn) => {
      unlistens.push(fn);
    });

    const p4 = listen<CleanCompleteEvent>("cleanup-clean-complete", () => {
      // 重新拉取累计统计
      invoke<CleanupStats>("get_cleanup_stats")
        .then(setStats)
        .catch(() => {});
      setTimeout(() => {
        if (!mountedRef.current) return;
        setScanFiles([]);
        setScanProgress(0);
        setCleanProgress(0);
        setCleanedFiles([]);
        setSelectedPaths(new Set());
        setPageState("idle");
      }, 800);
    }).then((fn) => {
      unlistens.push(fn);
    });

    Promise.all(unlistens).then(() => {
      listenersReady.current = true;
    });
    Promise.all([p1, p2, p3, p4]).then(() => {
      listenersReady.current = true;
    });
    unlistenRef.current = unlistens;
    return () => {
      unlistens.forEach((fn) => fn());
    };
  }, []); // 仅挂载时注册一次，避免重复

  /* 累计统计 */
  useEffect(() => {
    invoke<CleanupStats>("get_cleanup_stats")
      .then(setStats)
      .catch(() => setStats({ total_count: 0, total_bytes: 0 }));
  }, []);

  /* 主页快速扫描入口 */
  useEffect(() => {
    if (autoStartScan) {
      handleStartScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartScan]);

  /* 分组 */
  const groupedResults = useMemo(() => {
    const cleanedSet = new Set(cleanedFiles.map((f) => f.path));
    const remaining = scanFiles.filter((f) => !cleanedSet.has(f.path));
    const map = new Map<
      string,
      {
        rule_id: string;
        rule_name: string;
        totalSize: number;
        files: ScanFileItem[];
      }
    >();
    for (const f of remaining) {
      const g = map.get(f.rule_id);
      if (g) {
        g.totalSize += f.size;
        g.files.push(f);
      } else
        map.set(f.rule_id, {
          rule_id: f.rule_id,
          rule_name: f.rule_name,
          totalSize: f.size,
          files: [f],
        });
    }
    return Array.from(map.values());
  }, [scanFiles, cleanedFiles]);

  const totalScannedSize = useMemo(
    () => scanFiles.reduce((s, f) => s + f.size, 0),
    [scanFiles],
  );
  const totalCleanedSize = useMemo(
    () => cleanedFiles.reduce((s, f) => s + f.size, 0),
    [cleanedFiles],
  );
  const selectedSize = useMemo(() => {
    let s = 0;
    for (const f of scanFiles) if (selectedPaths.has(f.path)) s += f.size;
    return s;
  }, [scanFiles, selectedPaths]);
  const selectedCount = useMemo(() => {
    let c = 0;
    for (const f of scanFiles) if (selectedPaths.has(f.path)) c++;
    return c;
  }, [scanFiles, selectedPaths]);

  const toggleGroup = useCallback(
    (ruleId: string) =>
      setExpandedGroups((prev) => ({ ...prev, [ruleId]: !prev[ruleId] })),
    [],
  );
  const toggleFile = useCallback(
    (path: string) =>
      setSelectedPaths((prev) => {
        const n = new Set(prev);
        if (n.has(path)) n.delete(path);
        else n.add(path);
        return n;
      }),
    [],
  );
  const toggleGroupFiles = useCallback(
    (ruleId: string) => {
      setSelectedPaths((prev) => {
        const n = new Set(prev);
        const g = scanFiles.filter((f) => f.rule_id === ruleId);
        const all = g.every((f) => prev.has(f.path));
        if (all) {
          for (const f of g) n.delete(f.path);
        } else {
          for (const f of g) n.add(f.path);
        }
        return n;
      });
    },
    [scanFiles],
  );
  const isGroupAllSelected = useCallback(
    (ruleId: string) => {
      const g = scanFiles.filter((f) => f.rule_id === ruleId);
      return g.length > 0 && g.every((f) => selectedPaths.has(f.path));
    },
    [scanFiles, selectedPaths],
  );
  const isGroupPartialSelected = useCallback(
    (ruleId: string) => {
      const g = scanFiles.filter((f) => f.rule_id === ruleId);
      const s = g.filter((f) => selectedPaths.has(f.path)).length;
      return s > 0 && s < g.length;
    },
    [scanFiles, selectedPaths],
  );
  const allSelected =
    scanFiles.length > 0 && scanFiles.every((f) => selectedPaths.has(f.path));
  const toggleSelectAll = useCallback(() => {
    if (allSelected) setSelectedPaths(new Set());
    else setSelectedPaths(new Set(scanFiles.map((f) => f.path)));
  }, [allSelected, scanFiles]);

  function handleStartScan() {
    setScanFiles([]);
    setScanProgress(0);
    setCleanProgress(0);
    setCleanedFiles([]);
    setExpandedGroups({});
    setSelectedPaths(new Set());
    scanTotalRef.current = 0;
    setPageState("scanning");
    // 等待事件监听器就绪后再调用 Rust
    const doScan = () => {
      invoke("start_cleanup_scan", {
        baseRules: rulesRef.current,
        enabledIds: enabledIdsRef.current,
      }).catch(() => setPageState("idle"));
    };
    if (listenersReady.current) {
      doScan();
    } else {
      const check = setInterval(() => {
        if (listenersReady.current) {
          clearInterval(check);
          doScan();
        }
      }, 50);
    }
  }

  function handleCancelScan() {
    if (scanFiles.length > 0) setPageState("scanned");
    else {
      setPageState("idle");
      setScanFiles([]);
      setScanProgress(0);
    }
  }

  function handleStartClean() {
    if (selectedCount === 0) return;
    setCleanProgress(0);
    setCleanedFiles([]);
    cleanTargetRef.current = selectedCount;
    regPermToastShown.current = false;
    setPageState("cleaning");
    // 只传有勾选文件的规则 ID，避免未勾选的规则组也被执行
    const activeRuleIds = [
      ...new Set(
        scanFiles.filter((f) => selectedPaths.has(f.path)).map((f) => f.rule_id),
      ),
    ];
    const doClean = () => {
      invoke("start_cleanup_clean", {
        baseRules: rulesRef.current,
        enabledIds: enabledIdsRef.current,
        selectedPaths: Array.from(selectedPaths),
        activeRuleIds,
      }).catch(() => setPageState("scanned"));
    };
    if (listenersReady.current) {
      doClean();
    } else {
      const check = setInterval(() => {
        if (listenersReady.current) {
          clearInterval(check);
          doClean();
        }
      }, 50);
    }
  }

  const isIdle = pageState === "idle";
  const isScanning = pageState === "scanning";
  const isScanned = pageState === "scanned";
  const isCleaning = pageState === "cleaning";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-[2] flex items-center justify-between px-8 py-6 min-h-0">
        <Item size="sm" className="max-w-md select-none">
          <ItemContent>
            <ItemTitle className="text-base">
              {isIdle && "清理各种系统垃圾"}
              {isScanning && "正在扫描系统垃圾..."}
              {isScanned && `已选中 ${formatBytes(selectedSize)}`}
              {isCleaning && "正在清理垃圾文件..."}
            </ItemTitle>
            <ItemDescription>
              {isIdle && "点击开始扫描自动检测可清理的垃圾文件"}
              {isScanning &&
                `已发现 ${scanFiles.length} 个文件，${formatBytes(totalScannedSize)}`}
              {isScanned &&
                `共 ${scanFiles.length} 个文件，已勾选 ${selectedCount} 个，${formatBytes(selectedSize)} 待清理`}
              {isCleaning &&
                `已清理 ${cleanedFiles.length} 个文件，释放 ${formatBytes(totalCleanedSize)}`}
            </ItemDescription>
          </ItemContent>
        </Item>

        {isIdle && (
          <Button
            size="lg"
            onClick={handleStartScan}
            className="rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
          >
            开始扫描
          </Button>
        )}
        {isScanning && (
          <Button
            size="lg"
            variant="outline"
            onClick={handleCancelScan}
            className="rounded-full px-8 text-base font-semibold"
          >
            取消扫描
          </Button>
        )}
        {isScanned && (
          <Button
            size="lg"
            onClick={handleStartClean}
            disabled={selectedCount === 0}
            className="rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 disabled:opacity-50"
          >
            <Trash2 className="size-4" />
            一键清理
          </Button>
        )}
        {isCleaning && (
          <Button
            size="lg"
            disabled
            className="rounded-full bg-muted px-8 text-base font-semibold text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            清理中...
          </Button>
        )}
      </div>

      <Separator />

      <div className="flex-[8] flex flex-col min-h-0 p-6">
        {isIdle && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex w-full max-w-xl gap-6">
              <Item
                size="default"
                variant="outline"
                className="flex-1 select-none"
              >
                <ItemContent>
                  <ItemTitle className="text-sm text-muted-foreground">
                    累计清理
                  </ItemTitle>
                  <ItemDescription className="text-3xl font-bold text-foreground">
                    {stats.total_count.toLocaleString()}
                    <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                      次
                    </span>
                  </ItemDescription>
                </ItemContent>
              </Item>
              <Item
                size="default"
                variant="outline"
                className="flex-1 select-none"
              >
                <ItemContent>
                  <ItemTitle className="text-sm text-muted-foreground">
                    累计释放空间
                  </ItemTitle>
                  <ItemDescription className="text-3xl font-bold text-foreground">
                    {formatBytes(stats.total_bytes)}
                  </ItemDescription>
                </ItemContent>
              </Item>
            </div>
          </div>
        )}

        {(isScanning || isScanned || isCleaning) && (
          <div className="flex flex-1 flex-col gap-4 min-h-0">
            <div className="flex items-center gap-3">
              {(isScanning || isCleaning) && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {isScanned && <CheckCircle2 className="size-4 text-green-500" />}
              <Progress
                value={isCleaning ? smoothClean : smoothScan}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(isCleaning ? smoothClean : smoothScan)}%
              </span>
            </div>
            <div className="flex flex-1 flex-col min-h-0 rounded-md border">
              {isScanned && scanFiles.length > 0 && (
                <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground">
                    全选 ({selectedCount}/{scanFiles.length})
                  </span>
                </div>
              )}
              <div className="flex-1 overflow-y-auto min-h-0">
                {groupedResults.length === 0 ? (
                  <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                    {isScanning && "正在扫描中..."}
                    {isCleaning && "清理完成"}
                    {isScanned && "暂无扫描结果"}
                  </div>
                ) : (
                  groupedResults.map((group) => {
                    const expanded = !!expandedGroups[group.rule_id];
                    return (
                      <div
                        key={group.rule_id}
                        className="border-b border-border last:border-0"
                      >
                        <div
                          onClick={() => toggleGroup(group.rule_id)}
                          className="flex items-center gap-2 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
                        >
                          <Checkbox
                            checked={
                              isGroupPartialSelected(group.rule_id)
                                ? "indeterminate"
                                : isGroupAllSelected(group.rule_id)
                            }
                            onCheckedChange={() =>
                              toggleGroupFiles(group.rule_id)
                            }
                            disabled={isScanning || isCleaning}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="flex flex-1 items-center gap-2 text-left">
                            {expanded ? (
                              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="flex-1 text-sm font-medium">
                              {group.rule_name}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {group.files.length} 个文件
                          </span>
                          <span className="ml-2 text-sm font-semibold text-primary">
                            {formatBytes(group.totalSize)}
                          </span>
                        </div>
                        {expanded && (
                          <VirtualizedFileList
                            files={group.files}
                            selectedPaths={selectedPaths}
                            toggleFile={toggleFile}
                            isScanning={isScanning}
                            isCleaning={isCleaning}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
