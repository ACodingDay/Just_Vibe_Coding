/** State pools and cadences ported from GrokBot's state_data.dart. */

import type { GrokBotState } from './models.ts'

/** A randomized interval in milliseconds: [min, max] inclusive. */
export interface GrokBotCadence {
  readonly min: number
  readonly max: number
}

/** One state's data: expression pool plus expression/blink cadences. */
export interface GrokBotStateData {
  /** Expression indices available to this state (into grokbotExpressions). */
  readonly expressions: readonly number[]
  /** Random interval between automatic expression changes. */
  readonly expressionCadence: GrokBotCadence
  /** Random interval between automatic blinks; null disables blinking. */
  readonly blinkCadence: GrokBotCadence | null
}

export const grokbotStateData: Record<GrokBotState, GrokBotStateData> = {
  sleeping: { expressions: [13, 22, 4], expressionCadence: { min: 6000, max: 10000 }, blinkCadence: null },
  waking: { expressions: [13], expressionCadence: { min: 800, max: 800 }, blinkCadence: null },
  idle: { expressions: [0, 8], expressionCadence: { min: 9000, max: 16000 }, blinkCadence: { min: 6000, max: 14000 } },
  listening: { expressions: [10, 1, 19], expressionCadence: { min: 2800, max: 5000 }, blinkCadence: { min: 3000, max: 7000 } },
  thinking: { expressions: [8, 16, 14, 17, 5], expressionCadence: { min: 2000, max: 3600 }, blinkCadence: { min: 3500, max: 7000 } },
  searching: { expressions: [15, 9, 3, 20, 12, 18], expressionCadence: { min: 1000, max: 1800 }, blinkCadence: { min: 1600, max: 4000 } },
  working: { expressions: [7, 16, 11, 10], expressionCadence: { min: 1800, max: 3200 }, blinkCadence: { min: 2800, max: 5500 } },
  excited: { expressions: [2, 17, 21, 3, 11], expressionCadence: { min: 1100, max: 2000 }, blinkCadence: { min: 2000, max: 4000 } },
  surprised: { expressions: [3, 21], expressionCadence: { min: 2500, max: 4000 }, blinkCadence: { min: 1800, max: 3500 } },
  suspicious: { expressions: [14, 5, 23], expressionCadence: { min: 2600, max: 4500 }, blinkCadence: { min: 4500, max: 8000 } },
  angry: { expressions: [7, 16], expressionCadence: { min: 2200, max: 3800 }, blinkCadence: { min: 3500, max: 7000 } },
  drowsy: { expressions: [4, 22, 13], expressionCadence: { min: 4000, max: 8000 }, blinkCadence: null },
  happy: { expressions: [2, 11, 17, 19], expressionCadence: { min: 2500, max: 4500 }, blinkCadence: { min: 2500, max: 5000 } },
  curious: { expressions: [3, 21, 0, 15], expressionCadence: { min: 1800, max: 3200 }, blinkCadence: { min: 2500, max: 5500 } },
  confused: { expressions: [14, 5, 8], expressionCadence: { min: 2200, max: 3800 }, blinkCadence: { min: 2800, max: 5500 } },
  bored: { expressions: [4, 22, 0], expressionCadence: { min: 3500, max: 6000 }, blinkCadence: { min: 4000, max: 8000 } },
  proud: { expressions: [15, 8, 2], expressionCadence: { min: 3500, max: 6000 }, blinkCadence: { min: 3500, max: 7000 } },
  shy: { expressions: [0, 24, 13], expressionCadence: { min: 3000, max: 5500 }, blinkCadence: { min: 3000, max: 6000 } },
  sad: { expressions: [4, 13, 22], expressionCadence: { min: 4000, max: 7000 }, blinkCadence: { min: 4000, max: 8000 } },
  laughing: { expressions: [2, 11, 17], expressionCadence: { min: 1200, max: 2400 }, blinkCadence: { min: 2500, max: 5000 } },
  scared: { expressions: [3, 21], expressionCadence: { min: 900, max: 1800 }, blinkCadence: { min: 1200, max: 3000 } },
  playful: { expressions: [2, 17, 11, 8], expressionCadence: { min: 1500, max: 3000 }, blinkCadence: { min: 2000, max: 4500 } },
  celebrate: { expressions: [2, 8, 17], expressionCadence: { min: 1400, max: 2600 }, blinkCadence: { min: 2200, max: 4500 } },
  orbit: { expressions: [0, 8], expressionCadence: { min: 4000, max: 8000 }, blinkCadence: null },
  radar: { expressions: [0, 8], expressionCadence: { min: 4000, max: 8000 }, blinkCadence: null },
  progress: { expressions: [0, 8], expressionCadence: { min: 4000, max: 8000 }, blinkCadence: null },
  spawning: { expressions: [3, 0], expressionCadence: { min: 1200, max: 1200 }, blinkCadence: null },
  humming: { expressions: [0, 8], expressionCadence: { min: 5000, max: 9000 }, blinkCadence: { min: 4000, max: 8000 } },
  loading: { expressions: [0, 8], expressionCadence: { min: 6000, max: 10000 }, blinkCadence: null },
  dictating: { expressions: [10, 1, 19], expressionCadence: { min: 4000, max: 8000 }, blinkCadence: null },
  writing: { expressions: [15, 9], expressionCadence: { min: 4000, max: 8000 }, blinkCadence: null },
  sending: { expressions: [0, 8], expressionCadence: { min: 4000, max: 8000 }, blinkCadence: null },
  receiving: { expressions: [19, 0, 8], expressionCadence: { min: 4000, max: 8000 }, blinkCadence: null },
  uploading: { expressions: [15, 9, 8], expressionCadence: { min: 4000, max: 8000 }, blinkCadence: null },
  notifying: { expressions: [3, 21, 0], expressionCadence: { min: 1500, max: 2600 }, blinkCadence: { min: 2000, max: 4000 } },
  alerting: { expressions: [3, 21], expressionCadence: { min: 2000, max: 3600 }, blinkCadence: null },
  dragging: { expressions: [3, 15, 0], expressionCadence: { min: 1600, max: 3000 }, blinkCadence: { min: 2200, max: 4500 } },
  bouncing: { expressions: [2, 17], expressionCadence: { min: 3000, max: 6000 }, blinkCadence: null },
  poweringDown: { expressions: [13, 22], expressionCadence: { min: 6000, max: 9000 }, blinkCadence: null },
}
