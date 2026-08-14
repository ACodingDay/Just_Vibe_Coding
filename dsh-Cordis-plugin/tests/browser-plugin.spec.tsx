// @vitest-environment jsdom
/**
 * ui-grokbot browser half on a real cordis Context with fake slots/sessions/
 * conversation/locale faces: the plugin registers the GrokBotPet entry at
 * conversation.session.header.actions, the locale namespace registers, and
 * registration disposal rides the plugin fiber (HMR safety). The node half
 * and the invariant companion are exercised over the same Context.
 *
 * Self-contained by design: every @deepseek-ai face is stubbed here, so the
 * suite needs no resolution into the DSH checkout's sources (the plugin's own
 * dictionaries provide the copy the component asserts on).
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ConversationSnapshot, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { GrokBotPet, type GrokBotPetProps } from '../src/client/GrokBotPet.tsx'
import { zh as grokbotZh } from '../src/client/locales.ts'
import { currentPalette, setPalette } from '../src/client/theme.ts'
import { apply as nodeApply } from '../src/index.ts'

afterEach(() => {
  cleanup()
  // The palette store is module-level; reset it between specs.
  setPalette('classic')
})

const sid = (k: string): SessionId => k as SessionId

/** Translate stub over flat dictionaries, mirroring the framework `t` seat. */
function makeTranslate(...dicts: readonly Record<string, string>[]): (key: string) => string {
  return (key) => {
    for (const dict of dicts) {
      const hit = dict[key]
      if (hit !== undefined) return hit
    }
    return key
  }
}

/** Boot the plugin over fake faces; records slot registrations. */
function bench(colorScheme: 'light' | 'dark' = 'dark') {
  const ctx = new Context()
  const entries = new Map<string, { id?: string; order?: number; locale?: string }>()
  ctx.provide('slots', {
    register(reg: { name: string; id?: string; order?: number; locale?: string }) {
      entries.set(reg.name, reg)
      return () => { entries.delete(reg.name) }
    },
  } as never)
  ctx.provide('conversation', {} as never)
  ctx.provide('locale', { register: () => () => {} } as never)
  ctx.provide('sessions', {
    binding: () => undefined,
  } as never)
  ctx.provide('theme', {
    getTheme: () => ({ active: { colorScheme } }),
  } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  return { ctx, fiber, entry: () => entries.get('conversation.session.header.actions') }
}

describe('ui-grokbot browser plugin', () => {
  it('registers the grokbot header action with the documented id and order', async () => {
    const b = bench()
    await b.fiber.await()
    expect(b.entry()).toMatchObject({ id: 'grokbot', order: 30, locale: 'grokbot' })
  })

  it('disposal removes the registration (HMR safety)', async () => {
    const b = bench()
    await b.fiber.await()
    expect(b.entry()).toBeDefined()
    await b.fiber.dispose()
    expect(b.entry()).toBeUndefined()
  })

  it('registers the grokbot locale namespace', async () => {
    const b = bench()
    await b.fiber.await()
    // The plugin's apply registered the dictionary (fiber.await rejects on a
    // throwing apply); the zh dictionary owns every grokbot key.
    const t = makeTranslate(grokbotZh)
    expect(t('title')).toBe('GrokBot')
    expect(t('mood.celebrate')).toBe('完成啦')
    void b.fiber
  })

  it('follows the shell theme: dark scheme keeps classic, light switches to mono', async () => {
    const dark = bench('dark')
    await dark.fiber.await()
    expect(currentPalette()).toBe('classic')
    await dark.fiber.dispose()

    const light = bench('light')
    await light.fiber.await()
    expect(currentPalette()).toBe('mono')
    void light.fiber
  })

  it('node half apply is inert', () => {
    const ctx = new Context()
    expect(() => { nodeApply() }).not.toThrow()
    expect(ctx.registry.size).toBe(0)
  })
})

describe('GrokBotPet component', () => {
  /** A stub `useSession` that returns a fixed snapshot to its selector. */
  function propsWith(snapshot: Partial<ConversationSnapshot>) {
    const full = {
      running: false,
      runningCalls: [],
      partial: null,
      ...snapshot,
    } as ConversationSnapshot
    return {
      sessionId: sid('s-1'),
      useSession: vi.fn((select: (s: ConversationSnapshot) => unknown) => select(full)),
      useSessions: vi.fn(),
      useWorkspaces: vi.fn(),
      useProjection: vi.fn(),
      t: makeTranslate(grokbotZh),
    }
  }

  it('renders the canvas pet with a locale-aware label and the idle mood', () => {
    const { container } = render(<GrokBotPet {...(propsWith({}) as unknown as GrokBotPetProps)} />)
    const pet = container.querySelector('[data-grokbot-pet]')
    expect(pet).not.toBeNull()
    expect(pet?.getAttribute('aria-label')).toContain('GrokBot')
    expect(pet?.getAttribute('aria-label')).toContain('休息中')
    expect(pet?.getAttribute('data-mood')).toBe('idle')
    expect(container.querySelector('canvas')).not.toBeNull()
  })

  it('reflects a running tool call in the mood attribute', () => {
    const { container } = render(
      <GrokBotPet {...(propsWith({ running: true, runningCalls: [{ name: 'bash' } as never] }) as unknown as GrokBotPetProps)} />,
    )
    const pet = container.querySelector('[data-grokbot-pet]')
    expect(pet?.getAttribute('data-mood')).toBe('working')
  })

  it('reflects reasoning output in the mood attribute', () => {
    const snapshot = {
      running: true,
      runningCalls: [],
      partial: { blocks: [{ kind: 'reasoning' }] },
    }
    const { container } = render(
      <GrokBotPet {...(propsWith(snapshot as unknown as Partial<ConversationSnapshot>) as unknown as GrokBotPetProps)} />,
    )
    const pet = container.querySelector('[data-grokbot-pet]')
    expect(pet?.getAttribute('data-mood')).toBe('thinking')
  })

  it('arms the spin on click', () => {
    const { container } = render(<GrokBotPet {...(propsWith({}) as unknown as GrokBotPetProps)} />)
    const pet = container.querySelector('[data-grokbot-pet]') as HTMLElement
    expect(pet.getAttribute('data-spinning')).toBe('false')
    fireEvent.click(pet)
    expect(pet.getAttribute('data-spinning')).toBe('true')
  })
})
