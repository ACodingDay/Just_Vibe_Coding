// ============================================================
// shader-build.js — shader 组装入口
// 最终片元着色器由主题描述符（js/themes/*）的 assemblyFn 产出；
// buildFragment(themeId) 供 renderer 在每次 boot 时按当前主题构建，
// 主题切换 = 换 id 重新构建 + 重编译 program + 重播开场揭示。
// 染色与开场揭示配方见各主题文件；原样提取自
// Rice-dog/code-codex explorer-element.ts（commit 0902983a）。
// ============================================================
'use strict';

function cloudTrainTintRgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return [1, 1, 1];
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
}

// 最终片元着色器 = 主题拼块经该主题的染色 + 开场揭示配方组装，
// 并注入 zoom / offset 等动态 uniform 与 main 入口
function buildFragment(themeId) {
  const theme = getCloudTrainTheme(themeId);
  return theme.assemblyFn({
    helpers: GLSL_HELPERS,
    scene: theme.scene,
    mainHead: GLSL_MAIN_HEAD,
    subject: GLSL_SUBJECT_TRAIN,
    mainTail: GLSL_MAIN_TAIL
  });
}
