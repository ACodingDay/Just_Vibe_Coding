/**
 * 主题预设 — 从中国色 AI 共创精选 6 种配色
 * 每个色系各不相同，避免相似色重复
 * https://zhongguose.com/ai/co-create-colors
 */

export interface ThemePreset {
  id: string;
  name: string;
  source: string;
  tokens: Record<string, string>;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'tech-blue',
    name: '科技蓝',
    source: '默认主题',
    tokens: {
      '--md-sys-color-primary': '#1976D2',
      '--md-sys-color-on-primary': '#FFFFFF',
      '--md-sys-color-primary-container': '#D1E4FF',
      '--md-sys-color-on-primary-container': '#001D36',
      '--md-sys-color-secondary': '#535F70',
      '--md-sys-color-on-secondary': '#FFFFFF',
      '--md-sys-color-secondary-container': '#D7E3F7',
      '--md-sys-color-on-secondary-container': '#101C2B',
      '--md-sys-color-tertiary': '#6B5778',
      '--md-sys-color-on-tertiary': '#FFFFFF',
      '--md-sys-color-tertiary-container': '#F2DAFF',
      '--md-sys-color-on-tertiary-container': '#251431',
    },
  },
  {
    id: 'cuiqing',
    name: '翠青',
    source: '#2AAE6F',
    tokens: {
      '--md-sys-color-primary': '#2AAE6F',
      '--md-sys-color-on-primary': '#FFFFFF',
      '--md-sys-color-primary-container': '#C0F5D6',
      '--md-sys-color-on-primary-container': '#002110',
      '--md-sys-color-secondary': '#4D6357',
      '--md-sys-color-on-secondary': '#FFFFFF',
      '--md-sys-color-secondary-container': '#CFE9D9',
      '--md-sys-color-on-secondary-container': '#0A1F16',
      '--md-sys-color-tertiary': '#3E6374',
      '--md-sys-color-on-tertiary': '#FFFFFF',
      '--md-sys-color-tertiary-container': '#C2E8FB',
      '--md-sys-color-on-tertiary-container': '#001F2A',
    },
  },
  {
    id: 'liujin',
    name: '鎏金',
    source: '#D4AF37',
    tokens: {
      '--md-sys-color-primary': '#D4AF37',
      '--md-sys-color-on-primary': '#1B1B1F',
      '--md-sys-color-primary-container': '#FFF0C0',
      '--md-sys-color-on-primary-container': '#2C2000',
      '--md-sys-color-secondary': '#6B5E3F',
      '--md-sys-color-on-secondary': '#FFFFFF',
      '--md-sys-color-secondary-container': '#F5E2A8',
      '--md-sys-color-on-secondary-container': '#231B00',
      '--md-sys-color-tertiary': '#3A6B4A',
      '--md-sys-color-on-tertiary': '#FFFFFF',
      '--md-sys-color-tertiary-container': '#BDF4C7',
      '--md-sys-color-on-tertiary-container': '#00210D',
    },
  },
  {
    id: 'yanzhi',
    name: '胭脂',
    source: '#C94A5E',
    tokens: {
      '--md-sys-color-primary': '#C94A5E',
      '--md-sys-color-on-primary': '#FFFFFF',
      '--md-sys-color-primary-container': '#FFD9DF',
      '--md-sys-color-on-primary-container': '#400012',
      '--md-sys-color-secondary': '#735156',
      '--md-sys-color-on-secondary': '#FFFFFF',
      '--md-sys-color-secondary-container': '#FFD9DF',
      '--md-sys-color-on-secondary-container': '#291014',
      '--md-sys-color-tertiary': '#73582B',
      '--md-sys-color-on-tertiary': '#FFFFFF',
      '--md-sys-color-tertiary-container': '#FFDEA5',
      '--md-sys-color-on-tertiary-container': '#271800',
    },
  },
  {
    id: 'yinger',
    name: '莺儿',
    source: '#A8D865',
    tokens: {
      '--md-sys-color-primary': '#A8D865',
      '--md-sys-color-on-primary': '#1B1B1F',
      '--md-sys-color-primary-container': '#D8F5A0',
      '--md-sys-color-on-primary-container': '#1A2D00',
      '--md-sys-color-secondary': '#5B6348',
      '--md-sys-color-on-secondary': '#FFFFFF',
      '--md-sys-color-secondary-container': '#DFE8C5',
      '--md-sys-color-on-secondary-container': '#181F0A',
      '--md-sys-color-tertiary': '#3D7466',
      '--md-sys-color-on-tertiary': '#FFFFFF',
      '--md-sys-color-tertiary-container': '#C0FDEA',
      '--md-sys-color-on-tertiary-container': '#00201B',
    },
  },
  {
    id: 'xiancaizi',
    name: '浅苋菜紫',
    source: '#D8BFD8',
    tokens: {
      '--md-sys-color-primary': '#D8BFD8',
      '--md-sys-color-on-primary': '#1B1B1F',
      '--md-sys-color-primary-container': '#F5E0F5',
      '--md-sys-color-on-primary-container': '#2D152D',
      '--md-sys-color-secondary': '#6B5D6A',
      '--md-sys-color-on-secondary': '#FFFFFF',
      '--md-sys-color-secondary-container': '#F4E0F0',
      '--md-sys-color-on-secondary-container': '#241B25',
      '--md-sys-color-tertiary': '#7A5645',
      '--md-sys-color-on-tertiary': '#FFFFFF',
      '--md-sys-color-tertiary-container': '#FFDBCE',
      '--md-sys-color-on-tertiary-container': '#2E1509',
    },
  },
];
