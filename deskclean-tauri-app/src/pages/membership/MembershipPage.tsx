import { useEffect } from 'react';
import AppBar from '@/components/AppBar';
import { useConfetti } from '@/hooks/useConfetti';
import { useTranslation } from 'react-i18next';

export default function MembershipPage() {
  const { t } = useTranslation();
  const { start, stop } = useConfetti(1500);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  return (
    <>
      <AppBar title={t('page_membership')} />
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
          {t('page_membership')}
        </p>
        <p
          className="max-w-[300px] leading-relaxed line-through"
          style={{
            fontSize: '14px',
            color: 'var(--md-sys-color-on-surface-variant)',
            textDecorationColor: 'var(--md-sys-color-outline)',
          }}
        >
          {t('membership_coming')}
        </p>
        <p
          className="font-medium leading-relaxed"
          style={{ fontSize: '15px', color: 'var(--md-sys-color-primary)' }}
        >
          {t('membership_already')}
        </p>
      </div>
    </>
  );
}
