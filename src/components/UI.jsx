import { useState } from 'react';

// ─── Progress Bar ───
export function ProgressBar({ value, color = '#7c6df0', height = 6, showLabel = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div style={{ flex: 1, height, background: 'var(--track)', borderRadius: height, overflow: 'hidden' }}>
        <div
          style={{
            width: `${value}%`,
            height: '100%',
            background: color,
            borderRadius: height,
            transition: 'width 0.4s cubic-bezier(.4,0,.2,1)',
          }}
        />
      </div>
      {showLabel && (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', minWidth: 36, textAlign: 'right' }}>
          {value}%
        </span>
      )}
    </div>
  );
}

// ─── Badge ───
export function Badge({ children, color = '#7c6df0' }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: color + '18',
        color,
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </span>
  );
}

// ─── Button ───
export function Btn({ children, onClick, variant = 'primary', size = 'md', style: custom = {}, disabled = false }) {
  const base = {
    padding: size === 'sm' ? '5px 10px' : size === 'xs' ? '3px 7px' : '8px 16px',
    borderRadius: 6,
    fontWeight: 600,
    fontSize: size === 'sm' || size === 'xs' ? 12 : 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
  const variants = {
    primary: { background: '#7c6df0', color: '#fff' },
    secondary: { background: 'var(--hover)', color: 'var(--t1)', border: '1.5px solid var(--border)' },
    danger: { background: '#f06060', color: '#fff' },
    ghost: { background: 'transparent', color: 'var(--t2)' },
    success: { background: '#2dcc9f', color: '#0a1a14' },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...custom }}>
      {children}
    </button>
  );
}

// ─── Modal ───
export function Modal({ open, onClose, title, children, width = 520 }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 14,
          padding: 24,
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--t1)' }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--t2)', padding: 4 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Input ───
export function InputField({ label, value, onChange, placeholder, type = 'text', textarea = false }) {
  const shared = {
    value,
    onChange: (e) => onChange(e.target.value),
    placeholder,
    style: {
      width: '100%',
      padding: '8px 12px',
      borderRadius: 6,
      border: '1.5px solid var(--border)',
      background: 'var(--bg)',
      color: 'var(--t1)',
      fontSize: 13,
      fontFamily: 'inherit',
      outline: 'none',
      resize: textarea ? 'vertical' : 'none',
      minHeight: textarea ? 60 : 'auto',
      boxSizing: 'border-box',
    },
  };
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{label}</label>}
      {textarea ? <textarea {...shared} /> : <input type={type} {...shared} />}
    </div>
  );
}

// ─── Empty State ───
export function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--t2)' }}>
      <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--t1)' }}>{title}</div>
      <div style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>{description}</div>
      {action}
    </div>
  );
}

// ─── Tag Selector ───
export function TagSelector({ options, selected = [], onChange, label }) {
  function toggle(opt) {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  }
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{label}</label>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            style={{
              padding: '4px 10px',
              borderRadius: 5,
              fontSize: 12,
              fontWeight: 500,
              border: `1.5px solid ${selected.includes(opt) ? '#4a9eff' : 'var(--border)'}`,
              background: selected.includes(opt) ? '#4a9eff15' : 'transparent',
              color: selected.includes(opt) ? '#4a9eff' : 'var(--t2)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.12s',
            }}
          >
            {opt} {selected.includes(opt) && '✓'}
          </button>
        ))}
      </div>
    </div>
  );
}
