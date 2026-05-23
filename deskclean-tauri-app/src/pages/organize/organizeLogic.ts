/**
 * organizeLogic.ts — 纯函数逻辑模块
 *
 * 包含 Organize 页面所有状态变换的纯函数，不含任何 React 或 DOM 操作。
 * 每个函数都是确定性的，便于单元测试。
 *
 * 核心数据结构:
 * - Drawer[]:           Rust 后端返回的抽屉快照（drawer_id + icons[]）
 * - overrides:          Record<path, drawer_id>  用户手动调整的分类
 * - iconPositions:      Record<drawer_id, path[]> 用户排列的图标顺序
 * - drawerNames:        Record<drawer_id, string>  用户自定义抽屉名
 * - drawerOrder:        string[]                   用户排列的抽屉顺序
 */

import type { Drawer, IconEntry } from '@/types/tauri';

// ──────────────────────────────────────────────
// 1. 抽屉排序
// ──────────────────────────────────────────────

/**
 * 按 drawerOrder 排序抽屉列表。
 * 不在 order 中的抽屉排到末尾（保持原始相对顺序）。
 */
export function applyDrawerOrder(drawers: Drawer[], drawerOrder: string[]): Drawer[] {
  if (drawerOrder.length === 0) return drawers;
  const orderMap = new Map(drawerOrder.map((id, i) => [id, i]));
  return [...drawers].sort((a, b) => {
    const ai = orderMap.has(a.drawer_id) ? orderMap.get(a.drawer_id)! : drawerOrder.length;
    const bi = orderMap.has(b.drawer_id) ? orderMap.get(b.drawer_id)! : drawerOrder.length;
    return ai - bi;
  });
}

/**
 * 将指定抽屉移到最顶部（更新 drawerOrder 数组）。
 */
export function moveDrawerToTop(drawerId: string, drawerOrder: string[]): string[] {
  const filtered = drawerOrder.filter((id) => id !== drawerId);
  return [drawerId, ...filtered];
}

// ──────────────────────────────────────────────
// 2. 分类覆盖 (overrides)
// ──────────────────────────────────────────────

/**
 * 将 overrides 应用到抽屉列表：
 * - 按 override 把图标从原抽屉移到目标抽屉
 * - 为 overrides 中指向但不存在于原始 drawers 的自定义目标创建空槽位
 * - 为临时抽屉（tempDrawerId）创建空槽位
 *
 * 返回新的 Drawer[] 数组（不修改原数组）。
 */
export function applyOverrides(
  drawers: Drawer[],
  overrides: Record<string, string>,
  tempDrawerId: string | null,
): Drawer[] {
  if (Object.keys(overrides).length === 0 && !tempDrawerId) return drawers;

  // 构建 drawer_id → icons[] 映射
  const map = new Map<string, IconEntry[]>();
  const originalIds = new Set<string>();
  for (const d of drawers) {
    map.set(d.drawer_id, [...d.icons]);
    originalIds.add(d.drawer_id);
  }

  // 为 overrides 指向的非原始目标创建空槽位
  for (const target of Object.values(overrides)) {
    if (!map.has(target)) map.set(target, []);
  }
  // 为临时抽屉创建空槽位
  if (tempDrawerId && !map.has(tempDrawerId)) {
    map.set(tempDrawerId, []);
  }

  // 按 override 移动图标
  for (const [drawerId, icons] of map) {
    const kept: IconEntry[] = [];
    for (const icon of icons) {
      const target = overrides[icon.path];
      if (target && target !== drawerId && map.has(target)) {
        map.get(target)!.push(icon);
      } else {
        kept.push(icon);
      }
    }
    map.set(drawerId, kept);
  }

  // 构建结果：先原始抽屉（保持顺序），再自定义抽屉
  const result: Drawer[] = [];
  for (const d of drawers) {
    const icons = map.get(d.drawer_id);
    if (icons && icons.length > 0) {
      result.push({ drawer_id: d.drawer_id, icons });
    }
  }
  for (const [drawerId, icons] of map) {
    if (!originalIds.has(drawerId)) {
      if (icons.length > 0 || drawerId === tempDrawerId) {
        result.push({ drawer_id: drawerId, icons });
      }
    }
  }
  return result;
}

// ──────────────────────────────────────────────
// 3. 图标位置排序
// ──────────────────────────────────────────────

/**
 * 将用户保存的排列顺序应用到抽屉内图标列表。
 * 不在 iconPositions 中的图标（如新出现在桌面的文件）追加到末尾。
 */
export function applyPositions(
  drawerId: string,
  icons: IconEntry[],
  iconPositions: Record<string, string[]>,
): IconEntry[] {
  const order = iconPositions[drawerId];
  if (!order || order.length === 0) return icons;

  const orderedMap = new Map(icons.map((ic) => [ic.path, ic]));
  const result: IconEntry[] = [];
  const seen = new Set<string>();

  for (const p of order) {
    const icon = orderedMap.get(p);
    if (icon) {
      result.push(icon);
      seen.add(p);
    }
  }
  // 追加 order 中未覆盖的新图标
  for (const ic of icons) {
    if (!seen.has(ic.path)) result.push(ic);
  }
  return result;
}

/**
 * 将 path 插入到 drawerId 的位置列表中。
 * beforePath 为 null 则插入到末尾。
 *
 * 首次为该 drawerId 生成列表时，先基于当前抽屉内图标自然顺序初始化完整列表，
 * 确保新出现在桌面的文件也有参照位置。
 */
export function insertIconPosition(
  iconPositions: Record<string, string[]>,
  drawerId: string,
  path: string,
  beforePath: string | null,
  drawers: Drawer[],
  overrides: Record<string, string>,
  tempDrawerId: string | null,
): Record<string, string[]> {
  const next = { ...iconPositions };

  // 首次操作：初始化完整列表
  if (!next[drawerId]) {
    const effective = applyOverrides(drawers, overrides, tempDrawerId);
    const drawer = effective.find((d) => d.drawer_id === drawerId);
    next[drawerId] = drawer ? drawer.icons.map((ic) => ic.path) : [];
  }

  // 移除已存在的 path（避免重复）
  let list = next[drawerId].filter((p) => p !== path);

  // 补齐当前抽屉中所有未管理的新图标
  const effective = applyOverrides(drawers, overrides, tempDrawerId);
  const drawer = effective.find((d) => d.drawer_id === drawerId);
  if (drawer) {
    const inList = new Set(list);
    for (const ic of drawer.icons) {
      if (ic.path !== path && !inList.has(ic.path)) {
        list.push(ic.path);
      }
    }
  }

  if (!beforePath) {
    list.push(path);
  } else {
    const idx = list.indexOf(beforePath);
    list.splice(idx >= 0 ? idx : list.length, 0, path);
  }

  next[drawerId] = list;
  return next;
}

/**
 * 从 drawerId 的位置列表中移除 path。
 * 如果列表变空则删除整个键。
 */
export function removeIconPosition(
  iconPositions: Record<string, string[]>,
  drawerId: string,
  path: string,
): Record<string, string[]> {
  if (!iconPositions[drawerId]) return iconPositions;
  const next = { ...iconPositions };
  next[drawerId] = next[drawerId].filter((p) => p !== path);
  if (next[drawerId].length === 0) {
    delete next[drawerId];
  }
  return next;
}

// ──────────────────────────────────────────────
// 4. 空抽屉清理
// ──────────────────────────────────────────────

/**
 * 清理空抽屉的持久化数据：
 * 从 iconPositions 和 drawerNames 中删除已不存在于 effectiveDrawers 的抽屉 ID。
 */
export function cleanupEmptyDrawers(
  iconPositions: Record<string, string[]>,
  drawerNames: Record<string, string>,
  effectiveDrawers: Drawer[],
): {
  iconPositions: Record<string, string[]>;
  drawerNames: Record<string, string>;
  changed: boolean;
} {
  const activeIds = new Set(effectiveDrawers.map((d) => d.drawer_id));
  let changed = false;
  const nextPositions = { ...iconPositions };
  const nextNames = { ...drawerNames };

  for (const id of Object.keys(nextPositions)) {
    if (!activeIds.has(id)) {
      delete nextPositions[id];
      changed = true;
    }
  }
  for (const id of Object.keys(nextNames)) {
    if (!activeIds.has(id)) {
      delete nextNames[id];
      changed = true;
    }
  }

  return { iconPositions: nextPositions, drawerNames: nextNames, changed };
}

// ──────────────────────────────────────────────
// 5. 辅助函数
// ──────────────────────────────────────────────

/**
 * 计算下一个自定义抽屉 ID 的序号。
 * 扫描 drawerNames 和 overrides 中所有 __custom_N 格式的键，返回 max+1。
 */
export function getNextCustomId(
  drawerNames: Record<string, string>,
  overrides: Record<string, string>,
): number {
  let max = -1;
  const re = /^__custom_(\d+)$/;
  for (const key of Object.keys(drawerNames)) {
    const m = key.match(re);
    if (m) max = Math.max(max, parseInt(m[1]));
  }
  for (const val of Object.values(overrides)) {
    const m = val.match(re);
    if (m) max = Math.max(max, parseInt(m[1]));
  }
  return max + 1;
}

/** 计算所有抽屉中的图标总数 */
export function totalIconCount(drawers: Drawer[]): number {
  return drawers.reduce((sum, d) => sum + d.icons.length, 0);
}

/**
 * 获取抽屉的显示名称。
 * 优先使用用户自定义名称（drawerNames），否则回退到 i18n 翻译。
 * tc 参数是分类翻译函数（自动加 category_ 前缀）。
 */
export function getDrawerDisplayName(
  drawerId: string,
  drawerNames: Record<string, string>,
  tc: (key: string) => string,
): string {
  return drawerNames[drawerId] || tc(drawerId);
}
