'use client';

import React from 'react';

interface GlowButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

const CONIC =
  'conic-gradient(from 150deg, #7A5CFF 0deg, #1CF2C7 20%, #46CFFF 40%, #7A5CFF 60%, transparent 80%, #7A5CFF 100%)';

export function GlowButton({ onClick, children, className }: GlowButtonProps) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Blur halo behind */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 12,
          background: CONIC,
          filter: 'blur(8px)',
          zIndex: -1,
        }}
      />
      {/* Gradient border wrapper — hue-rotate animation via .glow-btn-ring */}
      <div
        className="glow-btn-ring"
        style={{
          borderRadius: 12,
          padding: 2,
          background: CONIC,
          display: 'inline-flex',
        }}
      >
        <button
          onClick={onClick}
          className={className}
          style={{
            background: '#080810',
            borderRadius: 10,
            padding: '12px 24px',
            color: '#F6F8FF',
            fontFamily: 'var(--font-manrope, sans-serif)',
            fontWeight: 600,
            fontSize: 14,
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {children}
        </button>
      </div>
    </div>
  );
}
