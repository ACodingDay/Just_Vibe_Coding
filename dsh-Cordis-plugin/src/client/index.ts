/**
 * GrokBot pet plugin, browser half: registers the resident GrokBotPet into
 * the session-header actions slot, always visible, animated from the live
 * conversation snapshot (see GrokBotPet.tsx).
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the header.actions entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the ui-theme Context merge (ctx.theme) and the theme/change event.
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { GrokBotPet } from './GrokBotPet.tsx'
import { en, zh, type GrokbotKey } from './locales.ts'
import { paletteOf, setPalette } from './theme.ts'

export type { GrokBotPetProps } from './GrokBotPet.tsx'
export type { GrokbotKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The GrokBot pet's copy. */
    grokbot: GrokbotKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'grokbot'

/**
 * Required services (cordis fiber inject). 'conversation' is an ordering
 * edge, not a call dependency: 'conversation.session.header.actions' is
 * declared by ui-conversation's apply, and register() into an undeclared
 * slot throws — service waiting orders this apply after the declaring one.
 * 'theme' orders this apply after the shell theme service exists.
 */
export const inject = ['slots', 'conversation', 'locale', 'theme']

/**
 * Client plugin body: register the `grokbot` dictionaries and the resident
 * header pet.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-grokbot: dictionaries')

  // Follow the shell theme: the dark GUI scheme keeps the classic blue/cream
  // look, the light scheme switches to a black & white palette.
  const syncPalette = (): void => {
    setPalette(paletteOf(ctx.theme.getTheme().active.colorScheme))
  }
  syncPalette()
  ctx.on('theme/change', syncPalette)

  // Conditional mount: the header actions slot is declared by the
  // conversation entry; waiting on the conversation service is the
  // registration-safe signal.
  ctx.inject(['slots', 'conversation', 'sessions'], (scope: ClientContext) => {
    scope.effect(
      () => scope.slots.register(
        { name: 'conversation.session.header.actions', id: 'grokbot', order: 30, locale: NS },
        GrokBotPet,
      ),
      'ui-grokbot: header pet',
    )
  })
}
