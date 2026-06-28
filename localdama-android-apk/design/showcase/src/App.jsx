import { useState, useEffect } from 'react'

/* ── SVG Icons (monoline, currentColor) ─────────────────────────── */

const Icons = {
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  ),
  badge: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C9.24 2 7 4.24 7 7s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 14c-3.31 0-10 1.67-10 5v2h20v-2c0-3.33-6.69-5-10-5z"/></svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3-9H9V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2z"/></svg>
  ),
  science: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v2h1v7.15l-4.65 7.19C2.55 19.54 3.41 22 5.35 22h13.3c1.94 0 2.8-2.46 1.35-3.66L15 11.15V4h1V2H7zm6 2v7.85l4.65 6.19c.25.27.07.96-.3.96H6.65c-.37 0-.55-.69-.3-.96L11 11.85V4h2z"/></svg>
  ),
  construction: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.78 15.3l3.02 3.02c.82-.39 1.74-.62 2.7-.62.73 0 1.43.13 2.09.36L13 22.66V15.3h.78zm-7.56-.56l1.41-1.41L12 17.71l1.41-1.41-4.38-4.38 1.41-1.41 4.38 4.38L16.24 13.47l-6.36-6.36-2.12 2.12 1.41 1.41-3.54 3.54-1.41-1.41L2.1 14.9l3.54 3.54 1.41-1.41-.83-.83 3.54-3.54.83.83z"/></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
  ),
  darkMode: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.37 5.51c-.18.64-.27 1.31-.27 1.99 0 4.08 3.32 7.4 7.4 7.4.68 0 1.35-.09 1.99-.27C17.45 17.19 14.93 19 12 19c-3.86 0-7-3.14-7-7 0-2.93 1.81-5.45 4.37-6.49zM12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4C12.92 3.04 12.46 3 12 3z"/></svg>
  ),
  palette: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
  ),
  language: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg>
  ),
  fullscreen: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
  ),
  blur: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v18c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 16V5c3.86 0 7 3.14 7 7s-3.14 7-7 7zm0-12v8c2.21 0 4-1.79 4-4s-1.79-4-4-4z" opacity=".3"/><path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9zm0 16c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7z"/></svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
  ),
  description: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8v-2zm0-3h8v2H8v-2z"/></svg>
  ),
  save: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
  ),
  arrowBack: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
  ),
  signal: (
    <svg viewBox="0 0 24 24"><rect x="1" y="16" width="3" height="4" rx="0.5" fill="currentColor"/><rect x="6" y="12" width="3" height="8" rx="0.5" fill="currentColor"/><rect x="11" y="8" width="3" height="12" rx="0.5" fill="currentColor"/><rect x="16" y="4" width="3" height="16" rx="0.5" fill="currentColor"/></svg>
  ),
  wifi: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
  ),
  battery: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>
  ),
  cardId: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 6h16v4H4V6zm0 12v-4h16v4H4z"/></svg>
  ),
}

/* ── Theme Definitions ──────────────────────────────────────────── */

const themes = [
  { id: 'mono', name: '经典黑白', dot: '#27272A' },
  { id: 'tech-blue', name: '科技蓝', dot: '#2563EB' },
  { id: 'fresh-green', name: '清新绿', dot: '#16A34A' },
]

/* ── StatusBar Component ────────────────────────────────────────── */

function StatusBar() {
  return (
    <div className="phone-status-bar">
      <span className="time">9:41</span>
      <div className="phone-status-icons">
        {Icons.signal}
        {Icons.wifi}
        {Icons.battery}
      </div>
    </div>
  )
}

/* ── HomeScreen Mock ────────────────────────────────────────────── */

function MockHome() {
  const cards = [
    { icon: Icons.badge, title: '证件打码', sub: '身份证自动识别', accent: 'accent-1' },
    { icon: Icons.lock, title: '隐私打码', sub: '敏感信息保护', accent: 'accent-2' },
    { icon: Icons.science, title: 'OCR 测试', sub: '识别效果验证', accent: 'accent-3' },
    { icon: Icons.construction, title: '更多功能', sub: '敬请期待', accent: 'accent-4', disabled: true },
  ]

  return (
    <>
      <div className="mock-topbar">
        <span className="mock-topbar-title">隐私打码</span>
        <span className="mock-topbar-spacer" />
        <div className="mock-icon-btn">{Icons.settings}</div>
      </div>
      <div className="mock-home">
        <div className="mock-hero">
          <div className="mock-hero-title">LocalDama</div>
          <div className="mock-hero-sub">本地隐私打码，数据不出设备</div>
        </div>
        <div className="mock-card-grid">
          {cards.map((c, i) => (
            <div className={`mock-feature-card${c.disabled ? ' disabled' : ''}`} key={i}>
              <div className={`mock-card-icon ${c.accent}`}>{c.icon}</div>
              <div style={{ flex: 1 }} />
              <div className="mock-card-title">{c.title}</div>
              <div className="mock-card-sub">{c.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/* ── SettingsScreen Mock ────────────────────────────────────────── */

function MockSettings() {
  return (
    <>
      <div className="mock-topbar">
        <div className="mock-icon-btn">{Icons.arrowBack}</div>
        <span className="mock-topbar-title">设置</span>
      </div>
      <div className="mock-settings">
        <div className="mock-section-header">外观</div>
        <div className="mock-settings-card">
          <div className="mock-settings-row">
            <div className="mock-settings-icon">{Icons.darkMode}</div>
            <div className="mock-settings-text">
              <div className="label">主题模式</div>
              <div className="desc">跟随系统</div>
            </div>
          </div>
          <div className="mock-settings-row">
            <div className="mock-settings-icon">{Icons.palette}</div>
            <div className="mock-settings-text">
              <div className="label">主题配色</div>
              <div className="desc">选择应用配色方案</div>
            </div>
          </div>
          <div className="mock-settings-row">
            <div className="mock-settings-icon">{Icons.fullscreen}</div>
            <div className="mock-settings-text">
              <div className="label">全屏模式</div>
              <div className="desc">隐藏状态栏</div>
            </div>
            <div className="mock-switch"><div className="knob" /></div>
          </div>
        </div>

        <div className="mock-section-header">打码</div>
        <div className="mock-settings-card">
          <div className="mock-slider-row">
            <div className="mock-slider-header">
              <div className="mock-slider-label">
                <div className="mock-settings-icon" style={{ width: 24, height: 24 }}>{Icons.blur}</div>
                <span>打码强度</span>
              </div>
              <div className="mock-slider-badge">适中</div>
            </div>
            <div className="mock-slider-track">
              <div className="mock-slider-fill" />
              <div className="mock-slider-thumb" />
            </div>
          </div>
        </div>

        <div className="mock-section-header">关于</div>
        <div className="mock-settings-card">
          <div className="mock-settings-row">
            <div className="mock-settings-icon">{Icons.info}</div>
            <div className="mock-settings-text">
              <div className="label">版本</div>
              <div className="desc">1.2.0</div>
            </div>
          </div>
          <div className="mock-settings-row">
            <div className="mock-settings-icon">{Icons.description}</div>
            <div className="mock-settings-text">
              <div className="label">开源许可</div>
              <div className="desc">Apache 2.0</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── ResultScreen Mock ──────────────────────────────────────────── */

function MockResult() {
  return (
    <>
      <div className="mock-topbar">
        <div className="mock-icon-btn">{Icons.arrowBack}</div>
        <span className="mock-topbar-title">打码结果</span>
      </div>
      <div className="mock-result">
        <div className="mock-result-image">
          <div className="placeholder-id">
            {Icons.cardId}
            <span>身份证预览区域</span>
          </div>
          <div className="mock-result-mask" style={{ width: 80, height: 14, top: '38%', left: '22%' }} />
          <div className="mock-result-mask" style={{ width: 60, height: 14, top: '48%', left: '32%' }} />
          <div className="mock-result-mask" style={{ width: 100, height: 14, top: '58%', left: '15%' }} />
        </div>
        <div className="mock-result-bottom">
          <div className="mock-segmented">
            <div className="mock-segment active">纯白填充</div>
            <div className="mock-segment">高斯模糊</div>
            <div className="mock-segment">像素马赛克</div>
          </div>
          <div className="mock-action-row">
            <div className="mock-save-btn">
              {Icons.save}
              保存到相册
            </div>
            <div className="mock-share-btn">{Icons.share}</div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Phone Frame ────────────────────────────────────────────────── */

function PhoneFrame({ label, children }) {
  return (
    <div className="phone-wrapper" data-component={`phone-${label.toLowerCase()}`}>
      <div className="phone-frame">
        <div className="phone-notch" />
        <StatusBar />
        <div className="phone-content">{children}</div>
      </div>
      <span className="phone-label">{label}</span>
    </div>
  )
}

/* ── Palette Section ────────────────────────────────────────────── */

function PaletteSection() {
  const groups = [
    {
      title: 'Surface & Background',
      swatches: [
        { name: 'Background', token: '--bg', color: 'var(--bg)' },
        { name: 'Surface', token: '--surface', color: 'var(--surface)' },
        { name: 'Surface Variant', token: '--surface-variant', color: 'var(--surface-variant)' },
        { name: 'Container', token: '--surface-container', color: 'var(--surface-container)' },
      ]
    },
    {
      title: 'Text & Foreground',
      swatches: [
        { name: 'Primary', token: '--fg', color: 'var(--fg)' },
        { name: 'Secondary', token: '--fg-secondary', color: 'var(--fg-secondary)' },
        { name: 'Tertiary', token: '--fg-tertiary', color: 'var(--fg-tertiary)' },
        { name: 'Disabled', token: '--fg-disabled', color: 'var(--fg-disabled)' },
      ]
    },
    {
      title: 'Primary & Accent',
      swatches: [
        { name: 'Primary', token: '--primary', color: 'var(--primary)' },
        { name: 'Primary Container', token: '--primary-container', color: 'var(--primary-container)' },
        { name: 'Accent', token: '--accent', color: 'var(--accent)' },
        { name: 'Accent Container', token: '--accent-container', color: 'var(--accent-container)' },
      ]
    },
    {
      title: 'Semantic',
      swatches: [
        { name: 'Success', token: '--success', color: 'var(--success)' },
        { name: 'Warning', token: '--warning', color: 'var(--warning)' },
        { name: 'Error', token: '--error', color: 'var(--error)' },
        { name: 'Info', token: '--info', color: 'var(--info)' },
      ]
    },
  ]

  return (
    <div className="section">
      <div className="section-label">Design Tokens</div>
      <div className="section-title">Color System</div>
      <div className="section-desc">
        All colors are defined as CSS custom properties and adapt automatically to the selected theme and mode.
      </div>
      <div className="palette-grid">
        {groups.map((g, i) => (
          <div className="palette-group" key={i}>
            <div className="palette-group-title">{g.title}</div>
            <div className="palette-swatch-row">
              {g.swatches.map((s, j) => (
                <div className="palette-swatch" key={j}>
                  <div className="swatch-circle" style={{ background: s.color }} />
                  <div className="swatch-info">
                    <div className="swatch-name">{s.name}</div>
                    <div className="swatch-token">{s.token}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Feature Accent Preview ─────────────────────────────────────── */

function AccentPreview() {
  const accents = [
    { label: 'ID Card', color: 'var(--accent-1)', bg: 'var(--accent-1-container)' },
    { label: 'Privacy Lock', color: 'var(--accent-2)', bg: 'var(--accent-2-container)' },
    { label: 'OCR Test', color: 'var(--accent-3)', bg: 'var(--accent-3-container)' },
    { label: 'Coming Soon', color: 'var(--accent-4)', bg: 'var(--accent-4-container)' },
  ]

  return (
    <div className="section">
      <div className="section-label">Feature Cards</div>
      <div className="section-title">Per-Card Accent Colors</div>
      <div className="section-desc">
        Each feature card has its own accent color for visual differentiation, adapting to light and dark modes.
      </div>
      <div className="accents-row">
        {accents.map((a, i) => (
          <div className="accent-chip" key={i}>
            <div className="accent-chip-dot" style={{ background: a.color }} />
            <span className="accent-chip-label">{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Typography Section ─────────────────────────────────────────── */

function TypeSection() {
  const rows = [
    { label: 'Display', spec: '56px / 600 / -0.28px', cls: 'type-display', sample: '隐私打码' },
    { label: 'Headline', spec: '40px / 600 / normal', cls: 'type-headline', sample: '数据安全，本地处理' },
    { label: 'Title', spec: '28px / 600 / 0.196px', cls: 'type-title', sample: '证件打码' },
    { label: 'Body', spec: '17px / 400 / 1.47', cls: 'type-body', sample: '所有图片在本地处理，不上传任何数据到云端服务器。' },
    { label: 'Label', spec: '14px / 500 / -0.224px', cls: 'type-label', sample: '保存到相册' },
    { label: 'Caption', spec: '12px / 400 / -0.12px', cls: 'type-caption', sample: 'VERSION 1.2.0' },
  ]

  return (
    <div className="section">
      <div className="section-label">Type System</div>
      <div className="section-title">Typography Scale</div>
      <div className="section-desc">
        Apple-inspired type scale with dramatic size range, tight tracking, and compact line heights.
      </div>
      <div className="type-scale">
        {rows.map((r, i) => (
          <div className="type-row" key={i}>
            <div className="type-meta">
              <div className="type-meta-label">{r.label}</div>
              <div className="type-meta-spec">{r.spec}</div>
            </div>
            <div className={`type-sample ${r.cls}`}>{r.sample}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main App ───────────────────────────────────────────────────── */

export default function App() {
  const [theme, setTheme] = useState('mono')
  const [mode, setMode] = useState('light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.setAttribute('data-mode', mode)
  }, [theme, mode])

  return (
    <main className="showcase" data-component="theme-showcase">
      {/* Header */}
      <header className="showcase-header" data-component="showcase-header">
        <h1 className="showcase-title">LocalDama Theme System</h1>
        <p className="showcase-subtitle">
          Multi-theme design system with Apple-inspired chapter rhythm.
          Three color presets with full light and dark mode support.
        </p>
      </header>

      {/* Controls */}
      <nav className="controls-bar" data-component="theme-controls">
        <div className="theme-switcher">
          {themes.map(t => (
            <button
              key={t.id}
              className={`theme-btn${theme === t.id ? ' active' : ''}`}
              onClick={() => setTheme(t.id)}
            >
              <span className="theme-dot" style={{ background: t.dot }} />
              {t.name}
            </button>
          ))}
        </div>
        <div className="mode-toggle">
          <button
            className={`mode-btn${mode === 'light' ? ' active' : ''}`}
            onClick={() => setMode('light')}
            title="Light"
          >
            {Icons.sun}
          </button>
          <button
            className={`mode-btn${mode === 'dark' ? ' active' : ''}`}
            onClick={() => setMode('dark')}
            title="Dark"
          >
            {Icons.moon}
          </button>
        </div>
      </nav>
      <div className="section">
        <div className="section-label">Screen Preview</div>
        <div className="section-title">App Screens</div>
        <div className="section-desc">
          High-fidelity mockups of the three core screens in premium device frames.
        </div>
        <div className="phones-row">
          <PhoneFrame label="Home">
            <MockHome />
          </PhoneFrame>
          <PhoneFrame label="Settings">
            <MockSettings />
          </PhoneFrame>
          <PhoneFrame label="Result">
            <MockResult />
          </PhoneFrame>
        </div>
      </div>

      {/* Color Palette */}
      <PaletteSection />

      {/* Feature Accents */}
      <AccentPreview />

      {/* Typography */}
      <TypeSection />
    </main>
  )
}
