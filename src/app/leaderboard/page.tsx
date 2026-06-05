'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────

interface Capper {
  id: string;
  name: string;
  wins: number;
  losses: number;
  pushes: number;
  total_units_wagered: number;
  total_units_won: number;
  self_reported_record?: string | null;
}

interface GradedPick {
  pick_date: string;
  result: string;
  units: number;
  units_won: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────

function winRate(wins: number, graded: number): number | null {
  return graded > 0 ? Math.round((wins / graded) * 100) : null;
}

function fmtPnL(n: number) {
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Monthly bar chart ────────────────────────────────────────────

function MonthlyChart({ picks }: { picks: GradedPick[] }) {
  const data = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of picks) {
      if (p.result === 'pending' || p.units_won == null) continue;
      const month = p.pick_date.slice(0, 7); // "2025-06"
      map.set(month, (map.get(month) ?? 0) + p.units_won);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, pnl]) => {
        const [y, m] = month.split('-');
        const rounded = Math.round(pnl * 100) / 100;
        return {
          label: `${MONTH_NAMES[parseInt(m) - 1]} ${y.slice(2)}`,
          pnl: rounded,
          fill: rounded >= 0 ? '#22ff73' : '#ff4b4b',
        };
      });
  }, [picks]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sub text-base">
        No graded picks yet — grade picks on My Active Bets to see monthly trends.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#888888', fontSize: 12 }} />
        <YAxis tick={{ fill: '#888888', fontSize: 12 }} tickFormatter={v => `$${v}`} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="card px-4 py-3 text-sm">
                <p className="text-ink font-semibold mb-1">{payload[0].payload.label}</p>
                <p className={(payload[0].value as number) >= 0 ? 'text-zest font-bold' : 'text-red-400 font-bold'}>
                  {(payload[0].value as number) >= 0 ? '+' : '−'}${Math.abs(payload[0].value as number).toFixed(2)}
                </p>
              </div>
            ) : null
          }
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
        />
        <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
          {data.map((e, i) => <Cell key={i} fill={e.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Rank badge ───────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const s = rank === 1 ? 'text-amber border-amber/40 bg-amber/10'
          : rank === 2 ? 'text-[#C0C0C0] border-[#C0C0C0]/30 bg-[#C0C0C0]/10'
          : rank === 3 ? 'text-[#CD7F32] border-[#CD7F32]/30 bg-[#CD7F32]/10'
          : 'text-sub border-white/10 bg-white/5';
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-base border ${s}`}>
      {rank}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────

type SortKey = 'winRate' | 'wins' | 'units';

export default function HistoricalDataPage() {
  const [cappers,  setCappers]  = useState<Capper[]>([]);
  const [myPicks,  setMyPicks]  = useState<GradedPick[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [sortBy,   setSortBy]   = useState<SortKey>('winRate');

  useEffect(() => {
    async function load() {
      const [{ data: capperData }, { data: pickData }] = await Promise.all([
        supabase.from('cappers').select('*').order('created_at', { ascending: true }),
        supabase.from('picks').select('pick_date,result,units,units_won').order('pick_date', { ascending: true }),
      ]);
      setCappers((capperData as Capper[]) ?? []);
      setMyPicks((pickData as GradedPick[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // My own aggregate stats (from all graded picks)
  const myGraded  = myPicks.filter(p => p.result !== 'pending');
  const myWins    = myGraded.filter(p => p.result === 'win').length;
  const myPnL     = myGraded.reduce((s, p) => s + (p.units_won ?? 0), 0);
  const myWR      = winRate(myWins, myGraded.length);

  // This week's P&L
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStr = weekAgo.toISOString().split('T')[0];
  const weekPnL = myGraded
    .filter(p => p.pick_date >= weekStr)
    .reduce((s, p) => s + (p.units_won ?? 0), 0);

  // This month's P&L
  const monthStr = new Date().toISOString().slice(0, 7);
  const monthPnL = myGraded
    .filter(p => p.pick_date.startsWith(monthStr))
    .reduce((s, p) => s + (p.units_won ?? 0), 0);

  const sorted = [...cappers].sort((a, b) => {
    const aGraded = a.wins + a.losses;
    const bGraded = b.wins + b.losses;
    if (sortBy === 'winRate') return (winRate(b.wins, bGraded) ?? -1) - (winRate(a.wins, aGraded) ?? -1);
    if (sortBy === 'wins')    return b.wins - a.wins;
    return b.total_units_won - a.total_units_won;
  });

  const SORT_TABS: { key: SortKey; label: string }[] = [
    { key: 'winRate', label: 'Win Rate' },
    { key: 'wins',    label: 'Wins'     },
    { key: 'units',   label: '$ P&L'   },
  ];

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-14 space-y-10">

      {/* Header */}
      <div className="animate-fade-up">
        <p className="table-header mb-3">Capper Tracker</p>
        <h1 className="page-title mb-3">Historical Data</h1>
        <p className="text-base text-sub">Your performance metrics, capper rankings, and monthly profit trends.</p>
      </div>

      {/* My metrics */}
      <section className="animate-fade-up" style={{ animationDelay: '40ms' }}>
        <h2 className="section-title mb-5">My Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'All-Time W-L', value: `${myWins}-${myGraded.length - myWins}`, hi: '', compact: false },
            { label: 'Win Rate',     value: myWR != null ? `${myWR}%` : '—',
              hi: myWR != null && myWR >= 55 ? 'text-zest' : myWR != null && myWR < 45 ? 'text-red-400' : '', compact: false },
            { label: 'This Week',    value: fmtPnL(weekPnL),
              hi: weekPnL >= 0 ? 'text-zest' : 'text-red-400', compact: true },
            { label: 'This Month',   value: fmtPnL(monthPnL),
              hi: monthPnL >= 0 ? 'text-zest' : 'text-red-400', compact: true },
          ].map(s => (
            <div key={s.label} className="card px-6 py-5">
              <p className="table-header mb-2">{s.label}</p>
              <p className={`${s.compact ? 'stat-num' : 'stat-xl'} ${s.hi} truncate`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* All-time P&L hero */}
        <div className="card px-8 py-8 text-center">
          <p className="table-header mb-3">All-Time Net P&amp;L</p>
          <p className={`pnl-hero ${myPnL >= 0 ? 'text-zest' : 'text-red-400'}`}>
            {fmtPnL(myPnL)}
          </p>
          <p className="text-base text-sub mt-3">{myGraded.length} graded picks total</p>
        </div>
      </section>

      {/* Monthly P&L chart */}
      <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
        <h2 className="section-title mb-5">Monthly Profit &amp; Loss</h2>
        <div className="card p-7">
          <MonthlyChart picks={myPicks} />
        </div>
      </section>

      {/* Capper rankings */}
      <section className="animate-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
          <h2 className="section-title">Capper Rankings</h2>
          <div className="flex gap-1 p-1 bg-surface rounded-xl">
            {SORT_TABS.map(t => (
              <button key={t.key} onClick={() => setSortBy(t.key)}
                className={`px-4 py-2 text-base font-medium rounded-xl transition-all ${
                  sortBy === t.key ? 'bg-electric text-white' : 'text-sub hover:text-ink'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-sub text-lg">Loading…</div>
        ) : cappers.length === 0 ? (
          <div className="flex flex-col items-center py-24 gap-4 text-sub animate-fade-up">
            <div className="text-5xl opacity-20">🏆</div>
            <p className="text-lg">No cappers yet. Save picks on the Analyze tab to add them.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((c, i) => {
              const graded = c.wins + c.losses;
              const wr  = winRate(c.wins, graded);
              const pnl = Math.round(c.total_units_won * 100) / 100;

              return (
                <div key={c.id} className="card px-6 py-5 flex items-center gap-5">
                  <RankBadge rank={i + 1} />

                  {/* 4-col grid: name + 3 stats — all at the same visual weight */}
                  <div className="flex-1 grid grid-cols-4 gap-6 items-center min-w-0">

                    {/* Capper name — same font as the stat numbers */}
                    <div className="min-w-0">
                      <p className="stat-num text-3xl text-ink truncate leading-tight">{c.name}</p>
                      <p className="text-[11px] text-muted mt-0.5 truncate">
                        {graded} pick{graded !== 1 ? 's' : ''}
                        {c.self_reported_record && (
                          <span className="ml-1.5 text-muted/70">· {c.self_reported_record}</span>
                        )}
                      </p>
                    </div>

                    {/* Win Rate */}
                    <div className="text-right">
                      <p className={`stat-num text-3xl tabular-nums ${
                        wr != null && wr >= 55 ? 'text-zest' :
                        wr != null && wr < 45  ? 'text-red-400' : 'text-sub'
                      }`}>
                        {wr != null ? `${wr}%` : '—'}
                      </p>
                      <p className="table-header mt-1">Win Rate</p>
                    </div>

                    {/* W-L */}
                    <div className="text-right">
                      <p className="stat-num text-3xl text-ink tabular-nums">{c.wins}-{c.losses}</p>
                      <p className="table-header mt-1">W-L</p>
                    </div>

                    {/* $ P&L */}
                    <div className="text-right">
                      <p className={`stat-num text-3xl tabular-nums truncate ${
                        pnl > 0 ? 'text-zest' : pnl < 0 ? 'text-red-400' : 'text-sub'
                      }`}>
                        {fmtPnL(pnl)}
                      </p>
                      <p className="table-header mt-1">$ P&amp;L</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
