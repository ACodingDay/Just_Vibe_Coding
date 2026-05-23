/**
 * DrawerSection.tsx — 单个抽屉区段
 *
 * 包含可折叠的标题行（DrawerTitle）和图标网格（FileGrid）。
 * 管理本抽屉的折叠状态。
 */

import { useState, useCallback } from 'react';
import DrawerTitle from './DrawerTitle';
import FileGrid from './FileGrid';
import type { IconEntry } from '@/types/tauri';

interface DrawerSectionProps {
  drawerId: string;
  displayName: string;
  defaultName: string;
  icons: IconEntry[];
  onPinToTop: () => void;
  onRename: (newName: string | null) => void;
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

export default function DrawerSection({
  drawerId,
  displayName,
  defaultName,
  icons,
  onPinToTop,
  onRename,
  registerLazyIcon,
  getDragHandlers,
}: DrawerSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="file-group group"
      style={{
        background: 'var(--md-sys-color-surface)',
        border: '1px solid var(--md-sys-color-outline-variant)',
        borderRadius: 'clamp(10px, 1.5vmin, 18px)',
        padding: 'clamp(12px, 2vmin, 20px)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
      }}
    >
      <DrawerTitle
        drawerId={drawerId}
        displayName={displayName}
        defaultName={defaultName}
        count={icons.length}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onPinToTop={onPinToTop}
        onRename={onRename}
      />

      {!collapsed && (
        <FileGrid
          drawerId={drawerId}
          icons={icons}
          registerLazyIcon={registerLazyIcon}
          getDragHandlers={getDragHandlers}
        />
      )}
    </div>
  );
}
