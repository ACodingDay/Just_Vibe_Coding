/** 桌面文件条目 */
export interface IconEntry {
  icon_id: string;
  name: string;
  path: string;
  is_dir: boolean;
  is_lnk: boolean;
  lnk_target?: string;
}

/** 抽屉（文件分类分组） */
export interface Drawer {
  drawer_id: string;
  icons: IconEntry[];
}

/** 规则匹配目标 */
export type MatchTarget =
  | 'file_name'
  | 'file_extension'
  | 'lnk_target_path'
  | 'lnk_target_name'
  | 'file_path';

/** 规则匹配类型 */
export type MatchType =
  | 'exact'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'regex';

/** 自定义分类规则 */
export interface Rule {
  id: string;
  name: string;
  match_target: MatchTarget;
  match_type: MatchType;
  pattern: string;
  category: string;
  priority: number;
  enabled: boolean;
  is_builtin: boolean;
}
