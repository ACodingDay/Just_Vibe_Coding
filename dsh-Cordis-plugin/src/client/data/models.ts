/** Enums ported from GrokBot's models.dart (nasawz/GrokBot, BSD-3-Clause). */

/** The 39 high-level behavior states; each owns an expression pool and cadences. */
export const GROKBOT_STATES = [
  'sleeping',
  'waking',
  'idle',
  'listening',
  'thinking',
  'searching',
  'working',
  'excited',
  'surprised',
  'suspicious',
  'angry',
  'drowsy',
  'happy',
  'curious',
  'confused',
  'bored',
  'proud',
  'shy',
  'sad',
  'laughing',
  'scared',
  'playful',
  'celebrate',
  'orbit',
  'radar',
  'progress',
  'spawning',
  'humming',
  'loading',
  'dictating',
  'writing',
  'sending',
  'receiving',
  'uploading',
  'notifying',
  'alerting',
  'dragging',
  'bouncing',
  'poweringDown',
] as const

export type GrokBotState = typeof GROKBOT_STATES[number]

/** The 18 body silhouettes. */
export const GROKBOT_SHAPES = [
  'blob',
  'pebble',
  'bean',
  'egg',
  'squircle',
  'tablet',
  'capsule',
  'cylinder',
  'hex',
  'gem',
  'crystal',
  'wedge',
  'shield',
  'dome',
  'arch',
  'cloud',
  'teardrop',
  'leaf',
] as const

export type GrokBotShape = typeof GROKBOT_SHAPES[number]

/** The 25 built-in eye expressions, indexed as in expression_data.dart. */
export const EXPRESSION_COUNT = 25
