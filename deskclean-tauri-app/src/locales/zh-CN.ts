export default {
  // 分类名称
  category_folder: '文件夹',
  category_image: '图片',
  category_document: '文档',
  category_video: '视频',
  category_music: '音乐',
  category_archive: '压缩包',
  category_other: '其他',
  category_webpage: '网页',
  category_shortcut: '快捷方式',
  category_browser: '浏览器',
  category_dev_tool: '开发工具',
  category_office: '办公软件',
  category_communication: '通讯社交',
  category_media: '媒体播放',
  category_game: '游戏平台',
  category_design: '设计创作',
  category_system_tool: '系统工具',
  category_downloader: '下载工具',
  category_compressor: '压缩工具',
  category_security: '安全软件',
  category_source: '源代码',

  // 页面标题
  page_organize: '桌面收纳',
  page_settings: '设置中心',
  page_membership: '会员服务',
  page_about: '关于软件',

  // Home
  app_name: 'DeskClean',
  app_slogan: '桌面整理，一键清爽',
  nav_clean: '一键整理',
  nav_settings: '设置中心',
  nav_membership: '会员服务',
  nav_about: '关于软件',

  // Organize
  organize_title: '桌面文件',
  organize_loading: '加载中...',
  organize_scanning: '正在整理桌面文件...',
  organize_empty: '桌面空空如也',
  organize_count: '{{count}} 个项目',
  organize_refresh: '刷新',
  organize_reset_default: '恢复默认',
  organize_reset_confirm: '确定要清除所有手动分类调整，恢复为规则引擎的默认分类吗？',
  organize_open_failed: '打开失败',

  // Settings
  settings_back: '返回',
  settings_rule: '整理规则',
  settings_general: '常规设置',
  settings_theme: '外观主题',

  // Settings - Rule
  rule_title: '自定义规则',
  rule_add: '添加规则',
  rule_reset: '恢复默认',
  rule_reset_confirm: '确定要删除所有自定义规则并恢复默认吗？',
  rule_desc: '自动整理桌面文件时的分类规则和命名规范',
  rule_note: '自定义规则优先级高于内置规则。快捷方式（.lnk）会解析目标程序后再匹配。',
  rule_empty: '暂无自定义规则，所有文件按内置规则分类。',
  rule_name: '规则名称',
  rule_target: '匹配目标',
  rule_type: '匹配方式',
  rule_pattern: '匹配内容',
  rule_category: '目标分类',
  rule_priority_label: '优先级（数值越小越优先）',
  rule_cancel: '取消',
  rule_save: '保存',
  rule_edit_title: '编辑规则',
  rule_add_title: '添加规则',
  rule_target_file_name: '文件名',
  rule_target_file_extension: '文件扩展名',
  rule_target_lnk_path: '快捷方式目标路径',
  rule_target_lnk_name: '快捷方式目标名称',
  rule_target_file_path: '完整路径',
  rule_type_exact: '精确匹配',
  rule_type_contains: '包含',
  rule_type_starts_with: '前缀匹配',
  rule_type_ends_with: '后缀匹配',
  rule_type_regex: '正则表达式',
  rule_delete_confirm: '确定删除规则 "{{name}}" 吗？',

  // Settings - General
  general_autostart: '开机启动',
  general_language: '界面语言',
  general_language_restart_title: '提示',
  general_language_restart_msg: '语言设置已保存，重启软件后生效。',
  general_dialog_ok: '确定',

  // Settings - Theme
  theme_builtin: '内置',

  // About
  about_version: '版本 0.1.0',
  about_desc: '一款开发中的桌面整理工具，保持工作环境整洁有序。',

  // Membership
  membership_coming: '会员功能即将推出，敬请期待。',
  membership_already: '你已经是会员，无需解锁',

  // Errors
  error_load_rules: '加载规则失败',
  error_save_rules: '保存失败',
  error_reset_rules: '重置失败',
} as const;
