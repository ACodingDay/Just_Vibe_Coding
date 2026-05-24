import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Plus, X, Trash2, FolderOpen } from "lucide-react";
import { createColumnHelper } from "@tanstack/react-table";
import type { BaseRule, RiskLevel, CleanType } from "@/types/scan";
import { RISK_LABELS } from "@/types/scan";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";

interface UserRulePrefs {
  enabled_ids: string[];
  custom_rules: BaseRule[];
}

interface FormRule {
  name: string;
  description: string;
  paths: string[];
  patterns: string[];
  risk_level: RiskLevel;
  clean_type: CleanType;
  clean_command: string;
}

const emptyForm = (): FormRule => ({
  name: "",
  description: "",
  paths: [""],
  patterns: ["**/*"],
  risk_level: "Low",
  clean_type: "DeleteFiles",
  clean_command: "",
});

const RISK_LEVELS: RiskLevel[] = ["Low", "Medium", "High"];
const CLEAN_TYPES: { value: CleanType; label: string }[] = [
  { value: "DeleteFiles", label: "删除文件" },
  { value: "EmptyDirectory", label: "清空目录" },
  { value: "RunCommand", label: "执行命令" },
  { value: "EmptyRecycleBin", label: "清空回收站" },
  { value: "SendToTrash", label: "移入回收站" },
];

const columnHelper = createColumnHelper<BaseRule>();

export function CustomPage() {
  const [customRules, setCustomRules] = useState<BaseRule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormRule>(emptyForm());
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    invoke<UserRulePrefs>("get_user_rule_prefs")
      .then((prefs) => {
        setCustomRules(prefs.custom_rules || []);
        setEnabledIds(new Set(prefs.enabled_ids || []));
      })
      .catch(() => {});
  }, []);

  const loadRules = useCallback(async () => {
    try {
      const prefs = await invoke<UserRulePrefs>("get_user_rule_prefs");
      setCustomRules(prefs.custom_rules || []);
      setEnabledIds(new Set(prefs.enabled_ids || []));
    } catch {
      /* ignore */
    }
  }, []);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("请输入规则名称");
      return;
    }
    const validPaths = form.paths.filter((p) => p.trim());
    if (validPaths.length === 0) {
      toast.error("至少需要一个路径");
      return;
    }
    const rule: BaseRule = {
      id: `custom_${Date.now()}`,
      name: form.name.trim(),
      category: "UserCustom",
      description: form.description.trim(),
      paths: validPaths,
      patterns: form.patterns.filter((p) => p.trim()),
      risk_level: form.risk_level,
      default_enabled: true,
      is_interactive: form.risk_level === "High",
      clean_type: form.clean_type,
      clean_command:
        form.clean_type === "RunCommand" ? form.clean_command.trim() : null,
    };
    try {
      await invoke("add_custom_rule", { rule });
      toast.success("规则已保存");
      setShowForm(false);
      setForm(emptyForm());
      loadRules();
    } catch (e) {
      toast.error(`保存失败: ${e}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("remove_custom_rule", { id });
      toast.success("规则已删除");
      loadRules();
    } catch (e) {
      toast.error(`删除失败: ${e}`);
    }
  };

  const toggleEnabled = async (id: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      invoke("save_enabled_ids", { ids: Array.from(next) }).catch(() => {});
      return next;
    });
  };

  const addPath = () => setForm((f) => ({ ...f, paths: [...f.paths, ""] }));
  const removePath = (i: number) =>
    setForm((f) => ({
      ...f,
      paths: f.paths.filter((_, idx) => idx !== i),
    }));
  const updatePath = (i: number, v: string) =>
    setForm((f) => {
      const p = [...f.paths];
      p[i] = v;
      return { ...f, paths: p };
    });

  const addPattern = () =>
    setForm((f) => ({ ...f, patterns: [...f.patterns, ""] }));
  const removePattern = (i: number) =>
    setForm((f) => ({
      ...f,
      patterns: f.patterns.filter((_, idx) => idx !== i),
    }));
  const updatePattern = (i: number, v: string) =>
    setForm((f) => {
      const p = [...f.patterns];
      p[i] = v;
      return { ...f, patterns: p };
    });

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: () => (
          <Checkbox
            checked={
              customRules.length > 0 &&
              customRules.every((r) => enabledIds.has(r.id))
            }
            onCheckedChange={(checked) => {
              if (checked) {
                const all = new Set(customRules.map((r) => r.id));
                setEnabledIds(all);
                invoke("save_enabled_ids", { ids: Array.from(all) }).catch(
                  () => {},
                );
              } else {
                setEnabledIds(new Set());
                invoke("save_enabled_ids", { ids: [] }).catch(() => {});
              }
            }}
          />
        ),
        enableSorting: false,
        size: 40,
        cell: ({ row }) => (
          <Checkbox
            checked={enabledIds.has(row.original.id)}
            onCheckedChange={() => toggleEnabled(row.original.id)}
          />
        ),
      }),
      columnHelper.accessor("name", {
        header: "规则名",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col min-w-0">
            <span className="truncate font-medium">{row.original.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {row.original.description}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor("risk_level", {
        header: "风险",
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original.risk_level;
          const color =
            r === "Medium" ? "#ffd73d" : r === "Low" ? "#2AAE6F" : undefined;
          const v = r === "High" ? "destructive" : "default";
          return (
            <Badge
              variant={v}
              className="text-xs text-white"
              style={color ? { backgroundColor: color } : undefined}
            >
              {RISK_LABELS[r]}
            </Badge>
          );
        },
        size: 80,
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        enableSorting: false,
        size: 60,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={() => handleDelete(row.original.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        ),
      }),
    ],
    [customRules, enabledIds],
  );

  return (
    <div className="flex flex-1 flex-col gap-4 px-8 py-6 select-none overflow-hidden min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold">自定义规则</h2>
          <p className="text-xs text-muted-foreground">
            管理您自己添加的扫描和清理规则
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm(emptyForm());
            setShowForm(true);
          }}
          className="gap-1"
        >
          <Plus className="size-4" />
          新增规则
        </Button>
      </div>

      <DataTable
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        columns={columns as any}
        data={customRules}
        defaultPageSize={10}
        className="flex flex-1 flex-col min-h-0"
      />

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border bg-background p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold">新增规则</h3>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setShowForm(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel>规则名（最长20字）</FieldLabel>
                <Input
                  value={form.name}
                  maxLength={20}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="如：我的临时文件"
                />
              </Field>

              <Field>
                <FieldLabel>规则说明（最长50字）</FieldLabel>
                <Textarea
                  value={form.description}
                  maxLength={50}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="描述这条规则的用途"
                  rows={2}
                />
              </Field>

              <FieldSeparator />

              <Field orientation="horizontal">
                <FieldLabel className="w-20 shrink-0">风险标签</FieldLabel>
                <Select
                  value={form.risk_level}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, risk_level: v as RiskLevel }))
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {RISK_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field orientation="horizontal">
                <FieldLabel className="w-20 shrink-0">清理类型</FieldLabel>
                <Select
                  value={form.clean_type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, clean_type: v as CleanType }))
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLEAN_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {form.clean_type === "RunCommand" && (
                <Field>
                  <FieldLabel>清理命令</FieldLabel>
                  <Input
                    value={form.clean_command}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, clean_command: e.target.value }))
                    }
                    placeholder="cmd /c del /q ..."
                  />
                </Field>
              )}

              <FieldSeparator />

              <Field>
                <FieldLabel>扫描路径</FieldLabel>
                {form.paths.map((p, i) => (
                  <div key={i} className="flex gap-1">
                    <Input
                      value={p}
                      onChange={(e) => updatePath(i, e.target.value)}
                      placeholder="%USERPROFILE%\AppData\..."
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9 shrink-0"
                          onClick={async () => {
                            const selected = await open({
                              directory: true,
                              title: "选择扫描文件夹",
                            });
                            if (selected && typeof selected === "string") {
                              updatePath(i, selected);
                            }
                          }}
                        >
                          <FolderOpen className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>选择文件夹</TooltipContent>
                    </Tooltip>
                    {form.paths.length > 1 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            onClick={() => removePath(i)}
                          >
                            <X className="size-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>删除路径</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={addPath}
                >
                  + 添加路径
                </Button>
              </Field>

              <Field>
                <FieldLabel>匹配模式</FieldLabel>
                {form.patterns.map((p, i) => (
                  <div key={i} className="flex gap-1">
                    <Input
                      value={p}
                      onChange={(e) => updatePattern(i, e.target.value)}
                      placeholder="**/* 或 *.log"
                    />
                    {form.patterns.length > 1 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            onClick={() => removePattern(i)}
                          >
                            <X className="size-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>删除模式</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={addPattern}
                >
                  + 添加模式
                </Button>
              </Field>
            </FieldGroup>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                取消
              </Button>
              <Button onClick={handleSave}>保存规则</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
