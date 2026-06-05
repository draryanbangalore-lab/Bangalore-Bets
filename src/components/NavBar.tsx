'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';

const TABS = [
  { label: 'Analyze',         href: '/analyze'     },
  { label: 'My Active Bets',  href: '/my-bets'     },
  { label: 'Historical Data', href: '/leaderboard' },
  { label: 'History',         href: '/history'     },
];

export default function NavBar() {
  const pathname = usePathname();
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

  useEffect(() => {
    const activeIdx = TABS.findIndex(
      t => pathname === t.href || pathname.startsWith(t.href + '/')
    );
    const el = tabRefs.current[activeIdx >= 0 ? activeIdx : 0];
    if (el) {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
    }
  }, [pathname]);

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 border-b border-white/7"
      style={{ background: 'rgba(12, 9, 18, 0.88)', backdropFilter: 'blur(14px)' }}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-10 h-14">

        {/* Brand */}
        <Link href="/analyze" className="shrink-0 select-none flex items-center gap-2.5">
          <div style={{ width: 36, height: 36, overflow: 'hidden', borderRadius: 6, flexShrink: 0 }}>
            <Image
              src="/logo-icon-v2.png"
              alt="Bangalore Bets"
              width={100}
              height={100}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center center'
              }}
              priority
            />
          </div>
          <span className="text-[0.9375rem] font-bold tracking-tight text-white">
            Bangalore Bets
          </span>
        </Link>

        {/* Tabs */}
        <nav className="relative flex items-stretch h-14">
          {TABS.map((tab, i) => {
            const isActive =
              pathname === tab.href || pathname.startsWith(tab.href + '/');
            return (
              <Link
                key={tab.href}
                href={tab.href}
                ref={el => { tabRefs.current[i] = el; }}
                className={`flex items-center px-4 text-sm font-medium transition-colors duration-150 ${
                  isActive ? 'text-ink' : 'text-sub hover:text-ink/75'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}

          {/* Sliding electric-purple underline */}
          <span
            className="absolute bottom-0 h-[2px] rounded-full bg-electric transition-all duration-300 ease-out"
            style={{
              left:    indicator.left,
              width:   indicator.width,
              opacity: indicator.ready ? 1 : 0,
            }}
          />
        </nav>
      </div>
    </header>
  );
}
