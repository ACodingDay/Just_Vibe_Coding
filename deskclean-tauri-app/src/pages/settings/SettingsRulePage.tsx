import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RotateCcw, Plus, Pencil, Trash2 } from 'lucide-react';
import { getRules, saveRules, resetRules } from '@/services/ipc';
import type { Rule, MatchTarget, MatchType } from '@/types/tauri';

const MATCH_TARGETS: { value: MatchTarget; labelKey: string }[] = [
  { value: 'file_name', labelKey: 'rule_target_file_name' },
  { value: 'file_extension', labelKey: 'rule_target_file_extension' },
  { value: 'lnk_target_path', labelKey: 'rule_target_lnk_path' },
  { value: 'lnk_target_name', labelKey: 'rule_target_lnk_name' },
  { value: 'file_path', labelKey: 'rule_target_file_path' },
];

const MATCH_TYPES: { value: MatchType; labelKey: string }[] = [
  { value: 'exact', labelKey: 'rule_type_exact' },
  { value: 'contains', labelKey: 'rule_type_contains' },
  { value: 'starts_with', labelKey: 'rule_type_starts_with' },
  { value: 'ends_with', labelKey: 'rule_type_ends_with' },
  { value: 'regex', labelKey: 'rule_type_regex' },
];

interface FormState {
  name: string;
  match_target: MatchTarget;
  match_type: MatchType;
  pattern: string;
  category: string;
  priority: number;
}

const DEFAULT_FORM: FormState = {
  name: '',
  match_target: 'file_extension',
  match_type: 'contains',
  pattern: '',
  category: '',
  priority: 50,
};

export default function SettingsRulePage() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  // Alert dialog state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRules();
      setRules(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const persistRules = async (updated: Rule[]) => {
    await saveRules(updated);
    setRules(updated);
  };

  const handleToggle = async (index: number, enabled: boolean) => {
    const updated = rules.map((r, i) => (i === index ? { ...r, enabled } : r));
    await persistRules(updated);
  };

  const openAddDialog = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (rule: Rule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      match_target: rule.match_target,
      match_type: rule.match_type,
      pattern: rule.pattern,
      category: rule.category,
      priority: rule.priority,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const { name, match_target, match_type, pattern, category, priority } = form;
    if (!name || !pattern || !category) return;

    const ruleData: Rule = {
      id: editingId || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      match_target,
      match_type,
      pattern,
      category,
      priority,
      enabled: true,
      is_builtin: false,
    };

    let updated: Rule[];
    if (editingId) {
      const idx = rules.findIndex((r) => r.id === editingId);
      updated = idx >= 0
        ? rules.map((r, i) => (i === idx ? ruleData : r))
        : [...rules, ruleData];
    } else {
      updated = [...rules, ruleData];
    }

    try {
      await persistRules(updated);
      setDialogOpen(false);
    } catch (e) {
      alert(t('error_save_rules') + ': ' + e);
    }
  };

  const handleDelete = async (rule: Rule) => {
    const updated = rules.filter((r) => r.id !== rule.id);
    try {
      await persistRules(updated);
    } catch (e) {
      alert(t('error_save_rules') + ': ' + e);
    }
    setDeleteTarget(null);
  };

  const handleReset = async () => {
    try {
      const data = await resetRules();
      setRules(data);
    } catch (e) {
      alert(t('error_reset_rules') + ': ' + e);
    }
    setResetDialogOpen(false);
  };

  const targetLabel = (v: string) =>
    MATCH_TARGETS.find((tgt) => tgt.value === v)?.labelKey
      ? t(MATCH_TARGETS.find((tgt) => tgt.value === v)!.labelKey)
      : v;

  const typeLabel = (v: string) =>
    MATCH_TYPES.find((tp) => tp.value === v)?.labelKey
      ? t(MATCH_TYPES.find((tp) => tp.value === v)!.labelKey)
      : v;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap" style={{ gap: '12px' }}>
        <h3
          className="font-medium"
          style={{
            fontSize: 'clamp(18px, 2.5vmin, 24px)',
            color: 'var(--md-sys-color-on-surface)',
          }}
        >
          {t('rule_title')}
        </h3>
        <div className="flex" style={{ gap: '4px' }}>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title={t('rule_reset')}
            onClick={() => setResetDialogOpen(true)}
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title={t('rule_add')}
            onClick={openAddDialog}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <p
        style={{
          color: 'var(--md-sys-color-on-surface-variant)',
          marginTop: '8px',
          fontSize: '13px',
        }}
      >
        {t('rule_note')}
      </p>

      {/* Rule list */}
      <div
        className="flex flex-col"
        style={{
          marginTop: 'clamp(12px, 3vmin, 28px)',
          padding: 'clamp(12px, 2.5vmin, 28px)',
          borderRadius: 'clamp(6px, 1.2vmin, 14px)',
          background: 'var(--md-sys-color-surface-container-low)',
          border: '1px solid var(--md-sys-color-outline-variant)',
          gap: '8px',
        }}
      >
        {loading && (
          <p style={{ color: 'var(--md-sys-color-outline)', fontSize: '13px' }}>
            {t('organize_loading')}
          </p>
        )}

        {error && (
          <p style={{ color: 'var(--md-sys-color-error)', fontSize: '13px' }}>
            {t('error_load_rules')}: {error}
          </p>
        )}

        {!loading && !error && rules.length === 0 && (
          <p style={{ color: 'var(--md-sys-color-outline)', fontSize: '13px' }}>
            {t('rule_empty')}
          </p>
        )}

        {!loading &&
          rules.map((rule, index) => (
            <div
              key={rule.id}
              className="flex items-center gap-3 py-3"
              style={{
                borderBottom:
                  index < rules.length - 1
                    ? '1px solid var(--md-sys-color-outline-variant)'
                    : undefined,
              }}
            >
              {/* Rule info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium" style={{ color: 'var(--md-sys-color-on-surface)' }}>
                    {rule.name}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      color: 'var(--md-sys-color-on-surface-variant)',
                      background: 'var(--md-sys-color-surface-variant)',
                    }}
                  >
                    {targetLabel(rule.match_target)} · {typeLabel(rule.match_type)}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      color: 'var(--md-sys-color-primary)',
                      background: 'var(--md-sys-color-primary-container)',
                    }}
                  >
                    → {rule.category}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: 'var(--md-sys-color-outline)' }}
                  >
                    P{rule.priority}
                  </span>
                </div>
                <p
                  className="font-mono text-xs mt-1 truncate"
                  style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
                >
                  {rule.pattern}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1 shrink-0">
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(checked) => handleToggle(index, checked)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEditDialog(rule)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setDeleteTarget(rule)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
      </div>

      {/* Add/Edit Rule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('rule_edit_title') : t('rule_add_title')}
            </DialogTitle>
            <DialogDescription>{t('rule_desc')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 min-h-0 overflow-y-auto">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label>{t('rule_name')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Match Target */}
            <div className="flex flex-col gap-1.5">
              <Label>{t('rule_target')}</Label>
              <Select
                value={form.match_target}
                onValueChange={(v) =>
                  setForm({ ...form, match_target: v as MatchTarget })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_TARGETS.map((tgt) => (
                    <SelectItem key={tgt.value} value={tgt.value}>
                      {t(tgt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Match Type */}
            <div className="flex flex-col gap-1.5">
              <Label>{t('rule_type')}</Label>
              <Select
                value={form.match_type}
                onValueChange={(v) =>
                  setForm({ ...form, match_type: v as MatchType })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_TYPES.map((tp) => (
                    <SelectItem key={tp.value} value={tp.value}>
                      {t(tp.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pattern */}
            <div className="flex flex-col gap-1.5">
              <Label>{t('rule_pattern')}</Label>
              <Input
                value={form.pattern}
                onChange={(e) => setForm({ ...form, pattern: e.target.value })}
              />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <Label>{t('rule_category')}</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>

            {/* Priority */}
            <div className="flex items-center gap-3">
              <Label className="whitespace-nowrap">{t('rule_priority_label')}</Label>
              <Input
                type="number"
                className="w-20"
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: parseInt(e.target.value, 10) || 50 })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('rule_cancel')}
            </Button>
            <Button onClick={handleSave}>{t('rule_save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rule_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? t('rule_delete_confirm').replace('{{name}}', deleteTarget.name)
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('rule_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              {t('rule_save')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('rule_reset')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('rule_reset_confirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('rule_cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
              {t('general_dialog_ok')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
