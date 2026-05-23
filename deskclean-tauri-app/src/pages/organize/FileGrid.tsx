/**
 * FileGrid.tsx — 抽屉内的图标网格容器
 *
 * 渲染一组 FileItem 卡片，排列为自适应网格。
 * 提供 data-drawer-id 属性用于拖拽目标检测。
 */

import { useCallback, useRef } from 'react';
import FileItem from './FileItem';
import type { IconEntry } from '@/types/tauri';

interface FileGridProps {
  drawerId: string;
  icons: IconEntry[];
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

export default function FileGrid({
  drawerId,
  icons,
  registerLazyIcon,
  getDragHandlers,
}: FileGridProps) {
  return (
    <div
      className="file-group-items flex flex-wrap"
      style={{ gap: 'clamp(4px, 0.8vmin, 8px)' }}
      data-drawer-id={drawerId}
    >
      {icons.map((item) => (
        <FileItem
          key={item.path}
          item={item}
          drawerId={drawerId}
          registerLazyIcon={registerLazyIcon}
          getDragHandlers={getDragHandlers}
        />
      ))}
    </div>
  );
}
