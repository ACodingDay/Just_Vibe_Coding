/**
 * FileItem.tsx — 单个文件/文件夹/快捷方式卡片
 *
 * 交互行为：
 * - 双击：打开文件（调用 Tauri IPC open_file）
 * - 长按拖拽：由 useLongPressDrag 管理
 * - 右键菜单：禁用（防止浏览器默认行为）
 * - 文件夹显示 folder 图标，快捷方式/文件延迟加载系统图标
 */

import { useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Link2, FileText } from 'lucide-react';
import { openFile } from '@/services/ipc';
import type { IconEntry } from '@/types/tauri';

interface FileItemProps {
  item: IconEntry;
  drawerId: string;
  /** 注册需要懒加载图标的元素 */
  registerLazyIcon: (el: HTMLElement, path: string) => void;
  /** 获取拖拽绑定处理器 */
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

export default function FileItem({
  item,
  drawerId,
  registerLazyIcon,
  getDragHandlers,
}: FileItemProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);

  // 双击打开文件
  const handleDoubleClick = useCallback(async () => {
    try {
      await openFile(item.path);
    } catch (e) {
      console.error(t('organize_open_failed'), e);
    }
  }, [item.path, t]);

  // 组件挂载后注册懒加载和拖拽
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (!el) return;

      // 注册懒加载图标（非文件夹）
      if (!item.is_dir && iconRef.current) {
        registerLazyIcon(iconRef.current, item.path);
      }
    },
    [item.is_dir, item.path, registerLazyIcon],
  );

  // 获取拖拽处理器
  const dragHandlers = cardRef.current
    ? getDragHandlers(item.path, drawerId, cardRef.current)
    : null;

  // 图标内容
  const renderIcon = () => {
    if (item.is_dir) {
      return <Folder className="h-6 w-6" style={{ color: 'var(--md-sys-color-primary)' }} />;
    }
    if (item.is_lnk) {
      return <Link2 className="h-6 w-6" style={{ color: 'var(--md-sys-color-on-surface-variant)' }} />;
    }
    return <FileText className="h-6 w-6" style={{ color: 'var(--md-sys-color-on-surface-variant)' }} />;
  };

  return (
    <div
      ref={setRefs}
      className="file-item flex flex-col items-start justify-center cursor-default select-none relative"
      style={{
        padding: '8px 4px',
        borderRadius: 'clamp(6px, 1vmin, 12px)',
        transition: 'background 0.15s, transform 0.15s',
      }}
      title={item.name}
      data-path={item.path}
      data-drawer-id={drawerId}
      draggable={false}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      {...(dragHandlers || {})}
    >
      <div
        ref={iconRef}
        className="file-item-icon self-center flex items-center justify-center"
        style={{ width: '36px', height: '36px' }}
        data-path={item.path}
      >
        {renderIcon()}
      </div>
      <span
        className="file-item-name text-left leading-tight mt-1 break-all"
        style={{
          fontSize: 'clamp(10px, 1.4vmin, 12px)',
          color: 'var(--md-sys-color-on-surface)',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {item.name}
      </span>
    </div>
  );
}
