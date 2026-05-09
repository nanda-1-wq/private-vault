'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { BtcPrice } from './BtcPrice';

function truncate(addr: string) {
  return addr.slice(0, 4) + '…' + addr.slice(-4);
}

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/deposit', label: 'Deposit' },
  { href: '/borrow', label: 'Borrow' },
  { href: '/liquidations', label: 'Liquidations' },
];

export function NavBar() {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  return (
    <nav
      className="sticky top-0 z-50 grid grid-cols-3 items-center px-6 py-3.5 backdrop-blur-md"
      style={{
        background: 'rgba(5, 8, 15, 0.88)',
        borderBottom: '1px solid rgba(6, 182, 212, 0.1)',
      }}
    >
      {/* Left: logo + brand */}
      <Link href="/" className="flex items-center gap-2.5 group w-fit">
        <Image
          src="/encrypt_logo.svg"
          alt="PrivateVault"
          width={24}
          height={24}
          style={{
            filter:
              'brightness(0) saturate(100%) invert(67%) sepia(98%) saturate(400%) hue-rotate(150deg) brightness(100%)',
          }}
          className="opacity-90 group-hover:opacity-100 transition-opacity"
        />
        <span className="font-bold text-sm tracking-tight text-cyan-400 group-hover:text-cyan-300 transition-colors">
          PrivateVault
        </span>
      </Link>

      {/* Center: nav links */}
      <div className="hidden md:flex items-center justify-center gap-7">
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="text-sm text-gray-500 hover:text-gray-200 transition-colors duration-150 tracking-wide"
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Right: BTC price + wallet */}
      <div className="flex items-center justify-end gap-4">
        <BtcPrice />
        {connected && publicKey ? (
          <button
            onClick={() => disconnect()}
            className="font-mono text-xs px-3 py-1.5 rounded text-cyan-400 transition-all duration-200"
            style={{
              border: '1px solid rgba(6,182,212,0.25)',
              background: 'rgba(6,182,212,0.05)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(6,182,212,0.12)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(6,182,212,0.45)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(6,182,212,0.05)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(6,182,212,0.25)';
            }}
          >
            {truncate(publicKey.toBase58())}
          </button>
        ) : (
          <button
            onClick={() => setVisible(true)}
            className="text-xs font-semibold text-white px-4 py-1.5 rounded transition-all duration-200 cta-primary"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}
