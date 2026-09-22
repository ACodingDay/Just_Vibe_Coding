// ============================================================
// shader-build.js — shader 组装入口
// 最终片元着色器 SHADER_FRAGMENT 由当前主题描述符（js/themes/registry.js）
// 的 assemblyFn 产出；染色与开场揭示配方见 js/themes/clouds.js。
// 原样提取自 Rice-dog/code-codex explorer-element.ts（commit 0902983a）。
// ============================================================
'use strict';

function cloudTrainTintRgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return [1, 1, 1];
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
}

// 最终片元着色器 = 主题拼块经染色 + 开场揭示两轮替换后，
// 注入 zoom / offset / amplitude / detail 等动态 uniform 与 main 入口。
const SHADER_FRAGMENT = (() => {
  const theme = getCloudTrainTheme();
  return theme.assemblyFn({
    helpers: GLSL_HELPERS,
    scene: theme.scene,
    mainHead: GLSL_MAIN_HEAD,
    subject: GLSL_SUBJECT_TRAIN,
    mainTail: GLSL_MAIN_TAIL
  });
})();
