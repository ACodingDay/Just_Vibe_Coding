import { useTranslation } from 'react-i18next';
import { useTheme } from '@/providers/ThemeProvider';
import { Badge } from '@/components/ui/badge';

export default function SettingsThemePage() {
  const { t } = useTranslation();
  const { currentThemeId, setTheme, presets } = useTheme();

  return (
    <div className="w-full">
      <h3
        className="font-medium"
        style={{
          fontSize: 'clamp(18px, 2.5vmin, 24px)',
          color: 'var(--md-sys-color-on-surface)',
        }}
      >
        {t('theme_builtin')}
      </h3>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(100px, 20vmin, 160px), 1fr))',
          gap: 'clamp(8px, 1.5vmin, 16px)',
          marginTop: 'clamp(12px, 2.5vmin, 24px)',
        }}
      >
        {presets.map((preset) => {
          const primary = preset.tokens['--md-sys-color-primary'];
          const containerColor = preset.tokens['--md-sys-color-primary-container'];
          const isActive = preset.id === currentThemeId;
          const isHex = preset.source.startsWith('#');

          return (
            <div
              key={preset.id}
              className="flex flex-col cursor-pointer outline-none transition-colors"
              style={{
                gap: 'clamp(6px, 1.2vmin, 12px)',
                padding: 'clamp(8px, 1.5vmin, 14px)',
                borderRadius: 'clamp(6px, 1.2vmin, 14px)',
                background: isActive
                  ? 'var(--md-sys-color-primary-container)'
                  : 'var(--md-sys-color-surface-container-low)',
                border: `2px solid ${isActive ? 'var(--md-sys-color-primary)' : 'transparent'}`,
              }}
              tabIndex={0}
              role="button"
              onClick={() => setTheme(preset.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setTheme(preset.id);
                }
              }}
            >
              {/* Swatch */}
              <div
                className="flex overflow-hidden"
                style={{
                  borderRadius: 'clamp(4px, 0.8vmin, 8px)',
                  height: 'clamp(32px, 6vmin, 52px)',
                }}
              >
                <div className="flex-1" style={{ background: primary }} />
                <div className="flex-1" style={{ background: containerColor }} />
              </div>

              {/* Meta */}
              <div className="flex flex-col" style={{ gap: '2px' }}>
                <span
                  className="font-medium"
                  style={{
                    fontSize: 'clamp(12px, 1.8vmin, 15px)',
                    color: 'var(--md-sys-color-on-surface)',
                  }}
                >
                  {preset.name}
                </span>
                {isHex ? (
                  <Badge
                    variant="outline"
                    className="font-mono"
                    style={{ fontSize: 'clamp(10px, 1.4vmin, 12px)' }}
                  >
                    {preset.source}
                  </Badge>
                ) : (
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 'clamp(10px, 1.4vmin, 12px)',
                      color: 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    {preset.source}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
