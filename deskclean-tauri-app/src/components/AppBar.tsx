import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AppBarProps {
  title: string;
}

export default function AppBar({ title }: AppBarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <header className="flex items-center h-14 px-2 shrink-0 border-b"
      style={{
        background: 'var(--md-sys-color-surface)',
        borderColor: 'var(--md-sys-color-outline-variant)',
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate(-1)}
        aria-label={t('settings_back')}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <h1
        className="flex-1 text-center font-medium mr-12"
        style={{
          fontSize: 'clamp(16px, 2.5vmin, 22px)',
          color: 'var(--md-sys-color-on-surface)',
        }}
      >
        {title}
      </h1>
    </header>
  );
}
