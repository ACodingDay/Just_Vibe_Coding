import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  isAutostartEnabled,
  enableAutostart,
  disableAutostart,
  getLanguage,
  setLanguage,
} from '@/services/ipc';

export default function SettingsGeneralPage() {
  const { t } = useTranslation();
  const [autostart, setAutostart] = useState(false);
  const [lang, setLang] = useState('zh-CN');
  const [langDialogOpen, setLangDialogOpen] = useState(false);

  // Load initial values
  useEffect(() => {
    isAutostartEnabled()
      .then(setAutostart)
      .catch(() => setAutostart(false));

    getLanguage()
      .then((l) => setLang(l || 'zh-CN'))
      .catch(() => setLang('zh-CN'));
  }, []);

  const handleAutostartChange = async (checked: boolean) => {
    try {
      if (checked) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
      setAutostart(checked);
    } catch (e) {
      console.error('Autostart toggle failed:', e);
    }
  };

  const handleLanguageChange = async (newLang: string) => {
    try {
      await setLanguage(newLang);
      setLang(newLang);
      setLangDialogOpen(true);
    } catch (e) {
      console.error('Language change failed:', e);
    }
  };

  return (
    <div className="w-full">
      <div
        className="flex flex-col"
        style={{
          marginTop: 'clamp(12px, 3vmin, 28px)',
          padding: 'clamp(12px, 2.5vmin, 28px)',
          borderRadius: 'clamp(6px, 1.2vmin, 14px)',
          background: 'var(--md-sys-color-surface-container-low)',
          border: '1px solid var(--md-sys-color-outline-variant)',
        }}
      >
        {/* Autostart */}
        <div className="flex items-center justify-between" style={{ gap: 'clamp(8px, 2vmin, 20px)' }}>
          <span
            className="font-medium"
            style={{
              fontSize: 'clamp(13px, 2vmin, 17px)',
              color: 'var(--md-sys-color-on-surface)',
            }}
          >
            {t('general_autostart')}
          </span>
          <Switch checked={autostart} onCheckedChange={handleAutostartChange} />
        </div>

        {/* Language */}
        <div
          className="flex items-center justify-between"
          style={{
            gap: 'clamp(8px, 2vmin, 20px)',
            marginTop: 'clamp(8px, 1.5vmin, 18px)',
            paddingTop: 'clamp(8px, 1.5vmin, 18px)',
            borderTop: '1px solid var(--md-sys-color-outline-variant)',
          }}
        >
          <span
            className="font-medium"
            style={{
              fontSize: 'clamp(13px, 2vmin, 17px)',
              color: 'var(--md-sys-color-on-surface)',
            }}
          >
            {t('general_language')}
          </span>
          <select
            className="rounded-md border px-3 py-1.5 text-sm outline-none"
            style={{
              minWidth: '140px',
              borderColor: 'var(--md-sys-color-outline-variant)',
              background: 'var(--md-sys-color-surface)',
              color: 'var(--md-sys-color-on-surface)',
            }}
            value={lang}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            <option value="zh-CN">简体中文</option>
          </select>
        </div>
      </div>

      {/* Language restart dialog */}
      <AlertDialog open={langDialogOpen} onOpenChange={setLangDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('general_language_restart_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('general_language_restart_msg')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setLangDialogOpen(false)}>
              {t('general_dialog_ok')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
