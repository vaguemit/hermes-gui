import React, { useEffect, useState } from 'react';

interface Props {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 400);
    const t2 = setTimeout(() => setPhase('out'), 1400);
    const t3 = setTimeout(onDone, 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg0)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16,
      opacity: phase === 'out' ? 0 : 1,
      transition: phase === 'out' ? 'opacity 0.4s ease-out' : 'opacity 0.3s ease-in',
    }}>
      <div style={{
        transform: phase === 'in' ? 'scale(0.85)' : 'scale(1)',
        transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <img
          src="/logo.png"
          alt="Hermes"
          style={{ width: 72, height: 72, borderRadius: 20, objectFit: 'cover' }}
        />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Hermes</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>Desktop Agent</div>
        </div>
      </div>
      <div style={{
        width: 120, height: 2, background: 'var(--bg3)', borderRadius: 1, overflow: 'hidden', marginTop: 8,
      }}>
        <div style={{
          height: '100%',
          background: 'var(--accent-green)',
          borderRadius: 1,
          width: phase === 'in' ? '0%' : '100%',
          transition: 'width 1.0s ease-in-out',
        }} />
      </div>
    </div>
  );
}
