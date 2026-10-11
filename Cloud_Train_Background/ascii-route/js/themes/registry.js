// ============================================================
// themes/registry.js — 主题注册表
// ============================================================
'use strict';

const CLOUD_TRAIN_THEMES = [THEME_CLOUDS, THEME_OCEAN];

// 无参或未知 id 时回落到云海主题
function getCloudTrainTheme(id) {
  return CLOUD_TRAIN_THEMES.find(t => t.id === id) || THEME_CLOUDS;
}
