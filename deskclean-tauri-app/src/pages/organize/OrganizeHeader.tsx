/**
 * OrganizeHeader.tsx — 桌面收纳页面顶部工具栏
 *
 * 包含：标题、文件计数、操作按钮（新增分类、恢复默认、刷新）
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Plus, RotateCcw, RefreshCw } from 'lucide-react';

interface OrganizeHeaderProps {
  countText: string;
  onRefresh: () => void;
  onAddDrawer: () => void;
  onResetOverrides: () => void;
}

export default function OrganizeHeader({
  countText,
  onRefresh,
  onAddDrawer,
  onResetOverrides,
}: OrganizeHeaderProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        height: '56px',
        padding: '0 12px 0 20px',
        borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        gap: '12px',
      }}
    >
      <h2
        className="font-medium"
        style={{
          fontSize: 'clamp(16px, 2.5vmin, 22px)',
          color: 'var(--md-sys-color-on-surface)',
        }}
      >
        {t('organize_title')}
      </h2>

      <span
        className="whitespace-nowrap"
        style={{
          fontSize: 'clamp(11px, 1.6vmin, 13px)',
          color: 'var(--md-sys-color-on-surface-variant)',
        }}
      >
        {countText}
      </span>

      <div className="ml-auto flex" style={{ gap: '4px' }}>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          title="新增分类"
          onClick={onAddDrawer}
        >
          <Plus className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          title={t('organize_reset_default')}
          onClick={onResetOverrides}
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          title={t('organize_refresh')}
          onClick={onRefresh}
        >
          <RefreshCw className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
