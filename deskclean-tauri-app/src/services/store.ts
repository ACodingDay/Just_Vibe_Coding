import { load } from '@tauri-apps/plugin-store';

const STORE_PATH = 'settings.json';

async function getStore() {
  return load(STORE_PATH);
}

// ── 主题 ──
export async function loadTheme(): Promise<string> {
  const store = await getStore();
  return (await store.get<string>('theme')) ?? 'tech-blue';
}

export async function saveTheme(id: string): Promise<void> {
  const store = await getStore();
  await store.set('theme', id);
  await store.save();
}

// ── 分类覆盖 (path → drawer_id) ──
export async function loadOverrides(): Promise<Record<string, string>> {
  const store = await getStore();
  return (await store.get<Record<string, string>>('category_overrides')) ?? {};
}

export async function saveOverrides(data: Record<string, string>): Promise<void> {
  const store = await getStore();
  await store.set('category_overrides', data);
  await store.save();
}

// ── 图标位置 (drawer_id → ordered paths) ──
export async function loadIconPositions(): Promise<Record<string, string[]>> {
  const store = await getStore();
  return (await store.get<Record<string, string[]>>('icon_positions')) ?? {};
}

export async function saveIconPositions(data: Record<string, string[]>): Promise<void> {
  const store = await getStore();
  await store.set('icon_positions', data);
  await store.save();
}

// ── 抽屉名称 ──
export async function loadDrawerNames(): Promise<Record<string, string>> {
  const store = await getStore();
  return (await store.get<Record<string, string>>('drawer_names')) ?? {};
}

export async function saveDrawerNames(data: Record<string, string>): Promise<void> {
  const store = await getStore();
  await store.set('drawer_names', data);
  await store.save();
}

// ── 抽屉顺序 ──
export async function loadDrawerOrder(): Promise<string[]> {
  const store = await getStore();
  return (await store.get<string[]>('drawer_order')) ?? [];
}

export async function saveDrawerOrder(data: string[]): Promise<void> {
  const store = await getStore();
  await store.set('drawer_order', data);
  await store.save();
}
