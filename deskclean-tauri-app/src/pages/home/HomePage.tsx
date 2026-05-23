import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isScanReady } from '@/services/ipc';
import NavCard from '@/components/NavCard';

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);

  const navigateToOrganize = useCallback(async () => {
    let ready = false;
    try {
      ready = await isScanReady();
    } catch {
      navigate('/organize');
      return;
    }

    if (ready) {
      navigate('/organize');
      return;
    }

    // Scan not yet complete — show loading overlay and poll
    setScanning(true);
    const maxWait = 15000;
    const pollStart = Date.now();

    const poll = setInterval(async () => {
      let r = false;
      try {
        r = await isScanReady();
      } catch { /* ignore */ }

      if (r || Date.now() - pollStart >= maxWait) {
        clearInterval(poll);
        setScanning(false);
        navigate('/organize');
      }
    }, 300);
  }, [navigate]);

  const cards = [
    { iconSrc: 'icons/clean.svg', label: t('nav_clean'), onClick: navigateToOrganize },
    { iconSrc: 'icons/settings.svg', label: t('nav_settings'), to: '/settings' },
    { iconSrc: 'icons/membership.svg', label: t('nav_membership'), to: '/membership' },
    { iconSrc: 'icons/about.svg', label: t('nav_about'), to: '/about' },
  ];

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center relative"
      style={{
        padding: 'clamp(16px, 4vmin, 48px)',
        gap: 'clamp(8px, 2vmin, 20px)',
      }}
    >
      <h1
        className="font-medium"
        style={{
          fontSize: 'clamp(22px, 4vmin, 32px)',
          color: 'var(--md-sys-color-on-surface)',
        }}
      >
        {t('app_name')}
      </h1>
      <p style={{
        fontSize: 'clamp(12px, 2vmin, 16px)',
        color: 'var(--md-sys-color-on-surface-variant)',
      }}>
        {t('app_slogan')}
      </p>
      <div
        className="grid grid-cols-2 w-full"
        style={{
          gap: 'clamp(12px, 2.5vmin, 20px)',
          marginTop: 'clamp(8px, 2vmin, 16px)',
          maxWidth: 'clamp(320px, 40vmin, 500px)',
        }}
      >
        {cards.map((card) => (
          <NavCard key={card.label} {...card} />
        ))}
      </div>

      {/* Scanning overlay */}
      {scanning && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{
            background: 'var(--md-sys-color-surface)',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          <div className="flex flex-col items-center" style={{ gap: '20px' }}>
            <div
              className="rounded-full"
              style={{
                width: '48px',
                height: '48px',
                border: '4px solid var(--md-sys-color-outline-variant)',
                borderTopColor: 'var(--md-sys-color-primary)',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p
              className="font-medium"
              style={{
                fontSize: 'clamp(14px, 2vmin, 18px)',
                color: 'var(--md-sys-color-on-surface-variant)',
              }}
            >
              {t('organize_scanning')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
