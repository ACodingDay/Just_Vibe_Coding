/**
 * OrganizeBody.tsx — 桌面收纳页面主体区域
 *
 * 渲染三种状态之一：
 * 1. LoadingState — 加载中
 * 2. EmptyState — 桌面为空
 * 3. DrawerList — 有文件时渲染抽屉列表
 */

import { useTranslation } from 'react-i18next';
import DrawerSection from './DrawerSection';
import type { Drawer } from '@/types/tauri';

interface OrganizeBodyProps {
  loading: boolean;
  error: string | null;
  drawers: Drawer[];
  drawerNames: Record<string, string>;
  /** i18n 分类翻译函数 */
  tc: (key: string) => string;
  onPinToTop: (drawerId: string) => void;
  onRenameDrawer: (drawerId: string, newName: string | null) => void;
  registerLazyIcon: (el: HTMLElement, path: string) => void;
  getDragHandlers: (
    srcPath: string,
    srcDrawerId: string,
    cardEl: HTMLElement,
  ) => {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
  };
}

export default function OrganizeBody({
  loading,
  error,
  drawers,
  drawerNames,
  tc,
  onPinToTop,
  onRenameDrawer,
  registerLazyIcon,
  getDragHandlers,
}: OrganizeBodyProps) {
  const { t } = useTranslation();

  // 加载中
  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          height: '120px',
          fontSize: 'clamp(13px, 2vmin, 15px)',
          color: 'var(--md-sys-color-on-surface-variant)',
        }}
      >
        {t('organize_loading')}
      </div>
    );
  }

  // 错误
  if (error) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          height: '120px',
          fontSize: 'clamp(13px, 2vmin, 15px)',
          color: 'var(--md-sys-color-error)',
        }}
      >
        {error}
      </div>
    );
  }

  // 空桌面
  if (drawers.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{
          height: '120px',
          fontSize: 'clamp(13px, 2vmin, 15px)',
          color: 'var(--md-sys-color-on-surface-variant)',
        }}
      >
        {t('organize_empty')}
      </div>
    );
  }

  // 抽屉列表
  return (
    <div className="flex flex-col" style={{ gap: 'clamp(12px, 2.5vmin, 24px)' }}>
      {drawers.map((drawer) => (
        <DrawerSection
          key={drawer.drawer_id}
          drawerId={drawer.drawer_id}
          displayName={drawerNames[drawer.drawer_id] || tc(drawer.drawer_id)}
          defaultName={tc(drawer.drawer_id)}
          icons={drawer.icons}
          onPinToTop={() => onPinToTop(drawer.drawer_id)}
          onRename={(name) => onRenameDrawer(drawer.drawer_id, name)}
          registerLazyIcon={registerLazyIcon}
          getDragHandlers={getDragHandlers}
        />
      ))}
    </div>
  );
}
