'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Legend, LineChart, Line,
} from 'recharts';
import { ParsedPick, ParseResult } from '@/lib/parseCapperText';
import {
  buildConsensus, detectConflicts, buildSportBreakdown, buildUnitRisk,
  buildParlay, consensusToBarData, sportColor,
  ConsensusPick, ParlayResult, UnitRisk,
} from '@/lib/analytics';

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
    <div className="card px-3 py-2 text-xs shadow-xl">
      <p className="text-white font-medium mb-1">{fullName ?? label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted">
          {p.name}: <span className="text-white">{p.value}</span>
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
      <h2 className="text-xs text-muted uppercase tracking-widest mb-3">{title}</h2>
      {children}
    </div>
  );
}

// ─── Picks table ──────────────────────────────────────────────────────

function PicksTable({ picks }: { picks: ParsedPick[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-white/7 flex items-center justify-between">
        <span className="text-xs text-muted uppercase tracking-widest">Parsed Picks</span>
        <span className="text-xs text-muted">{picks.length} picks</span>
      </div>
      <div className="overflow-auto max-h-[340px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              {['Team', 'Bet', 'Odds', 'U', 'Flag'].map(h => (
                <th key={h} className="text-left text-xs text-muted px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {picks.map((p, i) => (
              <tr key={i} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.015] transition-colors">
                <td className="px-4 py-2.5 font-medium">
                  {p.team}
                  {p.opponent && <span className="text-muted font-normal text-xs"> vs {p.opponent}</span>}
                  {p.sport && <span className="ml-1.5 text-[10px] text-violet">{p.sport}</span>}
                </td>
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
                <td className="px-4 py-2.5 text-muted text-xs">{p.units}U</td>
                <td className="px-4 py-2.5">
                  {p.specialLabel && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/15 text-amber border border-amber/20">
                      {p.specialLabel}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Consensus bar chart ──────────────────────────────────────────────

function ConsensusBar({ consensus }: { consensus: ConsensusPick[] }) {
  const data = consensusToBarData(consensus.slice(0, 10));
  return (
    <div className="card p-5">
      <p className="text-xs text-muted uppercase tracking-widest mb-1">Most Backed Picks Today</p>
      <div className="flex gap-4 text-[10px] text-muted mb-4">
        {[['bg-zest','3+ cappers'],['bg-amber','2 cappers'],['bg-nickel','1 capper']].map(([c,l]) => (
          <span key={l}><span className={`inline-block w-2 h-2 rounded-full ${c} mr-1`} />{l}</span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={270}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -28, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#867e8e', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: '#867e8e', fontSize: 10 }} allowDecimals={false} />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
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

// ─── Consensus score cards ────────────────────────────────────────────

function ConsensusCards({ consensus }: { consensus: ConsensusPick[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {consensus.map((cp, i) => {
        const ts = TIER_STYLE[cp.tier];
        const isHigh = cp.specialLabels.length > 0;
        return (
          <div
            key={cp.key}
            className={`card p-5 animate-fade-up relative overflow-hidden ${isHigh ? 'border-amber/25' : ''}`}
            style={{ animationDelay: `${i * 40}ms`, boxShadow: isHigh ? '0 0 30px rgba(245,158,11,0.06)' : undefined }}
          >
            <span className={`absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full font-semibold ${ts.bg} ${ts.text}`}>
              {ts.label}
            </span>

            {cp.specialLabels.length > 0 && (
              <div className="flex gap-1 mb-2">
                {cp.specialLabels.map(sl => (
                  <span key={sl} className="text-[10px] px-1.5 py-0.5 rounded bg-amber/15 text-amber border border-amber/20 font-medium">
                    {sl}
                  </span>
                ))}
              </div>
            )}

            <p className="font-semibold text-base mb-0.5 pr-14">{cp.team}</p>
            {cp.opponent && <p className="text-muted text-xs mb-2">vs {cp.opponent}</p>}

            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted bg-surface px-2 py-0.5 rounded border border-white/7">
                {fmtBet(cp)}
              </span>
              {cp.sport && <span className="text-[10px] text-violet">{cp.sport}</span>}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-white/5">
              <div>
                <p className="text-lg font-semibold"
                  style={{ color: cp.tier === 1 ? '#22ff73' : cp.tier === 2 ? '#f59e0b' : '#b39aff' }}>
                  {cp.cappers.length}
                </p>
                <p className="text-[10px] text-muted">Cappers</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{cp.totalUnits}U</p>
                <p className="text-[10px] text-muted">Units</p>
              </div>
              <div>
                <p className={`text-lg font-semibold ${cp.avgOdds > 0 ? 'text-zest' : 'text-white'}`}>
                  {fmtOdds(cp.avgOdds)}
                </p>
                <p className="text-[10px] text-muted">Avg Odds</p>
              </div>
            </div>
            <p className="text-[10px] text-muted mt-2 truncate">{cp.cappers.join(' · ')}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Unit risk summary ────────────────────────────────────────────────

function UnitRiskSummary({ picks }: { picks: ParsedPick[] }) {
  const risks: UnitRisk[] = buildUnitRisk(picks);
  const total = risks.reduce((s, r) => s + r.totalUnits, 0);
  return (
    <div className="card p-5">
      <p className="text-xs text-muted uppercase tracking-widest mb-4">
        Unit Risk — <span className="text-white">{total}U</span> total at risk today
      </p>
      <div className="space-y-3">
        {risks.map(r => (
          <div key={r.sport} className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sportColor(r.sport) }} />
            <span className="text-sm text-white w-16 shrink-0">{r.sport}</span>
            <div className="flex-1 bg-surface rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full"
                style={{ width: `${Math.round((r.totalUnits / total) * 100)}%`, background: sportColor(r.sport) }}
              />
            </div>
            <span className="text-sm text-muted w-8 text-right shrink-0">{r.totalUnits}U</span>
            {r.podUnits > 0 && (
              <span className="text-[10px] text-amber shrink-0">{r.podUnits}U POD</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Parlay builder ───────────────────────────────────────────────────

function ParlayBuilder({ parlay }: { parlay: ParlayResult | null }) {
  if (!parlay) {
    return (
      <div className="card p-5 flex items-center justify-center text-muted text-sm">
        <div className="text-center py-6">
          <div className="text-2xl mb-2 opacity-30">🎲</div>
          Need 2+ picks with odds to build a parlay
        </div>
      </div>
    );
  }
  return (
    <div className="card p-5">
      <p className="text-xs text-muted uppercase tracking-widest mb-1">Auto Parlay Builder</p>
      <p className="text-xs text-muted mb-4">Top consensus picks combined</p>
      <div className="space-y-2 mb-4">
        {parlay.legs.map((leg, i) => (
          <div key={i} className="flex items-center justify-between text-sm border-b border-white/5 pb-2 last:border-0">
            <div>
              <span className="text-white font-medium">{leg.team}</span>
              {leg.betType !== 'ML' && leg.line !== undefined && (
                <span className="text-muted ml-2 text-xs">{leg.line > 0 ? '+' : ''}{leg.line}</span>
              )}
              <p className="text-muted text-xs">{leg.cappers.slice(0, 2).join(', ')}</p>
            </div>
            <span className={`font-medium ${leg.odds > 0 ? 'text-zest' : 'text-white'}`}>{fmtOdds(leg.odds)}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-electric/10 border border-electric/20 px-4 py-3 text-center">
        <p className="text-xs text-muted mb-0.5">Combined Parlay Odds</p>
        <p className={`text-2xl font-bold ${parlay.combinedOdds > 0 ? 'text-zest' : 'text-white'}`}>
          {fmtOdds(parlay.combinedOdds)}
        </p>
        <p className="text-xs text-muted mt-0.5">{parlay.combinedDecimal}x return</p>
      </div>
    </div>
  );
}

// ─── Value spotter placeholder ────────────────────────────────────────

function ValueSpotter() {
  return (
    <div className="card p-5 border-dashed opacity-50">
      <p className="text-xs text-muted uppercase tracking-widest mb-2">Value Spotter — Coming Soon</p>
      <p className="text-sm text-muted">
        Connects to OddsAPI to flag picks where cappers have significantly better lines than current market.
        Add <code className="text-violet text-xs">NEXT_PUBLIC_ODDS_API_KEY</code> to .env.local to enable.
      </p>
    </div>
  );
}

// ─── Main dashboard export ────────────────────────────────────────────

export interface AnalyticsDashboardProps {
  result: ParseResult;
  allPicks: ParsedPick[];
  historicalData: Array<Record<string, string | number>>;
  allCappers: string[];
  onSave: () => void;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveError?: string;
}

export default function AnalyticsDashboard({
  result, allPicks, historicalData, allCappers,
  onSave, saveState, saveError,
}: AnalyticsDashboardProps) {
  const [capperSearch, setCapperSearch] = useState('');
  const [visibleCappers, setVisibleCappers] = useState<string[]>(allCappers);

  // Sync visible cappers when allCappers list changes
  useEffect(() => { setVisibleCappers(allCappers); }, [allCappers]);

  const consensus = buildConsensus(allPicks);
  const parlay    = buildParlay(consensus);

  function toggleCapper(c: string) {
    setVisibleCappers(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  return (
    <div className="space-y-8 pb-16">

      {/* Capper header */}
      <div className="flex flex-wrap items-center gap-3 animate-fade-up">
        <h2 className="text-xl font-semibold">{result.capper}</h2>
        {result.capperRecord && (
          <span className="text-xs text-muted bg-surface border border-white/8 px-2 py-1 rounded-full">
            {result.capperRecord} record
          </span>
        )}
        {result.capperSpecialLabel && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-electric/20 text-violet border border-electric/30 font-medium">
            {result.capperSpecialLabel}
          </span>
        )}
        <span className="ml-auto text-xs text-muted">{result.picks.length} picks parsed</span>
      </div>

      {/* Conflicts */}
      <ConflictAlerts picks={allPicks} />

      {/* Row 1 */}
      <Section title="Today's Picks" delay={40}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <PicksTable picks={result.picks} />
          <ConsensusBar consensus={consensus} />
        </div>
      </Section>

      {/* Row 2 */}
      <Section title="Capper Performance — Last 30 Days" delay={80}>
        <PerformanceTimeline
          historicalData={historicalData}
          allCappers={allCappers}
          visibleCappers={visibleCappers}
          onToggle={toggleCapper}
          search={capperSearch}
          onSearch={setCapperSearch}
        />
      </Section>

      {/* Row 3 */}
      <Section title="Breakdown" delay={120}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SportDonut picks={allPicks} />
          <UnitsDistribution picks={allPicks} />
        </div>
      </Section>

      {/* Row 4 */}
      <Section title="Consensus Score Cards" delay={160}>
        <ConsensusCards consensus={consensus} />
      </Section>

      {/* Row 5 */}
      <Section title="Risk & Parlay" delay={200}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <UnitRiskSummary picks={allPicks} />
          <ParlayBuilder parlay={parlay} />
        </div>
      </Section>

      {/* Value spotter */}
      <div className="animate-fade-up" style={{ animationDelay: '240ms' }}>
        <ValueSpotter />
      </div>

      {/* Save button */}
      <div className="flex flex-col items-center gap-3 pt-6 animate-fade-up" style={{ animationDelay: '280ms' }}>
        {saveState === 'saved' ? (
          <p className="text-zest font-medium">✓ {result.picks.length} picks saved to Supabase</p>
        ) : (
          <button
            onClick={onSave}
            disabled={saveState === 'saving'}
            className="btn-amber px-16 text-base"
          >
            {saveState === 'saving' ? 'Saving…' : 'Save Data for Today'}
          </button>
        )}
        {saveState === 'error' && saveError && (
          <p className="text-red-400 text-xs">{saveError}</p>
        )}
      </div>
    </div>
  );
}
