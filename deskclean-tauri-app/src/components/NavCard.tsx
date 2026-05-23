import { useNavigate } from 'react-router-dom';

interface NavCardProps {
  iconSrc: string;
  label: string;
  to?: string;
  onClick?: () => void;
}

export default function NavCard({ iconSrc, label, to, onClick }: NavCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center cursor-pointer relative overflow-hidden outline-none transition-colors"
      style={{
        gap: 'clamp(6px, 1.2vmin, 12px)',
        padding: 'clamp(16px, 3vmin, 28px) clamp(8px, 1.5vmin, 16px)',
        borderRadius: 'clamp(8px, 1.2vmin, 16px)',
        background: 'var(--md-sys-color-surface-container-low)',
        border: '1px solid var(--md-sys-color-outline-variant)',
      }}
      tabIndex={0}
      role="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--md-sys-color-surface-variant)';
        e.currentTarget.style.borderColor = 'var(--md-sys-color-outline)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--md-sys-color-surface-container-low)';
        e.currentTarget.style.borderColor = 'var(--md-sys-color-outline-variant)';
      }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 'clamp(36px, 7vmin, 52px)',
          height: 'clamp(36px, 7vmin, 52px)',
          background: 'var(--md-sys-color-primary-container)',
        }}
      >
        <img
          className="object-contain"
          style={{
            width: 'clamp(22px, 4vmin, 30px)',
            height: 'clamp(22px, 4vmin, 30px)',
          }}
          src={iconSrc}
          alt={label}
        />
      </div>
      <span
        className="font-medium"
        style={{
          fontSize: 'clamp(12px, 1.8vmin, 15px)',
          color: 'var(--md-sys-color-on-surface)',
        }}
      >
        {label}
      </span>
    </div>
  );
}
