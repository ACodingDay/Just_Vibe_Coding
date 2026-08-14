/** `grokbot` locale namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': 'GrokBot',
  'mood.idle': '休息中',
  'mood.sleeping': '睡觉中',
  'mood.thinking': '思考中',
  'mood.working': '工作中',
  'mood.writing': '写作中',
  'mood.celebrate': '完成啦',
} satisfies Record<string, string>

/** The grokbot namespace key union. */
export type GrokbotKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'GrokBot',
  'mood.idle': 'Resting',
  'mood.sleeping': 'Sleeping',
  'mood.thinking': 'Thinking',
  'mood.working': 'Working',
  'mood.writing': 'Writing',
  'mood.celebrate': 'Done',
} satisfies Record<GrokbotKey, string>
