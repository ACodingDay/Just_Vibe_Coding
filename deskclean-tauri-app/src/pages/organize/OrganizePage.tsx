/**
 * OrganizePage.tsx — 桌面收纳页面主组件
 *
 * 状态管理策略：useReducer 集中管理所有状态
 * 组件职责：
 * - 初始化加载数据（快照优先，回退到实时扫描）
 * - 管理 overrides / iconPositions / drawerNames / drawerOrder 持久化
 * - 协调拖拽 drop 结果（跨分类移动 vs 同分类排序）
 * - 生命周期：mount 时隐藏桌面图标，unmount 时恢复
 */

import { useReducer, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import AppBar from '@/components/AppBar';
import { useLongPressDrag, type DropResult } from '@/hooks/useLongPressDrag';
import { useLazyIcons } from '@/hooks/useLazyIcons';
import {
  scanDesktop,
  getDrawerSnapshot,
  hideDesktopIcons,
  showDesktopIcons,
} from '@/services/ipc';
import {
  loadOverrides,
  saveOverrides,
  loadIconPositions,
  saveIconPositions,
  loadDrawerNames,
  saveDrawerNames,
  loadDrawerOrder,
  saveDrawerOrder,
} from '@/services/store';
import {
  applyDrawerOrder,
  applyOverrides,
  applyPositions,
  insertIconPosition,
  removeIconPosition,
  cleanupEmptyDrawers,
  moveDrawerToTop,
  getNextCustomId,
  totalIconCount,
  getDrawerDisplayName,
} from './organizeLogic';
import type { Drawer } from '@/types/tauri';
import OrganizeHeader from './OrganizeHeader';
import OrganizeBody from './OrganizeBody';

// ──────────────────────────────────────────────
// 状态定义
// ──────────────────────────────────────────────

interface OrganizeState {
  /** Rust 后端原始抽屉数据 */
  rawDrawers: Drawer[];
  overrides: Record<string, string>;
  iconPositions: Record<string, string[]>;
  drawerNames: Record<string, string>;
  drawerOrder: string[];
  /** 临时抽屉 ID（新增空抽屉时使用） */
  tempDrawerId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: OrganizeState = {
  rawDrawers: [],
  overrides: {},
  iconPositions: {},
  drawerNames: {},
  drawerOrder: [],
  tempDrawerId: null,
  loading: true,
  error: null,
};

type Action =
  | { type: 'START_LOADING' }
  | { type: 'LOADED'; rawDrawers: Drawer[]; overrides: Record<string, string>; iconPositions: Record<string, string[]>; drawerNames: Record<string, string>; drawerOrder: string[] }
  | { type: 'ERROR'; error: string }
  | { type: 'SET_OVERRIDES'; overrides: Record<string, string> }
  | { type: 'SET_POSITIONS'; iconPositions: Record<string, string[]> }
  | { type: 'SET_NAMES'; drawerNames: Record<string, string> }
  | { type: 'SET_ORDER'; drawerOrder: string[] }
  | { type: 'SET_TEMP_DRAWER'; tempDrawerId: string | null }
  | { type: 'CLEAR_ALL' };

function reducer(state: OrganizeState, action: Action): OrganizeState {
  switch (action.type) {
    case 'START_LOADING':
      return { ...state, loading: true, error: null };
    case 'LOADED':
      return {
        ...state,
        rawDrawers: action.rawDrawers,
        overrides: action.overrides,
        iconPositions: action.iconPositions,
        drawerNames: action.drawerNames,
        drawerOrder: action.drawerOrder,
        loading: false,
        error: null,
        tempDrawerId: null,
      };
    case 'ERROR':
      return { ...state, loading: false, error: action.error };
    case 'SET_OVERRIDES':
      return { ...state, overrides: action.overrides };
    case 'SET_POSITIONS':
      return { ...state, iconPositions: action.iconPositions };
    case 'SET_NAMES':
      return { ...state, drawerNames: action.drawerNames };
    case 'SET_ORDER':
      return { ...state, drawerOrder: action.drawerOrder };
    case 'SET_TEMP_DRAWER':
      return { ...state, tempDrawerId: action.tempDrawerId };
    case 'CLEAR_ALL':
      return {
        ...state,
        overrides: {},
        iconPositions: {},
        drawerNames: {},
        drawerOrder: [],
        tempDrawerId: null,
      };
    default:
      return state;
  }
}

// ──────────────────────────────────────────────
// 主组件
// ──────────────────────────────────────────────

export default function OrganizePage() {
  const { t, i18n } = useTranslation();
  const [state, dispatch] = useReducer(reducer, initialState);
  const { enqueueIcons } = useLazyIcons();

  // 用 ref 保存最新 state 供回调闭包访问
  const stateRef = useRef(state);
  stateRef.current = state;

  // i18n 分类翻译函数
  const tc = useCallback(
    (key: string) => t(`category_${key}`, key),
    [t],
  );

  // ── 生命周期：隐藏桌面图标 ──
  useEffect(() => {
    hideDesktopIcons().catch(() => {});
    return () => {
      showDesktopIcons().catch(() => {});
    };
  }, []);

  // ── 加载数据 ──
  const loadFiles = useCallback(async () => {
    dispatch({ type: 'START_LOADING' });

    // 加载持久化数据
    const [overrides, iconPositions, drawerNames, drawerOrder] = await Promise.all([
      loadOverrides(),
      loadIconPositions(),
      loadDrawerNames(),
      loadDrawerOrder(),
    ]);

    // 加载抽屉数据（快照优先）
    let drawers: Drawer[];
    try {
      drawers = await getDrawerSnapshot();
      if (!drawers || drawers.length === 0) {
        drawers = await scanDesktop();
      }
    } catch {
      try {
        drawers = await scanDesktop();
      } catch (e2) {
        dispatch({ type: 'ERROR', error: String(e2) });
        return;
      }
    }

    dispatch({
      type: 'LOADED',
      rawDrawers: drawers,
      overrides,
      iconPositions,
      drawerNames,
      drawerOrder,
    });
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // ── 计算有效抽屉列表 ──
  const effectiveDrawers = applyDrawerOrder(
    applyOverrides(state.rawDrawers, state.overrides, state.tempDrawerId).map((d) => ({
      ...d,
      icons: applyPositions(d.drawer_id, d.icons, state.iconPositions),
    })),
    state.drawerOrder,
  );

  // 计数文本
  const totalCount = totalIconCount(
    applyOverrides(state.rawDrawers, state.overrides, state.tempDrawerId),
  );
  const countText = totalCount === 0 ? '' : t('organize_count', { count: totalCount });

  // ── 拖拽处理 ──
  const handleDrop = useCallback(
    async (result: DropResult) => {
      const s = stateRef.current;
      const { srcPath, srcDrawerId, targetCardPath, targetDrawerId, position } = result;
      if (!targetDrawerId) return;

      let newOverrides = s.overrides;
      let newPositions = s.iconPositions;

      if (srcDrawerId === targetDrawerId) {
        // 同抽屉内排序
        const beforePath = position === 'before' ? targetCardPath : null;
        const afterCardPath = position === 'after' ? targetCardPath : null;
        const insertBefore = beforePath
          || (afterCardPath
            ? (() => {
                const effective = applyOverrides(s.rawDrawers, s.overrides, s.tempDrawerId);
                const drawer = effective.find((d) => d.drawer_id === targetDrawerId);
                if (!drawer) return null;
                const sorted = applyPositions(targetDrawerId, drawer.icons, s.iconPositions);
                const idx = sorted.findIndex((ic) => ic.path === afterCardPath);
                return idx >= 0 && idx + 1 < sorted.length ? sorted[idx + 1].path : null;
              })()
            : null);
        newPositions = insertIconPosition(
          s.iconPositions, targetDrawerId, srcPath, insertBefore,
          s.rawDrawers, s.overrides, s.tempDrawerId,
        );
      } else {
        // 跨抽屉移动
        newOverrides = { ...s.overrides, [srcPath]: targetDrawerId };
        newPositions = removeIconPosition(s.iconPositions, srcDrawerId, srcPath);
        const beforePath = position === 'before' ? targetCardPath
          : position === 'after'
            ? (() => {
                const effective = applyOverrides(s.rawDrawers, newOverrides, s.tempDrawerId);
                const drawer = effective.find((d) => d.drawer_id === targetDrawerId);
                if (!drawer) return null;
                const sorted = applyPositions(targetDrawerId, drawer.icons, newPositions);
                const idx = sorted.findIndex((ic) => ic.path === targetCardPath);
                return idx >= 0 && idx + 1 < sorted.length ? sorted[idx + 1].path : null;
              })()
            : null;
        newPositions = insertIconPosition(
          newPositions, targetDrawerId, srcPath, beforePath,
          s.rawDrawers, newOverrides, s.tempDrawerId,
        );
      }

      // 清理空抽屉
      const newEffective = applyDrawerOrder(
        applyOverrides(s.rawDrawers, newOverrides, s.tempDrawerId),
        s.drawerOrder,
      );
      const cleaned = cleanupEmptyDrawers(newPositions, s.drawerNames, newEffective);

      dispatch({ type: 'SET_OVERRIDES', overrides: newOverrides });
      dispatch({ type: 'SET_POSITIONS', iconPositions: cleaned.iconPositions });
      if (cleaned.changed) {
        dispatch({ type: 'SET_NAMES', drawerNames: cleaned.drawerNames });
      }

      // 持久化
      await saveOverrides(newOverrides);
      await saveIconPositions(cleaned.iconPositions);
      if (cleaned.changed) await saveDrawerNames(cleaned.drawerNames);
    },
    [],
  );

  const { bindDrag } = useLongPressDrag({ onDrop: handleDrop });

  // ── 置顶 ──
  const handlePinToTop = useCallback(async (drawerId: string) => {
    const s = stateRef.current;
    const newOrder = moveDrawerToTop(drawerId, s.drawerOrder);
    dispatch({ type: 'SET_ORDER', drawerOrder: newOrder });
    await saveDrawerOrder(newOrder);
  }, []);

  // ── 重命名 ──
  const handleRenameDrawer = useCallback(async (drawerId: string, newName: string | null) => {
    const s = stateRef.current;
    const newNames = { ...s.drawerNames };
    if (newName) {
      newNames[drawerId] = newName;
    } else {
      delete newNames[drawerId];
    }
    dispatch({ type: 'SET_NAMES', drawerNames: newNames });
    await saveDrawerNames(newNames);
  }, []);

  // ── 新增分类 ──
  const handleAddDrawer = useCallback(async () => {
    const s = stateRef.current;
    const effective = applyOverrides(s.rawDrawers, s.overrides, s.tempDrawerId);
    // 已有空抽屉则不新增
    if (effective.some((d) => d.icons.length === 0)) return;

    const nextId = getNextCustomId(s.drawerNames, s.overrides);
    const tempId = `__custom_${nextId}`;
    const newNames = { ...s.drawerNames, [tempId]: `New${nextId}` };
    dispatch({ type: 'SET_NAMES', drawerNames: newNames });
    dispatch({ type: 'SET_TEMP_DRAWER', tempDrawerId: tempId });
    await saveDrawerNames(newNames);
  }, []);

  // ── 恢复默认 ──
  const handleResetOverrides = useCallback(async () => {
    const s = stateRef.current;
    if (
      Object.keys(s.overrides).length === 0 &&
      Object.keys(s.iconPositions).length === 0 &&
      Object.keys(s.drawerNames).length === 0 &&
      s.drawerOrder.length === 0
    ) return;
    if (!confirm(t('organize_reset_confirm'))) return;

    dispatch({ type: 'CLEAR_ALL' });
    await saveOverrides({});
    await saveIconPositions({});
    await saveDrawerNames({});
    await saveDrawerOrder([]);
    await loadFiles();
  }, [t, loadFiles]);

  // ── 懒加载图标注册 ──
  const registerLazyIcon = useCallback(
    (el: HTMLElement, path: string) => {
      enqueueIcons([{ el, path }]);
    },
    [enqueueIcons],
  );

  // ── 拖拽绑定 ──
  const getDragHandlers = useCallback(
    (srcPath: string, srcDrawerId: string, cardEl: HTMLElement) =>
      bindDrag(srcPath, srcDrawerId, cardEl),
    [bindDrag],
  );

  return (
    <>
      <AppBar title={t('page_organize')} />
      <div
        className="flex flex-col flex-1 overflow-hidden"
        onContextMenu={(e) => e.preventDefault()}
      >
        <OrganizeHeader
          countText={countText}
          onRefresh={loadFiles}
          onAddDrawer={handleAddDrawer}
          onResetOverrides={handleResetOverrides}
        />
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: '16px clamp(12px, 2.5vmin, 28px)' }}
        >
          <OrganizeBody
            loading={state.loading}
            error={state.error}
            drawers={effectiveDrawers}
            drawerNames={state.drawerNames}
            tc={tc}
            onPinToTop={handlePinToTop}
            onRenameDrawer={handleRenameDrawer}
            registerLazyIcon={registerLazyIcon}
            getDragHandlers={getDragHandlers}
          />
        </div>
      </div>
    </>
  );
}
