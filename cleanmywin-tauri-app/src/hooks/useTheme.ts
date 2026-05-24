import { useState, useEffect, useCallback } from 'react'
import { load } from '@tauri-apps/plugin-store'

export type ThemeId = 'ember-warm' | 'tech-blue' | 'fresh-green'
export type ModeId = 'light' | 'dark'

export interface ThemeInfo {
  id: ThemeId
  label: string
  lightColors: [string, string, string]
  darkColors: [string, string, string]
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'ember-warm',
    label: '余烬暖',
    lightColors: ['#FBF6EF', '#B8752F', '#F2EBE0'],
    darkColors: ['#1C1C1C', '#C8843B', '#242424'],
  },
  {
    id: 'tech-blue',
    label: '科技蓝',
    lightColors: ['#F5F6FA', '#3370FF', '#00D6B9'],
    darkColors: ['#0D1520', '#4D85FF', '#00E8C8'],
  },
  {
    id: 'fresh-green',
    label: '清新绿',
    lightColors: ['#F1ECE0', '#117C0D', '#FAC75E'],
    darkColors: ['#1C1A13', '#4EC966', '#F5C542'],
  },
]

const STORE_FILE = 'settings.json'
const KEY_THEME = 'theme'
const KEY_MODE = 'mode'

function applyToDOM(theme: ThemeId, mode: ModeId) {
  const el = document.documentElement
  el.setAttribute('data-theme', theme)
  el.setAttribute('data-mode', mode)
  if (mode === 'dark') {
    el.classList.add('dark')
  } else {
    el.classList.remove('dark')
  }
}

async function loadFromStore(): Promise<{ theme: ThemeId; mode: ModeId }> {
  let theme: ThemeId = 'tech-blue'
  let mode: ModeId = 'light'
  try {
    const store = await load(STORE_FILE)
    const savedTheme = await store.get<string>(KEY_THEME)
    const savedMode = await store.get<string>(KEY_MODE)
    if (savedTheme && THEMES.some((t) => t.id === savedTheme)) {
      theme = savedTheme as ThemeId
    }
    if (savedMode === 'light' || savedMode === 'dark') {
      mode = savedMode
    }
  } catch {
    // store not available (browser dev mode)
  }
  return { theme, mode }
}

async function saveToStore(theme: ThemeId, mode: ModeId) {
  try {
    const store = await load(STORE_FILE)
    await store.set(KEY_THEME, theme)
    await store.set(KEY_MODE, mode)
    await store.save()
  } catch {
    // ignore
  }
}

export function useTheme() {
  const [theme, setThemeRaw] = useState<ThemeId>('tech-blue')
  const [mode, setModeRaw] = useState<ModeId>('light')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadFromStore().then(({ theme: t, mode: m }) => {
      setThemeRaw(t)
      setModeRaw(m)
      applyToDOM(t, m)
      setReady(true)
    })
  }, [])

  const setTheme = useCallback(
    (id: ThemeId) => {
      setThemeRaw(id)
      applyToDOM(id, mode)
      saveToStore(id, mode)
    },
    [mode],
  )

  const setMode = useCallback(
    (m: ModeId) => {
      setModeRaw(m)
      applyToDOM(theme, m)
      saveToStore(theme, m)
    },
    [theme],
  )

  const toggleMode = useCallback(() => {
    setMode(mode === 'light' ? 'dark' : 'light')
  }, [mode, setMode])

  return { theme, mode, ready, setTheme, setMode, toggleMode, themes: THEMES }
}
