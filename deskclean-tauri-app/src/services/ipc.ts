import { invoke } from '@tauri-apps/api/core';
import type { Drawer, Rule } from '@/types/tauri';

// ── 桌面扫描 ──
export const isScanReady = () => invoke<boolean>('is_scan_ready');
export const scanDesktop = () => invoke<Drawer[]>('scan_desktop');
export const getDrawerSnapshot = () => invoke<Drawer[]>('get_drawer_snapshot');

// ── 文件操作 ──
export const openFile = (path: string) => invoke<void>('open_file', { path });
export const getFileIcon = (path: string) => invoke<string>('get_file_icon', { path });

// ── 桌面图标控制 ──
export const hideDesktopIcons = () => invoke<void>('hide_desktop_icons');
export const showDesktopIcons = () => invoke<void>('show_desktop_icons');

// ── 开机启动 ──
export const isAutostartEnabled = () => invoke<boolean>('is_autostart_enabled');
export const enableAutostart = () => invoke<void>('enable_autostart');
export const disableAutostart = () => invoke<void>('disable_autostart');

// ── 语言 ──
export const getLanguage = () => invoke<string>('get_language');
export const setLanguage = (language: string) => invoke<void>('set_language', { language });

// ── 规则管理 ──
export const getRules = () => invoke<Rule[]>('get_rules');
export const saveRules = (rules: Rule[]) => invoke<void>('save_rules', { rules });
export const resetRules = () => invoke<Rule[]>('reset_rules');
