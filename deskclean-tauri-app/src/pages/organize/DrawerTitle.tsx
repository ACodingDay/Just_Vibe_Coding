/**
 * DrawerTitle.tsx — 抽屉标题行
 *
 * 包含三个功能区域：
 * 1. 置顶按钮（常显）：点击后将此抽屉移到最顶部
 * 2. 标题文本 + 折叠切换：点击切换折叠状态
 * 3. 编辑按钮（常显）：点击后变为内联输入框
 *    - 输入框 maxlength=10
 *    - Enter 确认，Escape 取消
 *    - 失焦自动保存
 *    - 名称以原文持久化（不经过 i18n 翻译）
 */

import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUpToLine, Pencil, ChevronDown, ChevronUp } from 'lucide-react';

interface DrawerTitleProps {
  drawerId: string;
  displayName: string;
  count: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPinToTop: () => void;
  onRename: (newName: string | null) => void; // null = 恢复默认名
  /** i18n 翻译的分类名（用于判断是否有自定义名） */
  defaultName: string;
}

export default function DrawerTitle({
  drawerId,
  displayName,
  count,
  collapsed,
  onToggleCollapse,
  onPinToTop,
  onRename,
  defaultName,
}: DrawerTitleProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  // 开始编辑
  const startEdit = useCallback(() => {
    setEditValue(displayName);
    setEditing(true);
    // 延迟 focus 等待 DOM 更新
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [displayName]);

  // 完成编辑
  const finishEdit = useCallback(
    (save: boolean) => {
      setEditing(false);
      if (save) {
        const trimmed = editValue.trim();
        if (trimmed && trimmed !== defaultName) {
          onRename(trimmed);
        } else {
          onRename(null); // 恢复默认
        }
      }
    },
    [editValue, defaultName, onRename],
  );

  return (
    <div
      className="flex items-center gap-2 cursor-pointer select-none"
      style={{
        marginBottom: collapsed ? 0 : 'clamp(8px, 1.5vmin, 14px)',
        paddingBottom: collapsed ? 0 : 'clamp(6px, 1vmin, 10px)',
        borderBottom: collapsed ? 'none' : '1px solid var(--md-sys-color-outline-variant)',
        color: 'var(--md-sys-color-on-surface)',
      }}
      onClick={(e) => {
        // 排除按钮和输入框的点击
        if ((e.target as HTMLElement).closest('button, input')) return;
        onToggleCollapse();
      }}
    >
      {/* 置顶按钮（常显） */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        title="置顶"
        onClick={(e) => {
          e.stopPropagation();
          onPinToTop();
        }}
      >
        <ArrowUpToLine className="h-4 w-4" />
      </Button>

      {/* 标题文本或输入框 */}
      {editing ? (
        <input
          ref={inputRef}
          className="flex-1 min-w-0 px-2 py-1 rounded border outline-none text-sm font-medium"
          style={{
            borderColor: 'var(--md-sys-color-primary)',
            background: 'var(--md-sys-color-surface)',
            color: 'var(--md-sys-color-on-surface)',
          }}
          type="text"
          maxLength={10}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              finishEdit(true);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              finishEdit(false);
            }
          }}
          onBlur={() => finishEdit(true)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="flex-1 min-w-0 font-medium truncate"
          style={{ fontSize: 'clamp(14px, 2vmin, 18px)' }}
        >
          {displayName}
        </span>
      )}

      {/* 编辑按钮（常显） */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          startEdit();
        }}
      >
        <Pencil className="h-4 w-4" />
      </Button>

      {/* 计数 */}
      <Badge variant="secondary" className="shrink-0">
        {count}
      </Badge>

      {/* 折叠箭头 */}
      {collapsed ? (
        <ChevronDown className="h-5 w-5 shrink-0" style={{ color: 'var(--md-sys-color-outline)' }} />
      ) : (
        <ChevronUp className="h-5 w-5 shrink-0" style={{ color: 'var(--md-sys-color-outline)' }} />
      )}
    </div>
  );
}
