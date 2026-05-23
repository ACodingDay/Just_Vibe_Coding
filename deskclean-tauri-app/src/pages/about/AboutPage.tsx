import AppBar from '@/components/AppBar';
import { useTranslation } from 'react-i18next';

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <>
      <AppBar title={t('page_about')} />
      <div
        className="flex-1 flex flex-col items-center justify-center text-center"
        style={{
          padding: 'clamp(16px, 4vmin, 48px)',
          gap: 'clamp(8px, 2vmin, 20px)',
        }}
      >
        <p
          className="font-medium"
          style={{ fontSize: '18px', color: 'var(--md-sys-color-on-surface)' }}
        >
          {t('app_name')}
        </p>
        <p
          style={{ fontSize: '13px', color: 'var(--md-sys-color-outline)' }}
        >
          {t('about_version')}
        </p>
        <p
          className="max-w-[300px] leading-relaxed"
          style={{
            fontSize: '14px',
            color: 'var(--md-sys-color-on-surface-variant)',
          }}
        >
          {t('about_desc')}
        </p>
      </div>
    </>
  );
}
