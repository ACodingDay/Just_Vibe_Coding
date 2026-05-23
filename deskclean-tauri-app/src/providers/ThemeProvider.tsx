import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadTheme, saveTheme } from '@/services/store';
import { THEME_PRESETS, type ThemePreset } from '@/data/themes';

interface ThemeContextValue {
  currentThemeId: string;
  setTheme: (id: string) => void;
  presets: ThemePreset[];
}

const ThemeContext = createContext<ThemeContextValue>({
  currentThemeId: 'tech-blue',
  setTheme: () => {},
  presets: THEME_PRESETS as ThemePreset[],
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyThemeTokens(themeId: string) {
  const preset = THEME_PRESETS.find((p) => p.id === themeId);
  if (!preset) return;
  const root = document.documentElement;
  root.setAttribute('data-theme', themeId);
  for (const [key, value] of Object.entries(preset.tokens)) {
    root.style.setProperty(key, value);
  }
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [currentThemeId, setCurrentThemeId] = useState('tech-blue');

  // 首次渲染后立即应用默认主题，再异步加载持久化主题
  useEffect(() => {
    applyThemeTokens(currentThemeId);
  }, [currentThemeId]);

  useEffect(() => {
    loadTheme().then((saved) => {
      if (saved && saved !== currentThemeId) {
        setCurrentThemeId(saved);
      }
    }).catch(() => {});
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const setTheme = (id: string) => {
    setCurrentThemeId(id);
    saveTheme(id);
  };

  return (
    <ThemeContext.Provider value={{ currentThemeId, setTheme, presets: THEME_PRESETS as ThemePreset[] }}>
      {children}
    </ThemeContext.Provider>
  );
}
