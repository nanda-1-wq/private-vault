'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { DemoBanner } from '@/components/DemoBanner';
import { Shield, Zap, EyeOff, ArrowRight } from 'lucide-react';

// Katakana + crypto symbols for matrix rain
const MATRIX_CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン₿ΞØ∞⊕';

const FEATURES = [
  {
    icon: <Zap className="h-5 w-5 text-cyan-400 shrink-0" />,
    title: 'Bridgeless Custody via Ika MPC',
    desc: 'Deposit BTC from any chain without trusted bridges or wrapped tokens. Your dWallet is jointly controlled by MPC — no single party holds your keys.',
  },
  {
    icon: <Shield className="h-5 w-5 text-cyan-400 shrink-0" />,
    title: 'Encrypted Positions via FHE',
    desc: 'Collateral amounts and debt are stored as EUint64 ciphertexts on Solana. FHE graphs compute LTV and health checks entirely on encrypted data.',
  },
  {
    icon: <EyeOff className="h-5 w-5 text-cyan-400 shrink-0" />,
    title: 'Zero Front-Running',
    desc: 'Only the health boolean is ever decrypted. Liquidators cannot see position sizes, eliminating front-running and predatory liquidation strategies.',
  },
];

const STATS = [
  { label: 'Max LTV', value: '70%' },
  { label: 'Liquidation Threshold', value: '80%' },
  { label: 'BTC Price (demo)', value: '$90,000' },
  { label: 'Network', value: 'Devnet' },
];

export default function HomePage() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (connected) router.push('/dashboard');
  }, [connected, router]);

  // Matrix rain animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fontSize = 13;
    let cols: number;
    let drops: number[];

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cols = Math.floor(canvas.width / fontSize);
      drops = Array.from({ length: cols }, () => Math.random() * -80);
    };

    init();
    const onResize = () => init();
    window.addEventListener('resize', onResize);

    const draw = () => {
      // Fade trail — matches background #05080f
      ctx.fillStyle = 'rgba(5, 8, 15, 0.055)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
        // Leading char brighter, trail dims naturally via fade
        const y = drops[i] * fontSize;
        ctx.fillStyle = 'rgba(6, 182, 212, 0.55)';
        ctx.fillText(char, i * fontSize, y);
        // Randomly reset column after it exits bottom
        if (y > canvas.height && Math.random() > 0.977) {
          drops[i] = 0;
        }
        drops[i] += 0.28; // slow, cinematic fall
      }
    };

    // ~18 fps — subtle, not distracting
    const interval = setInterval(draw, 55);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div
      className="relative flex flex-col min-h-screen overflow-hidden"
      style={{ background: '#05080f' }}
    >
      {/* Matrix rain */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none select-none"
        style={{ zIndex: 0, opacity: 0.75 }}
      />

      {/* Central hero glow orb */}
      <div
        aria-hidden
        className="absolute pointer-events-none select-none"
        style={{
          top: '35%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 900,
          height: 560,
          background:
            'radial-gradient(ellipse at center, rgba(6,182,212,0.08) 0%, rgba(59,130,246,0.04) 35%, transparent 65%)',
          zIndex: 1,
        }}
      />

      {/* Demo banner */}
      <div className="relative z-20">
        <DemoBanner />
      </div>

      {/* Landing-only header (no NavBar on this page) */}
      <header
        className="relative z-10 flex items-center justify-between px-8 py-5"
        style={{ borderBottom: '1px solid rgba(6,182,212,0.1)' }}
      >
        <div className="flex items-center gap-3">
          <Image
            src="/encrypt_logo.svg"
            alt="PrivateVault"
            width={26}
            height={26}
            style={{
              filter:
                'brightness(0) saturate(100%) invert(67%) sepia(98%) saturate(400%) hue-rotate(150deg) brightness(100%)',
            }}
          />
          <span className="font-bold text-base tracking-tight text-cyan-400">
            PrivateVault
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className="text-[10px] font-mono tracking-[0.18em] uppercase px-2.5 py-1 rounded-sm"
            style={{
              color: 'rgba(251,146,60,0.75)',
              border: '1px solid rgba(251,146,60,0.22)',
            }}
          >
            Pre-Alpha
          </span>
          <span
            className="text-[10px] font-mono tracking-[0.18em] uppercase px-2.5 py-1 rounded-sm"
            style={{
              color: 'rgba(96,165,250,0.75)',
              border: '1px solid rgba(96,165,250,0.2)',
            }}
          >
            Devnet
          </span>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="space-y-7 max-w-4xl w-full">

          {/* Eyebrow line */}
          <div className="flex items-center justify-center gap-3">
            <span
              className="h-px w-16"
              style={{
                background: 'linear-gradient(to right, transparent, rgba(6,182,212,0.5))',
              }}
            />
            <span
              className="text-[11px] font-mono tracking-[0.28em] uppercase"
              style={{ color: 'rgba(6,182,212,0.65)' }}
            >
              Powered by FHE
            </span>
            <span
              className="h-px w-16"
              style={{
                background: 'linear-gradient(to left, transparent, rgba(6,182,212,0.5))',
              }}
            />
          </div>

          {/* Headline */}
          <h1 className="font-black tracking-tight leading-none" style={{ fontSize: 'clamp(3rem, 8vw, 5.5rem)' }}>
            <span className="block text-white">Private Cross-Chain</span>
            <span
              className="block mt-2"
              style={{
                background: 'linear-gradient(125deg, #06b6d4 0%, #3b82f6 55%, #818cf8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Lending
            </span>
          </h1>

          {/* Sub-headline */}
          <p
            className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-light"
            style={{ color: 'rgba(156,163,175,1)' }}
          >
            Deposit BTC from any chain. Borrow USDC on Solana.{' '}
            <span style={{ color: 'rgba(209,213,219,0.85)' }}>
              All position data encrypted by FHE — only the liquidation boolean is ever revealed.
            </span>
          </p>

          {/* CTA row */}
          <div className="flex items-center justify-center gap-4 pt-2 flex-wrap">
            {/* Primary — pulsing cyan glow */}
            <button
              onClick={() => setVisible(true)}
              className="cta-primary inline-flex items-center gap-2.5 px-8 py-3.5 text-sm font-bold text-white"
            >
              Connect Phantom
              <ArrowRight className="h-4 w-4" />
            </button>

            {/* Secondary — transparent white border, no glow */}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-semibold rounded-lg transition-colors duration-200"
              style={{
                color: 'rgba(209,213,219,0.85)',
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'transparent',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = '#fff';
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.38)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(209,213,219,0.85)';
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.18)';
              }}
            >
              View Demo
            </Link>
          </div>

          <p className="text-[11px] font-mono" style={{ color: 'rgba(75,85,99,1)' }}>
            Bitcoin signet · Solana devnet · No real funds at risk
          </p>
        </div>

        {/* ── Feature cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl w-full mt-28 text-left">
          {FEATURES.map((f, i) => (
            <div key={i} className="feature-card-accent p-6 space-y-3">
              <div className="flex items-start gap-2.5">
                {f.icon}
                <h3 className="text-sm font-semibold leading-snug" style={{ color: 'rgba(243,244,246,0.9)' }}>
                  {f.title}
                </h3>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(107,114,128,1)' }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>

        {/* ── Stats strip ── */}
        <div
          className="flex items-center gap-10 sm:gap-16 mt-16 pt-10 w-full max-w-4xl justify-center flex-wrap"
          style={{ borderTop: '1px solid rgba(6,182,212,0.1)' }}
        >
          {STATS.map((s) => (
            <div key={s.label} className="text-center space-y-1.5">
              <p className="font-mono text-xl font-bold tabular-nums text-cyan-400">
                {s.value}
              </p>
              <p
                className="text-[10px] font-mono tracking-[0.15em] uppercase"
                style={{ color: 'rgba(75,85,99,1)' }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer
        className="relative z-10 px-8 py-5 text-center font-mono"
        style={{
          borderTop: '1px solid rgba(6,182,212,0.07)',
          fontSize: 11,
          color: 'rgba(55,65,81,1)',
        }}
      >
        Built on{' '}
        <span style={{ color: 'rgba(6,182,212,0.6)' }}>Ika dWallet MPC</span>
        {' '}+{' '}
        <span style={{ color: 'rgba(6,182,212,0.6)' }}>Encrypt REFHE</span>
        {' '}· Pinocchio program · Solana devnet
      </footer>
    </div>
  );
}
