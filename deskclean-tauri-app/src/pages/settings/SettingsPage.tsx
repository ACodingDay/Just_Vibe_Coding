import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  SlidersHorizontal,
  Palette,
} from 'lucide-react';
import SettingsRulePage from './SettingsRulePage';
import SettingsGeneralPage from './SettingsGeneralPage';
import SettingsThemePage from './SettingsThemePage';

type TabId = 'rule' | 'general' | 'theme';

const NAV_ITEMS: { id: TabId; icon: React.ElementType; labelKey: string }[] = [
  { id: 'rule', icon: Scale, labelKey: 'settings_rule' },
  { id: 'general', icon: SlidersHorizontal, labelKey: 'settings_general' },
  { id: 'theme', icon: Palette, labelKey: 'settings_theme' },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('rule');
  const [collapsed, setCollapsed] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'rule':
        return <SettingsRulePage />;
      case 'general':
        return <SettingsGeneralPage />;
      case 'theme':
        return <SettingsThemePage />;
    }
  };

  return (
    <>
      {/* App bar */}
      <header
        className="flex items-center h-14 px-2 shrink-0 border-b"
        style={{
          background: 'var(--md-sys-color-surface)',
          borderColor: 'var(--md-sys-color-outline-variant)',
        }}
      >
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? (
            <PanelLeftClose className="h-5 w-5" />
          ) : (
            <PanelLeftOpen className="h-5 w-5" />
          )}
        </Button>
        <h1
          className="flex-1 text-center font-medium mr-12"
          style={{
            fontSize: 'clamp(16px, 2.5vmin, 22px)',
            color: 'var(--md-sys-color-on-surface)',
          }}
        >
          {t('page_settings')}
        </h1>
      </header>

      {/* Sidebar + content layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="flex flex-col overflow-hidden transition-all duration-250 ease-in-out"
          style={{
            width: collapsed ? '56px' : '200px',
            minWidth: collapsed ? '56px' : '200px',
            background: 'var(--md-sys-color-surface-container-low)',
            borderRight: '1px solid var(--md-sys-color-outline-variant)',
          }}
        >
          <nav className="flex-1 py-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  className="flex items-center w-full gap-3 px-4 py-3 text-left transition-colors relative"
                  style={{
                    fontSize: 'clamp(13px, 2vmin, 15px)',
                    color: 'var(--md-sys-color-on-surface)',
                    background: isActive
                      ? 'var(--md-sys-color-secondary-container)'
                      : 'transparent',
                  }}
                  onClick={() => setActiveTab(item.id)}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
                      style={{
                        width: '3px',
                        height: '24px',
                        background: 'var(--md-sys-color-primary)',
                      }}
                    />
                  )}
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{t(item.labelKey)}</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ padding: '24px clamp(16px, 3vmin, 32px)' }}
        >
          {renderContent()}
        </main>
      </div>
    </>
  );
}
