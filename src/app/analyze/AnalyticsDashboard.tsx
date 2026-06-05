'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Legend, LineChart, Line,
} from 'recharts';
import { ParsedPick, ParseResult } from '@/lib/parseCapperText';
import {
  buildConsensus, detectConflicts, buildSportBreakdown,
  consensusToBarData, sportColor,
  ConsensusPick,
} from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────

function fmtOdds(odds: number): string {
  if (!odds) return '—';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function fmtBet(cp: ConsensusPick): string {
  if (cp.betType === 'spread' && cp.line !== undefined)
    return `${cp.line > 0 ? '+' : ''}${cp.line}`;
  if (cp.betType === 'total' && cp.line !== undefined)
    return `${cp.overUnder} ${cp.line}`;
  return cp.betType.toUpperCase();
}

const TIER_STYLE: Record<number, { label: string; bg: string; text: string }> = {
  1: { label: 'TIER 1', bg: 'bg-zest/15',   text: 'text-zest'   },
  2: { label: 'TIER 2', bg: 'bg-amber/15',  text: 'text-amber'  },
  3: { label: 'TIER 3', bg: 'bg-nickel/60', text: 'text-muted'  },
};

const LINE_COLORS = ['#6c3bff','#f59e0b','#22ff73','#863bff','#32f3e9','#f66f81','#b39aff'];

// ─── Custom tooltip ───────────────────────────────────────────────────

function DarkTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | string; payload?: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const fullName = (payload[0].payload as Record<string, unknown>)?.fullName as string | undefined;
  return (
    <div className="card px-4 py-3 text-sm shadow-xl">
      <p className="text-ink font-semibold mb-1">{fullName ?? label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sub">
          {p.name}: <span className="text-ink">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────

function Section({ title, children, delay = 0 }: {
  title: string; children: React.ReactNode; delay?: number;
}) {
  return (
    <div className="animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <h2 className="section-title mb-5">{title}</h2>
      {children}
    </div>
  );
}

// ─── Picks table ──────────────────────────────────────────────────────

function PicksTable({ picks }: { picks: ParsedPick[] }) {
  const uniqueCappers = [...new Set(picks.filter(p => !p.isPersonal && p.capper).map(p => p.capper))];
  const multiCapper = uniqueCappers.length > 1;

  // Group by normalized team name, sort groups and picks within each group alphabetically
  const groups = new Map<string, ParsedPick[]>();
  for (const p of picks) {
    const key = p.team.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const sortedGroups = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, groupPicks]) => groupPicks);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-white/7 flex items-center justify-between">
        <span className="table-header">Parsed Picks</span>
        <span className="text-base text-sub">{picks.length} picks</span>
      </div>
      {multiCapper && (
        <div className="px-5 py-2 border-b border-white/7 flex flex-wrap gap-1.5">
          {uniqueCappers.map(c => (
            <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-electric/15 text-violet border border-electric/20 font-medium">{c}</span>
          ))}
        </div>
      )}
      <div className="overflow-auto max-h-[340px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              {(['Team', multiCapper ? 'Capper' : null, 'Bet', 'Odds', 'U', 'Flag'] as (string | null)[]).filter(Boolean).map(h => (
                <th key={h!} className="text-left text-xs text-muted px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedGroups.map((groupPicks) => (
              groupPicks.map((p, j) => (
                <tr key={`${p.team}-${j}`} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.015] transition-colors">
                  <td className="px-4 py-2.5 font-medium">
                    {j === 0 ? (
                      <>
                        {p.team}
                        {p.opponent && <span className="text-muted font-normal text-xs"> vs {p.opponent}</span>}
                        {p.sport && <span className="ml-1.5 text-[10px] text-violet">{p.sport}</span>}
                      </>
                    ) : (
                      <span className="text-muted text-xs pl-2">↳</span>
                    )}
                  </td>
                  {multiCapper && (
                    <td className="px-4 py-2.5 text-violet text-xs truncate max-w-[100px]">
                      {p.isPersonal ? <span className="text-amber font-bold">MY PICK</span> : p.capper}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-muted text-xs">
                    {p.betType === 'spread' && p.line !== undefined
                      ? `${p.line > 0 ? '+' : ''}${p.line}`
                      : p.betType === 'total' && p.line !== undefined
                      ? `${p.overUnder} ${p.line}`
                      : 'ML'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={p.odds > 0 ? 'text-zest' : p.odds < 0 ? 'text-white' : 'text-nickel'}>
                      {fmtOdds(p.odds)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted text-xs">${p.units}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {!multiCapper && p.isPersonal && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/20 text-amber border border-amber/40 font-bold">MY PICK</span>
                      )}
                      {p.specialLabel && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/15 text-amber border border-amber/20">{p.specialLabel}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Consensus bar chart ──────────────────────────────────────────────

type BarEntry = {
  fullName: string; betLabel: string;
  cappers: number; capperNames: string[];
  units: number; fill: string;
  straightCount: number; parlayCount: number; hasParlay: boolean;
};

function ConsensusTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: BarEntry }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card px-4 py-3 text-sm shadow-xl max-w-[220px]">
      <p className="text-ink font-semibold leading-tight mb-0.5">
        {d.fullName}{d.hasParlay ? ' 🔗' : ''}
      </p>
      <p className="text-muted text-xs mb-2">{d.betLabel}</p>
      <p className="font-bold text-base mb-1.5" style={{ color: d.fill }}>
        {d.cappers} capper{d.cappers !== 1 ? 's' : ''}
      </p>
      <p className="text-sub text-xs leading-relaxed mb-1.5">{d.capperNames.join(' · ')}</p>
      {d.hasParlay ? (
        <p className="text-muted text-xs mb-0.5">
          {d.straightCount} straight · {d.parlayCount} parlay leg{d.parlayCount !== 1 ? 's' : ''}
        </p>
      ) : null}
      <p className="text-muted text-xs">${d.units} total</p>
    </div>
  );
}

function ConsensusBar({ consensus }: { consensus: ConsensusPick[] }) {
  const data = consensusToBarData(consensus.slice(0, 10));
  return (
    <div className="card p-5">
      <p className="text-xs text-muted uppercase tracking-widest mb-1">Most Backed Picks Today</p>
      <div className="flex gap-4 text-[10px] text-muted mb-4">
        {[['bg-zest','4+ cappers'],['bg-amber','2–3 cappers'],['bg-nickel','1 capper']].map(([c,l]) => (
          <span key={l}><span className={`inline-block w-2 h-2 rounded-full ${c} mr-1`} />{l}</span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={270}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -28, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#867e8e', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: '#867e8e', fontSize: 10 }} allowDecimals={false} />
          <Tooltip content={<ConsensusTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="cappers" name="Cappers" radius={[4,4,0,0]}>
            {data.map((e, i) => <Cell key={i} fill={e.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Performance timeline ─────────────────────────────────────────────

function PerformanceTimeline({
  historicalData, allCappers, visibleCappers, onToggle, search, onSearch,
}: {
  historicalData: Array<Record<string, string | number>>;
  allCappers: string[];
  visibleCappers: string[];
  onToggle: (c: string) => void;
  search: string;
  onSearch: (s: string) => void;
}) {
  const filtered = allCappers.filter(c => c.toLowerCase().includes(search.toLowerCase()));
  const hasData = historicalData.length > 0;

  return (
    <div className="card p-5">
      <p className="text-xs text-muted uppercase tracking-widest mb-4">
        Capper Performance — Last 30 Days (cumulative win rate)
      </p>
      <div className="flex gap-5">
        <div className="flex-1 min-w-0">
          {hasData ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={historicalData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fill: '#867e8e', fontSize: 10 }} />
                <YAxis tick={{ fill: '#867e8e', fontSize: 10 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip content={<DarkTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                {allCappers.map((c, i) => (
                  <Line
                    key={c} type="monotone" dataKey={c}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    strokeWidth={2} dot={false}
                    hide={!visibleCappers.includes(c)}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted text-sm">
              <div className="text-center">
                <div className="text-3xl mb-2 opacity-30">📈</div>
                <p>No historical data yet.</p>
                <p className="text-xs mt-1 opacity-60">Appears after picks are graded.</p>
              </div>
            </div>
          )}
        </div>
        <div className="w-44 shrink-0">
          <input
            type="text" placeholder="Search cappers…" value={search}
            onChange={e => onSearch(e.target.value)}
            className="w-full bg-midnight border border-white/8 rounded-lg px-3 py-2 text-xs text-white placeholder:text-muted outline-none focus:border-electric/50 mb-3"
          />
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {filtered.map((c, i) => {
              const on = visibleCappers.includes(c);
              return (
                <button key={c} onClick={() => onToggle(c)}
                  className="flex items-center gap-2 w-full text-left text-xs transition-colors"
                  style={{ color: on ? '#fff' : '#867e8e' }}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: LINE_COLORS[i % LINE_COLORS.length], opacity: on ? 1 : 0.3 }}
                  />
                  <span className="truncate">{c}</span>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="text-muted text-xs">No cappers match</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sport donut ──────────────────────────────────────────────────────

function SportDonut({ picks }: { picks: ParsedPick[] }) {
  const breakdown = buildSportBreakdown(picks);
  const data = breakdown.length
    ? breakdown.map(b => ({ name: b.sport, value: b.count, color: b.color }))
    : [
        { name: 'ML',     value: picks.filter(p => p.betType === 'ML').length,     color: '#6c3bff' },
        { name: 'Spread', value: picks.filter(p => p.betType === 'spread').length,  color: '#f59e0b' },
        { name: 'Total',  value: picks.filter(p => p.betType === 'total').length,   color: '#22ff73' },
      ].filter(x => x.value > 0);

  const title = breakdown.length ? 'Sport Breakdown' : 'Bet Type Breakdown';

  return (
    <div className="card p-5">
      <p className="text-xs text-muted uppercase tracking-widest mb-4">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            innerRadius={60} outerRadius={95} paddingAngle={3}
            label={({ name, percent }) => (percent ?? 0) > 0.06 ? `${name} ${Math.round((percent ?? 0) * 100)}%` : ''}
            labelLine={false}
          >
            {data.map((e, i) => <Cell key={i} fill={e.color} />)}
          </Pie>
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="card px-3 py-2 text-xs">
                  <p className="text-white font-medium">{payload[0].name}</p>
                  <p className="text-muted">{payload[0].value} pick{(payload[0].value as number) !== 1 ? 's' : ''}</p>
                </div>
              ) : null
            }
          />
          <Legend formatter={v => <span style={{ color: '#867e8e', fontSize: 11 }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Units distribution ───────────────────────────────────────────────

function UnitsDistribution({ picks }: { picks: ParsedPick[] }) {
  const data = [...picks]
    .sort((a, b) => b.units - a.units)
    .slice(0, 10)
    .map(p => ({
      name: p.team.length > 12 ? p.team.slice(0, 11) + '…' : p.team,
      fullName: p.team,
      units: p.units,
      fill: (p.specialLabel === 'POD' || p.specialLabel === 'MAX') ? '#f59e0b'
          : p.units >= 5 ? '#22ff73' : '#6c3bff',
    }));

  return (
    <div className="card p-5">
      <p className="text-xs text-muted uppercase tracking-widest mb-1">Units Distribution</p>
      <div className="flex gap-4 text-[10px] text-muted mb-4">
        {[['bg-amber','POD/MAX'],['bg-zest','5U+'],['bg-electric','Standard']].map(([c,l]) => (
          <span key={l}><span className={`inline-block w-2 h-2 rounded-full ${c} mr-1`} />{l}</span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#867e8e', fontSize: 10 }} />
          <YAxis type="category" dataKey="name" tick={{ fill: '#867e8e', fontSize: 10 }} width={80} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="units" name="Units" radius={[0,4,4,0]}>
            {data.map((e, i) => <Cell key={i} fill={e.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Capper Intelligence Panel ────────────────────────────────────────

function gradeConsensus(consensus: ConsensusPick[]): { grade: string; color: string; summary: string } {
  if (consensus.length === 0) return { grade: '—', color: 'text-muted', summary: 'No picks to grade.' };
  const tier1 = consensus.filter(c => c.tier === 1).length;
  const tier2 = consensus.filter(c => c.tier === 2).length;
  const total  = consensus.length;
  const rate   = (tier1 + tier2) / total;

  if (tier1 >= 3 || (tier1 >= 1 && rate >= 0.6))
    return { grade: 'A', color: 'text-zest',       summary: `${tier1} pick${tier1 !== 1 ? 's' : ''} backed by 4+ cappers — strong signal today.` };
  if (tier1 >= 1 || tier2 >= 4 || rate >= 0.5)
    return { grade: 'B', color: 'text-violet',     summary: `${tier1 + tier2} picks with multi-capper consensus.` };
  if (tier2 >= 2 || rate >= 0.25)
    return { grade: 'C', color: 'text-amber',      summary: `${tier2} pick${tier2 !== 1 ? 's' : ''} with 2–3 capper backing.` };
  if (rate > 0)
    return { grade: 'D', color: 'text-amber/70',   summary: 'Mostly single-capper picks, limited consensus.' };
  return   { grade: 'F', color: 'text-red-400',    summary: 'All picks are single-capper — no cross-capper agreement.' };
}

function CapperIntelligencePanel({
  consensus,
  allPicks,
  capperStats,
}: {
  consensus: ConsensusPick[];
  allPicks: ParsedPick[];
  capperStats: Record<string, { wins: number; total: number }>;
}) {
  const { grade, color, summary } = gradeConsensus(consensus);

  const tier1 = consensus.filter(c => c.tier === 1).length;
  const tier2 = consensus.filter(c => c.tier === 2).length;
  const tier3 = consensus.filter(c => c.tier === 3).length;

  // Cappers from today's session, ranked by verified win rate
  const todayCappers = [...new Set(allPicks.filter(p => !p.isPersonal && p.capper).map(p => p.capper))];
  const ranked = todayCappers
    .map(name => {
      const stats = capperStats[name];
      const wr    = stats && stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : null;
      return { name, wr, total: stats?.total ?? 0, pickCount: allPicks.filter(p => p.capper === name).length };
    })
    .sort((a, b) => {
      if (a.wr === null && b.wr === null) return b.pickCount - a.pickCount;
      if (a.wr === null) return 1;
      if (b.wr === null) return -1;
      // Penalise very small samples
      if (a.total < 5 && b.total >= 5) return 1;
      if (b.total < 5 && a.total >= 5) return -1;
      return b.wr - a.wr;
    })
    .slice(0, 5);

  // Picks with 2+ cappers, sorted by capper count desc
  const multiCapperPicks = consensus
    .filter(cp => cp.cappers.length >= 2)
    .sort((a, b) => b.cappers.length - a.cappers.length);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Consensus quality grade */}
        <div className="card p-5">
          <p className="text-xs text-muted uppercase tracking-widest mb-4">Consensus Quality</p>
          <div className="flex items-center gap-5">
            <span className={`text-6xl font-black leading-none tabular-nums ${color}`}>{grade}</span>
            <div className="min-w-0">
              <p className="text-ink font-semibold text-sm leading-snug mb-2">{summary}</p>
              <div className="flex flex-wrap gap-3 text-xs">
                {tier1 > 0 && (
                  <span><span className="text-zest font-bold">{tier1}</span> <span className="text-muted">tier-1 (4+)</span></span>
                )}
                {tier2 > 0 && (
                  <span><span className="text-amber font-bold">{tier2}</span> <span className="text-muted">tier-2 (2-3)</span></span>
                )}
                {tier3 > 0 && (
                  <span><span className="text-sub font-bold">{tier3}</span> <span className="text-muted">single</span></span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Who to follow today */}
        <div className="card p-5">
          <p className="text-xs text-muted uppercase tracking-widest mb-4">Who To Follow Today</p>
          {ranked.length === 0 ? (
            <p className="text-sub text-sm">No cappers in today&apos;s session.</p>
          ) : (
            <div className="space-y-3">
              {ranked.map((c, i) => {
                const wrColor = c.wr == null ? 'text-muted'
                  : c.wr >= 55 ? 'text-zest'
                  : c.wr >= 50 ? 'text-amber'
                  : 'text-red-400';
                return (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="text-xs text-muted w-4 shrink-0 text-right">{i + 1}</span>
                    <span className="text-sm text-ink font-medium flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted shrink-0">{c.pickCount}P</span>
                    {c.wr !== null ? (
                      <span className={`text-xs font-semibold shrink-0 ${wrColor}`}>
                        {c.wr}% WR
                        {c.total < 10 && <span className="text-muted font-normal ml-0.5">({c.total})</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-muted shrink-0">No history</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Multi-capper consensus picks */}
      <div className="card p-5">
        <p className="text-xs text-muted uppercase tracking-widest mb-4">Multi-Capper Consensus</p>
        {multiCapperPicks.length === 0 ? (
          <p className="text-sub text-sm">No picks with multiple capper support yet — add more cappers to see consensus form.</p>
        ) : (
          <div className="space-y-2">
            {multiCapperPicks.map(cp => {
              const betLabel =
                cp.betType === 'spread' && cp.line !== undefined
                  ? `${cp.line > 0 ? '+' : ''}${cp.line}`
                  : cp.betType === 'total' && cp.line !== undefined
                  ? `${cp.overUnder ?? ''} ${cp.line}`.trim()
                  : 'ML';
              const pickLabel = `${cp.team} ${betLabel}`;
              const capperColor = cp.cappers.length >= 4 ? 'text-zest' : 'text-amber';
              return (
                <div key={cp.key} className="flex items-baseline gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
                  <span className={`text-sm font-semibold shrink-0 tabular-nums ${capperColor}`}>
                    {cp.cappers.length}×
                  </span>
                  <span className="text-sm text-ink font-medium flex-1 min-w-0 truncate">{pickLabel}</span>
                  <span className="text-xs text-muted shrink-0 truncate max-w-[40%] text-right">
                    {cp.cappers.join(', ')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Conflict alerts ──────────────────────────────────────────────────

function ConflictAlerts({ picks }: { picks: ParsedPick[] }) {
  const conflicts = detectConflicts(picks);
  if (!conflicts.length) return null;
  return (
    <div className="space-y-3 animate-fade-up">
      {conflicts.map((c, i) => (
        <div key={i} className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
          <p className="text-red-400 text-xs font-semibold uppercase tracking-wider mb-2">⚠ Conflict — {c.game}</p>
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-muted text-xs mb-0.5">{c.side1.cappers.join(', ')}</p>
              <p className="text-white font-medium">{c.side1.team}</p>
            </div>
            <div className="text-muted self-center text-xs">vs</div>
            <div>
              <p className="text-muted text-xs mb-0.5">{c.side2.cappers.join(', ')}</p>
              <p className="text-white font-medium">{c.side2.team}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Bet state types ──────────────────────────────────────────────────

type BetResult = 'unconfirmed' | 'confirmed';
type BetState  = { result: BetResult; dbId?: string };

// ─── Consensus score cards with live bet tracking ─────────────────────

function calcCost(cp: ConsensusPick): number {
  return Math.round((cp.totalUnits / cp.cappers.length) * 100) / 100;
}

function calcPayout(cp: ConsensusPick, cost: number): number {
  if (!cp.avgOdds) return cost;
  const profit = cp.avgOdds > 0
    ? cost * (cp.avgOdds / 100)
    : cost * (100 / Math.abs(cp.avgOdds));
  return Math.round((profit + cost) * 100) / 100;
}

// ─── Confirm modal ────────────────────────────────────────────────────

function ConfirmModal({
  cp, onConfirm, onCancel,
}: {
  cp: ConsensusPick;
  onConfirm: (costDollars: number, payoutDollars: number) => void;
  onCancel: () => void;
}) {
  const defaultCost   = calcCost(cp);
  const defaultPayout = calcPayout(cp, defaultCost);
  const [cost,   setCost]   = useState(defaultCost.toFixed(2));
  const [payout, setPayout] = useState(defaultPayout.toFixed(2));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card p-8 w-full max-w-sm mx-4 animate-fade-up">
        <h3 className="card-title mb-1">{cp.team}</h3>
        <p className="text-sub text-sm mb-6">{fmtBet(cp)} · {fmtOdds(cp.avgOdds)}</p>

        <div className="space-y-4 mb-6">
          <div>
            <label className="table-header block mb-2">How much are you betting?</label>
            <div className="flex items-center gap-2 bg-midnight border border-white/10 rounded-xl px-4 py-3">
              <span className="text-sub text-sm">$</span>
              <input
                type="number" min={0} step={0.01} value={cost}
                onChange={e => {
                  setCost(e.target.value);
                  const c = parseFloat(e.target.value) || 0;
                  setPayout(calcPayout(cp, c).toFixed(2));

                }}
                className="flex-1 bg-transparent text-ink font-mono text-lg outline-none"
              />
            </div>
          </div>
          <div>
            <label className="table-header block mb-2">Potential payout</label>
            <div className="flex items-center gap-2 bg-midnight border border-white/10 rounded-xl px-4 py-3">
              <span className="text-sub text-sm">$</span>
              <input
                type="number" min={0} step={0.01} value={payout}
                onChange={e => setPayout(e.target.value)}
                className="flex-1 bg-transparent text-zest font-mono text-lg outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-ghost flex-1">Cancel</button>
          <button
            onClick={() => onConfirm(parseFloat(cost) || 0, parseFloat(payout) || 0)}
            className="btn-primary flex-1"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Consensus score cards ────────────────────────────────────────────

function ConsensusCards({
  consensus, betStates, justConfirmed, onConfirm,
}: {
  consensus: ConsensusPick[];
  betStates: Map<string, BetState>;
  justConfirmed: Set<string>;
  onConfirm: (key: string) => void;
}) {
  const [dismissed,  setDismissed]  = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  function toggleDismiss(key: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDismissed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const hiddenCount  = dismissed.size;
  const displayPicks = showHidden ? consensus : consensus.filter(cp => !dismissed.has(cp.key));

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {displayPicks.map((cp, i) => {
          const ts          = TIER_STYLE[cp.tier];
          const state       = betStates.get(cp.key)?.result ?? 'unconfirmed';
          const isHigh      = cp.specialLabels.length > 0;
          const isJust      = justConfirmed.has(cp.key);
          const isDismissed = dismissed.has(cp.key);

          const borderStyle = state === 'confirmed' ? 'border-zest/40' : isHigh ? 'border-amber/25' : '';
          const bgStyle     = state === 'confirmed' ? 'bg-zest/[0.03]' : '';

          return (
            <div
              key={cp.key}
              className={`card p-6 animate-fade-up relative overflow-hidden group transition-opacity ${borderStyle} ${bgStyle} ${isDismissed ? 'opacity-40' : ''}`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* Tier badge — top right */}
              <span className={`absolute top-4 right-4 text-[10px] px-2 py-0.5 rounded-full font-semibold ${ts.bg} ${ts.text}`}>
                {ts.label}
              </span>

              {/* Dismiss / restore button — top left, hover-only (always visible when dismissed) */}
              <button
                onClick={e => toggleDismiss(cp.key, e)}
                title={isDismissed ? 'Restore card' : 'Dismiss card'}
                className={`absolute top-3 left-3 z-20 w-5 h-5 flex items-center justify-center rounded text-xs transition-all ${
                  isDismissed
                    ? 'text-violet opacity-100'
                    : 'text-muted/50 hover:text-red-400 opacity-0 group-hover:opacity-100'
                }`}
              >
                {isDismissed ? '↩' : '✕'}
              </button>

              {(cp.specialLabels.length > 0 || cp.cappers.includes('Personal')) && (
                <div className="flex flex-wrap gap-1 mb-3 pl-5">
                  {cp.cappers.includes('Personal') && (
                    <span className="text-xs px-2 py-0.5 rounded-lg bg-amber/20 text-amber border border-amber/40 font-bold tracking-wide">MY PICK</span>
                  )}
                  {cp.specialLabels.map(sl => (
                    <span key={sl} className="text-xs px-2 py-0.5 rounded-lg bg-amber/15 text-amber border border-amber/20 font-semibold">{sl}</span>
                  ))}
                </div>
              )}

              <p className="card-title mb-1 pr-14">{cp.team}</p>
              {cp.opponent && <p className="text-sub text-base mb-1">vs {cp.opponent}</p>}
              <div className="flex items-center gap-2 mb-5">
                <span className="text-sm text-sub bg-midnight px-3 py-1 rounded-lg border border-white/7">{fmtBet(cp)}</span>
                {cp.sport && <span className="text-sm text-violet">{cp.sport}</span>}
                <span className={`text-sm font-mono font-semibold ml-auto ${cp.avgOdds > 0 ? 'text-zest' : 'text-ink'}`}>
                  {fmtOdds(cp.avgOdds)}
                </span>
              </div>

              {state === 'unconfirmed' && (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center pt-4 border-t border-white/7">
                    <div>
                      <p className="stat-num text-2xl" style={{ color: cp.tier === 1 ? '#22ff73' : cp.tier === 2 ? '#f59e0b' : '#b39aff' }}>
                        {cp.cappers.length}
                      </p>
                      <p className="table-header mt-1">Cappers</p>
                    </div>
                    <div>
                      <p className="stat-num text-2xl text-ink">~${calcCost(cp).toFixed(0)}</p>
                      <p className="table-header mt-1">Est. Cost</p>
                    </div>
                    <div>
                      <p className={`stat-num text-2xl ${cp.avgOdds > 0 ? 'text-zest' : 'text-ink'}`}>{fmtOdds(cp.avgOdds)}</p>
                      <p className="table-header mt-1">Avg Odds</p>
                    </div>
                  </div>
                  <p className="text-sm text-sub mt-3 truncate">{cp.cappers.join(' · ')}</p>
                  {/* Confirm overlay only on non-dismissed cards */}
                  {!isDismissed && (
                    <div
                      className="absolute inset-0 rounded-[13px] bg-electric/10 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center cursor-pointer"
                      onClick={() => onConfirm(cp.key)}
                    >
                      <span className="btn-primary text-base px-6 py-3 pointer-events-none">✓ Confirm Bet</span>
                    </div>
                  )}
                </>
              )}

              {state === 'confirmed' && (
                <div className="pt-4 border-t border-white/7">
                  <div className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-base transition-all ${
                    isJust ? 'bg-zest/20 text-zest' : 'bg-zest/10 text-zest/60'
                  }`}>
                    <span>✓</span>
                    <span>{isJust ? 'Added to My Active Bets' : 'Confirmed'}</span>
                  </div>
                  <p className="text-sm text-sub mt-3 truncate">{cp.cappers.join(' · ')}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show / hide dismissed footer */}
      {hiddenCount > 0 && (
        <div className="mt-5 text-center">
          <button
            onClick={() => setShowHidden(v => !v)}
            className="text-xs text-muted hover:text-sub transition-colors"
          >
            {showHidden
              ? 'Hide dismissed cards'
              : `Show ${hiddenCount} hidden card${hiddenCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}


// ─── Main dashboard export ────────────────────────────────────────────

export interface AnalyticsDashboardProps {
  result: ParseResult;
  allPicks: ParsedPick[];
  historicalData: Array<Record<string, string | number>>;
  allCappers: string[];
  capperStats: Record<string, { wins: number; total: number }>;
}

export default function AnalyticsDashboard({
  result, allPicks, historicalData, allCappers, capperStats,
}: AnalyticsDashboardProps) {
  const [capperSearch,   setCapperSearch]   = useState('');
  const [visibleCappers, setVisibleCappers] = useState<string[]>(allCappers);
  const [betStates,      setBetStates]      = useState<Map<string, BetState>>(new Map());
  const [confirmingKey,  setConfirmingKey]  = useState<string | null>(null);
  const [justConfirmed,  setJustConfirmed]  = useState<Set<string>>(new Set());

  useEffect(() => { setVisibleCappers(allCappers); }, [allCappers]);

  const consensus = buildConsensus(allPicks);

  function toggleCapper(c: string) {
    setVisibleCappers(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  function openConfirmModal(key: string) {
    setConfirmingKey(key);
  }

  async function handleModalConfirm(costDollars: number, payoutDollars: number) {
    const key = confirmingKey;
    setConfirmingKey(null);
    if (!key) return;

    setBetStates(prev => new Map(prev).set(key, { result: 'confirmed' }));
    setJustConfirmed(prev => new Set(prev).add(key));
    setTimeout(() => {
      setJustConfirmed(prev => { const next = new Set(prev); next.delete(key); return next; });
    }, 2500);

    const cp = consensus.find(c => c.key === key);
    if (!cp) return;
    const betUnits = Math.round((cp.totalUnits / cp.cappers.length) * 10) / 10;

    try {
      // Normalize capper names: strip leading commas/spaces, title-case
      const normName = (n: string) =>
        n.replace(/^[\s,]+/, '').replace(/[\s,]+$/, '').trim()
         .replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown';
      const normalizedCappers = cp.cappers.map(normName);
      const capperName = normalizedCappers[0] ?? 'Unknown';

      // Select-first: avoids upsert RLS issues. Try to find the capper row, insert only if missing.
      let capperId: string | null = null;
      const { data: existing } = await supabase
        .from('cappers').select('id').eq('name', capperName).maybeSingle();
      if (existing) {
        capperId = existing.id;
      } else {
        const { data: inserted, error: insertCapperErr } = await supabase
          .from('cappers').insert({ name: capperName }).select('id').single();
        if (insertCapperErr) { console.error('[confirmBet] capper insert failed:', insertCapperErr); return; }
        capperId = inserted?.id ?? null;
      }
      if (!capperId) { console.error('[confirmBet] could not resolve capper id'); return; }

      const payload = {
        capper_id:      capperId,
        capper_name:    normalizedCappers.join(', '),
        team:           cp.team,
        opponent:       cp.opponent ?? null,
        bet_type:       cp.betType,
        line:           cp.line ?? null,
        over_under:     cp.overUnder ?? null,
        odds:           cp.avgOdds,
        units:          betUnits,
        sport:          cp.sport ?? null,
        special_label:  (cp.specialLabels[0] ?? null) as string | null,
        raw_text:       `${cp.team} ${cp.betType}`,
        pick_date:      (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
        result:         'pending',
        user_confirmed: true,
        cost_dollars:   costDollars,
        payout_dollars: payoutDollars,
      };
      console.log('[confirmBet] inserting pick:', payload);
      const { data: inserted, error: insertErr } = await supabase.from('picks').insert(payload).select('id').single();
      if (insertErr) { console.error('[confirmBet] insert failed:', insertErr); }
      else           { console.log('[confirmBet] insert success, id:', inserted?.id); }
    } catch (err) { console.error('[confirmBet] unexpected error:', err); }
  }

  return (
    <div className="space-y-10 pb-16">

      {/* Capper header + unit size */}
      {(() => {
        const sessionCappers = [...new Set(result.picks.filter(p => !p.isPersonal && p.capper).map(p => p.capper))];
        const headerLabel = sessionCappers.length > 1
          ? `${sessionCappers.length} Cappers`
          : (result.capper || 'Session');
        return (
      <div className="flex flex-wrap items-center gap-4 animate-fade-up">
        <h2 className="section-title">{headerLabel}</h2>
        {sessionCappers.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {sessionCappers.map(c => (
              <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-electric/15 text-violet border border-electric/20 font-medium">{c}</span>
            ))}
          </div>
        )}
        {sessionCappers.length <= 1 && result.capperRecord && (
          <span className="text-base text-sub bg-surface border border-white/8 px-3 py-1 rounded-full">
            {result.capperRecord} record
          </span>
        )}
        {sessionCappers.length <= 1 && result.capperSpecialLabel && (
          <span className="text-sm px-3 py-1 rounded-full bg-electric/20 text-violet border border-electric/30 font-semibold">
            {result.capperSpecialLabel}
          </span>
        )}
        <span className="text-base text-sub ml-auto">{allPicks.length} picks today</span>
      </div>
        );
      })()}

      {/* Conflicts */}
      <ConflictAlerts picks={allPicks} />

      {/* Row 1 — Picks + Bar */}
      <Section title="Today's Picks" delay={40}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <PicksTable picks={allPicks} />
          <ConsensusBar consensus={consensus} />
        </div>
      </Section>

      {/* Row 2 — Capper Intelligence */}
      <Section title="Capper Intelligence" delay={80}>
        <CapperIntelligencePanel
          consensus={consensus}
          allPicks={allPicks}
          capperStats={capperStats}
        />
      </Section>

      {/* Row 3 — Performance timeline */}
      <Section title="Capper Performance — Last 30 Days" delay={120}>
        <PerformanceTimeline
          historicalData={historicalData}
          allCappers={allCappers}
          visibleCappers={visibleCappers}
          onToggle={toggleCapper}
          search={capperSearch}
          onSearch={setCapperSearch}
        />
      </Section>

      {/* Row 4 — Breakdown */}
      <Section title="Breakdown" delay={160}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SportDonut picks={allPicks} />
          <UnitsDistribution picks={allPicks} />
        </div>
      </Section>

      {/* Row 5 — Consensus cards */}
      <Section title="Select Bets" delay={200}>
        <ConsensusCards
          consensus={consensus}
          betStates={betStates}
          justConfirmed={justConfirmed}
          onConfirm={openConfirmModal}
        />
      </Section>

      {/* Confirm modal */}
      {confirmingKey && (() => {
        const cp = consensus.find(c => c.key === confirmingKey);
        if (!cp) return null;
        return (
          <ConfirmModal
            cp={cp}
            onConfirm={handleModalConfirm}
            onCancel={() => setConfirmingKey(null)}
          />
        );
      })()}

    </div>
  );
}
