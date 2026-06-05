'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { sportColor } from '@/lib/analytics';

// ─── Types ────────────────────────────────────────────────────────

interface Pick {
  id: string;
  capper_name: string;
  team: string;
  opponent: string | null;
  bet_type: string;
  line: number | null;
  over_under: string | null;
  odds: number;
  units: number;
  sport: string | null;
  special_label: string | null;
  result: string;
  units_won: number | null;
  pick_date: string;
  cost_dollars: number | null;
  user_confirmed: boolean;
}

interface SportStat {
  sport: string;
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  units_won: number;
  color: string;
}

interface CapperRecord {
  name: string;
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  units_won: number;
  winRate: number | null;
  roi: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────

function fmtOdds(o: number) { return !o ? '—' : o > 0 ? `+${o}` : `${o}`; }
function fmtBet(p: Pick) {
  if (p.bet_type === 'spread' && p.line != null) return `${p.line > 0 ? '+' : ''}${p.line}`;
  if (p.bet_type === 'total'  && p.line != null) return `${p.over_under} ${p.line}`;
  return 'ML';
}
function fmtPnL(n: number) { return `${n >= 0 ? '+' : '−'}$${Math.abs(Math.round(n * 100) / 100).toFixed(2)}`; }

function pnlColor(n: number) {
  if (n > 0) return 'text-zest';
  if (n < 0) return 'text-red-400';
  return 'text-sub';
}

function winRatePct(wins: number, graded: number) {
  return graded > 0 ? Math.round((wins / graded) * 100) : null;
}

// ─── Sport stats computation ──────────────────────────────────────

function computeSportStats(picks: Pick[]): SportStat[] {
  const map = new Map<string, SportStat>();
  for (const p of picks) {
    const sport = p.sport ?? 'Other';
    if (!map.has(sport)) {
      map.set(sport, { sport, total: 0, wins: 0, losses: 0, pushes: 0, pending: 0, units_won: 0, color: sportColor(sport) });
    }
    const s = map.get(sport)!;
    s.total++;
    if (p.result === 'win')  { s.wins++;   s.units_won += p.units_won ?? 0; }
    if (p.result === 'loss') { s.losses++;  s.units_won += p.units_won ?? 0; }
    if (p.result === 'push') { s.pushes++;  }
    if (p.result === 'pending') s.pending++;
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

// ─── Capper records computation ───────────────────────────────────

function computeCapperRecords(picks: Pick[]): CapperRecord[] {
  const map = new Map<string, CapperRecord>();
  for (const p of picks) {
    if (!map.has(p.capper_name)) {
      map.set(p.capper_name, { name: p.capper_name, total: 0, wins: 0, losses: 0, pushes: 0, units_won: 0, winRate: null, roi: null });
    }
    const r = map.get(p.capper_name)!;
    r.total++;
    if (p.result === 'win')  { r.wins++;   r.units_won += p.units_won ?? 0; }
    if (p.result === 'loss') { r.losses++;  r.units_won += p.units_won ?? 0; }
    if (p.result === 'push') r.pushes++;
  }
  for (const r of map.values()) {
    const graded = r.wins + r.losses;
    r.winRate = winRatePct(r.wins, graded);
    const wagered = r.total;
    r.roi = wagered > 0 ? Math.round((r.units_won / wagered) * 100 * 10) / 10 : null;
  }
  return Array.from(map.values()).sort((a, b) => (b.winRate ?? -999) - (a.winRate ?? -999));
}

// ─── Daily P&L computation ────────────────────────────────────────

function computeDailyPnL(picks: Pick[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of picks) {
    if (p.result === 'pending' || p.units_won == null) continue;
    const cur = map.get(p.pick_date) ?? 0;
    map.set(p.pick_date, cur + p.units_won);
  }
  return map;
}

// ─── Calendar heatmap ─────────────────────────────────────────────

function dayBg(pnl: number | undefined): string {
  if (pnl === undefined) return '#1a1820';
  if (Math.abs(pnl) < 0.01) return '#1e1c26';
  const intensity = Math.min(Math.abs(pnl) / 15, 1);
  const alpha = 0.18 + intensity * 0.72;
  return pnl > 0
    ? `rgba(34,255,115,${alpha.toFixed(2)})`
    : `rgba(255,75,75,${alpha.toFixed(2)})`;
}

const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function PnLCalendar({ dailyPnL }: { dailyPnL: Map<string, number> }) {
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const { year, month } = view;
  const firstDow  = new Date(year, month, 1).getDay(); // 0=Sun
  const offset    = firstDow === 0 ? 6 : firstDow - 1; // Mon-first
  const daysInMo  = new Date(year, month + 1, 0).getDate();
  const cells     = [...Array(offset).fill(null), ...Array.from({ length: daysInMo }, (_, i) => i + 1)];

  const pad = (n: number) => String(n).padStart(2, '0');

  // Monthly totals
  let monthPnL = 0;
  for (let d = 1; d <= daysInMo; d++) {
    const key = `${year}-${pad(month + 1)}-${pad(d)}`;
    monthPnL += dailyPnL.get(key) ?? 0;
  }

  function prevMonth() {
    setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  }
  function nextMonth() {
    setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });
  }

  return (
    <div className="card p-7">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="table-header mb-1">Monthly P&amp;L Calendar</p>
          <p className="section-title">{MONTHS[month]} {year}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`stat-num text-2xl ${pnlColor(monthPnL)}`}>
            {fmtPnL(monthPnL)}
          </span>
          <div className="flex gap-1">
            <button onClick={prevMonth} className="btn-ghost px-3 py-2 text-lg leading-none">‹</button>
            <button onClick={nextMonth} className="btn-ghost px-3 py-2 text-lg leading-none">›</button>
          </div>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {DAYS_SHORT.map(d => (
          <div key={d} className="table-header text-center py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const key = `${year}-${pad(month + 1)}-${pad(day)}`;
          const pnl = dailyPnL.get(key);
          const isToday =
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === day;

          return (
            <div
              key={key}
              title={pnl !== undefined ? `${MONTHS[month]} ${day}: ${fmtPnL(pnl)}` : `${MONTHS[month]} ${day}`}
              className="relative rounded-lg aspect-square flex flex-col items-center justify-center cursor-default transition-transform hover:scale-105"
              style={{ background: dayBg(pnl) }}
            >
              <span className={`text-sm font-medium ${isToday ? 'text-amber' : pnl !== undefined ? '#E8E8E8' : 'text-muted'}`}
                style={{ color: pnl !== undefined && !isToday ? '#E8E8E8' : undefined }}>
                {day}
              </span>
              {pnl !== undefined && (
                <span className={`text-[9px] font-mono font-semibold ${pnl >= 0 ? 'text-zest' : 'text-red-400'}`}>
                  {pnl >= 0 ? '+' : '−'}${Math.abs(Math.round(pnl * 10) / 10).toFixed(0)}
                </span>
              )}
              {isToday && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-amber" />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-5 text-sm text-sub">
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded" style={{ background: 'rgba(34,255,115,0.7)' }} />
          Profitable day
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded" style={{ background: 'rgba(255,75,75,0.7)' }} />
          Loss day
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-surface border border-white/10" />
          No graded picks
        </span>
      </div>
    </div>
  );
}

// ─── Sport drill-down panel ───────────────────────────────────────

function SportDrillDown({ stat, picks, onClose }: {
  stat: SportStat;
  picks: Pick[];
  onClose: () => void;
}) {
  const sportPicks = picks.filter(p => (p.sport ?? 'Other') === stat.sport);
  const graded = stat.wins + stat.losses;
  const wr = winRatePct(stat.wins, graded);

  // Top cappers for this sport
  const capperMap = new Map<string, { wins: number; losses: number }>();
  for (const p of sportPicks) {
    if (!capperMap.has(p.capper_name)) capperMap.set(p.capper_name, { wins: 0, losses: 0 });
    const c = capperMap.get(p.capper_name)!;
    if (p.result === 'win') c.wins++;
    if (p.result === 'loss') c.losses++;
  }
  const topCappers = Array.from(capperMap.entries())
    .map(([name, s]) => ({ name, ...s, total: s.wins + s.losses }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 5);

  return (
    <div className="card p-7 animate-fade-up border-l-2" style={{ borderLeftColor: stat.color }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="table-header mb-1">Drill-down</p>
          <h3 className="section-title" style={{ color: stat.color }}>{stat.sport}</h3>
        </div>
        <button onClick={onClose} className="btn-ghost px-4 py-2">← Back</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Picks', value: stat.total },
          { label: 'Win Rate',    value: wr != null ? `${wr}%` : '—', hi: wr != null && wr >= 55 ? 'text-zest' : wr != null && wr < 45 ? 'text-red-400' : '' },
          { label: 'Record',      value: `${stat.wins}-${stat.losses}` },
          { label: 'Net P&L',     value: fmtPnL(stat.units_won), hi: pnlColor(stat.units_won) },
        ].map(s => (
          <div key={s.label} className="card px-5 py-4">
            <p className="table-header mb-2">{s.label}</p>
            <p className={`stat-num text-3xl ${s.hi ?? ''}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {topCappers.length > 0 && (
        <div>
          <p className="table-header mb-4">Top Cappers — {stat.sport}</p>
          <div className="space-y-2">
            {topCappers.map(c => {
              const wr2 = winRatePct(c.wins, c.total);
              return (
                <div key={c.name} className="flex items-center gap-4 text-base">
                  <span className="text-ink font-medium w-40 truncate">{c.name}</span>
                  <span className="text-sub">{c.wins}-{c.losses}</span>
                  <span className={`font-semibold font-mono ml-auto ${
                    wr2 != null && wr2 >= 55 ? 'text-zest' :
                    wr2 != null && wr2 < 45  ? 'text-red-400' : 'text-sub'
                  }`}>
                    {wr2 != null ? `${wr2}%` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sport pie chart ──────────────────────────────────────────────

function SportPieChart({ stats, onSelect }: {
  stats: SportStat[];
  onSelect: (s: SportStat) => void;
}) {
  const data = stats.map(s => ({
    name: s.sport,
    value: s.total,
    color: s.color,
    stat: s,
  }));

  return (
    <div className="card p-7">
      <p className="table-header mb-1">All-Time Picks by Sport</p>
      <p className="section-title mb-6">Sport Performance</p>

      <div className="flex gap-6">
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                innerRadius={65}
                outerRadius={115}
                paddingAngle={2}
                onClick={(d) => { const s = (d as unknown as { stat?: SportStat }).stat; if (s) onSelect(s); }}
                style={{ cursor: 'pointer' }}
              >
                {data.map((e, i) => (
                  <Cell key={i} fill={e.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="card px-4 py-3 text-sm">
                      <p className="font-semibold text-base text-ink mb-1">{payload[0].name}</p>
                      <p className="text-sub">{payload[0].value} picks</p>
                      {(() => {
                        const s = stats.find(x => x.sport === payload[0].name);
                        const graded = (s?.wins ?? 0) + (s?.losses ?? 0);
                        const wr = winRatePct(s?.wins ?? 0, graded);
                        return wr != null ? <p className="text-zest font-semibold">{wr}% win rate</p> : null;
                      })()}
                      <p className="text-sub text-xs mt-1">Click to drill down →</p>
                    </div>
                  ) : null
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Sport stats table */}
        <div className="w-56 flex flex-col justify-center space-y-2">
          {stats.map(s => {
            const graded = s.wins + s.losses;
            const wr = winRatePct(s.wins, graded);
            return (
              <button
                key={s.sport}
                onClick={() => onSelect(s)}
                className="flex items-center gap-3 text-left w-full hover:bg-white/5 rounded-lg px-2 py-1.5 transition-colors group"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-base text-ink font-medium flex-1 truncate group-hover:text-amber transition-colors">{s.sport}</span>
                <span className="text-sm text-sub tabular-nums">{s.total}p</span>
                <span className={`text-sm font-semibold font-mono w-12 text-right ${
                  wr != null && wr >= 55 ? 'text-zest' :
                  wr != null && wr < 45  ? 'text-red-400' : 'text-sub'
                }`}>
                  {wr != null ? `${wr}%` : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Capper records table ─────────────────────────────────────────

type CapperSort = 'winRate' | 'roi' | 'wins' | 'total' | 'pnl';

function CapperRecordsTable({ picks }: { picks: Pick[] }) {
  const [sport,   setSport]   = useState('');
  const [betType, setBetType] = useState('');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [sort,    setSort]    = useState<CapperSort>('winRate');

  const sports   = [...new Set(picks.map(p => p.sport).filter(Boolean))] as string[];
  const betTypes = ['ML', 'spread', 'total'];

  const filtered = useMemo(() => picks.filter(p => {
    if (sport && p.sport !== sport) return false;
    if (betType && p.bet_type !== betType.toLowerCase()) return false;
    if (from && p.pick_date < from) return false;
    if (to   && p.pick_date > to)   return false;
    return true;
  }), [picks, sport, betType, from, to]);

  const records = useMemo(() => {
    const base = computeCapperRecords(filtered);
    return [...base].sort((a, b) => {
      if (sort === 'winRate') return (b.winRate ?? -999) - (a.winRate ?? -999);
      if (sort === 'roi')     return (b.roi ?? -999) - (a.roi ?? -999);
      if (sort === 'wins')    return b.wins - a.wins;
      if (sort === 'total')   return b.total - a.total;
      return b.units_won - a.units_won;
    });
  }, [filtered, sort]);

  const SORT_COLS: { key: CapperSort; label: string }[] = [
    { key: 'winRate', label: 'Win %'  },
    { key: 'roi',     label: 'ROI'    },
    { key: 'wins',    label: 'Wins'   },
    { key: 'total',   label: 'Picks'  },
    { key: 'pnl',     label: 'P&L'   },
  ];

  return (
    <div className="card p-7">
      <p className="table-header mb-1">All-Time Records</p>
      <p className="section-title mb-6">Capper Historical Performance</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={sport} onChange={e => setSport(e.target.value)}
          className="bg-midnight border border-white/10 rounded-xl px-4 py-2.5 text-base text-ink outline-none focus:border-electric/50 cursor-pointer">
          <option value="">All Sports</option>
          {sports.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={betType} onChange={e => setBetType(e.target.value)}
          className="bg-midnight border border-white/10 rounded-xl px-4 py-2.5 text-base text-ink outline-none focus:border-electric/50 cursor-pointer">
          <option value="">All Bet Types</option>
          {betTypes.map(b => <option key={b}>{b}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="bg-midnight border border-white/10 rounded-xl px-4 py-2.5 text-base text-ink outline-none focus:border-electric/50" />
        <span className="self-center text-sub">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="bg-midnight border border-white/10 rounded-xl px-4 py-2.5 text-base text-ink outline-none focus:border-electric/50" />
        {(sport || betType || from || to) && (
          <button onClick={() => { setSport(''); setBetType(''); setFrom(''); setTo(''); }}
            className="btn-ghost px-4 py-2.5 text-sm">Clear</button>
        )}
      </div>

      {/* Sort tabs */}
      <div className="flex gap-1 mb-5 p-1 bg-midnight rounded-xl w-fit">
        {SORT_COLS.map(c => (
          <button key={c.key} onClick={() => setSort(c.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              sort === c.key ? 'bg-electric text-white' : 'text-sub hover:text-ink'
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/7">
              {['#', 'Capper', 'Picks', 'W-L-P', 'Win Rate', 'ROI', 'Net P&L'].map(h => (
                <th key={h} className="table-header text-left px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={r.name} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-4 text-sub text-base tabular-nums">{i + 1}</td>
                <td className="px-4 py-4 font-semibold text-lg text-ink">{r.name}</td>
                <td className="px-4 py-4 text-base text-sub tabular-nums">{r.total}</td>
                <td className="px-4 py-4 font-mono text-base text-ink">{r.wins}-{r.losses}-{r.pushes}</td>
                <td className="px-4 py-4">
                  <span className={`font-mono font-bold text-xl ${
                    r.winRate != null && r.winRate >= 55 ? 'text-zest' :
                    r.winRate != null && r.winRate < 45  ? 'text-red-400' : 'text-sub'
                  }`}>
                    {r.winRate != null ? `${r.winRate}%` : '—'}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={`font-mono font-bold text-xl ${r.roi != null && r.roi > 0 ? 'text-zest' : r.roi != null && r.roi < 0 ? 'text-red-400' : 'text-sub'}`}>
                    {r.roi != null ? `${r.roi > 0 ? '+' : ''}${r.roi}%` : '—'}
                  </span>
                </td>
                <td className={`px-4 py-4 font-mono font-bold text-xl tabular-nums ${pnlColor(r.units_won)}`}>
                  {fmtPnL(r.units_won)}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sub text-base">No cappers match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Best bets archive ────────────────────────────────────────────

function BestBetsArchive({ picks }: { picks: Pick[] }) {
  const [dateFilter, setDateFilter] = useState('');

  const bestBets = picks
    .filter(p => p.special_label)
    .filter(p => !dateFilter || p.pick_date >= dateFilter)
    .sort((a, b) => b.pick_date.localeCompare(a.pick_date));

  return (
    <div className="card p-7">
      <p className="table-header mb-1">Special Picks Only</p>
      <p className="section-title mb-2">Best Bets Archive</p>
      <p className="text-base text-sub mb-6">Every POD, MAX, BEST BET, and POTD ever entered — and whether it hit.</p>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2 text-sub text-base">
          <span>Since</span>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="bg-midnight border border-white/10 rounded-xl px-4 py-2.5 text-base text-ink outline-none focus:border-electric/50" />
        </div>
        {dateFilter && (
          <button onClick={() => setDateFilter('')} className="btn-ghost px-3 py-2 text-sm">Clear</button>
        )}
        <span className="ml-auto text-sub text-base">{bestBets.length} best bets</span>
      </div>

      {bestBets.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-sub">
          <div className="text-4xl opacity-25">⭐</div>
          <p className="text-base">No POD/MAX picks yet.</p>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/7">
                {['Date', 'Capper', 'Pick', 'Bet', 'Odds', 'Cost', 'Label', 'Result', 'P&L'].map(h => (
                  <th key={h} className="table-header text-left px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bestBets.map(p => {
                const won = p.units_won ?? 0;
                return (
                  <tr key={p.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-4 text-sub text-sm tabular-nums">{p.pick_date}</td>
                    <td className="px-4 py-4 text-violet text-base">{p.capper_name}</td>
                    <td className="px-4 py-4">
                      <span className="font-semibold text-base text-ink">{p.team}</span>
                      {p.sport && <span className="ml-2 text-xs text-violet">{p.sport}</span>}
                    </td>
                    <td className="px-4 py-4 text-sub text-base">{fmtBet(p)}</td>
                    <td className="px-4 py-4">
                      <span className={`font-mono font-semibold text-base ${p.odds > 0 ? 'text-zest' : 'text-ink'}`}>
                        {fmtOdds(p.odds)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sub text-base">${p.units}</td>
                    <td className="px-4 py-4">
                      <span className="text-sm px-2.5 py-1 rounded-lg bg-amber/15 text-amber border border-amber/20 font-semibold">
                        {p.special_label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {p.result === 'pending' ? (
                        <span className="text-sub text-sm">Pending</span>
                      ) : (
                        <span className={`text-sm font-semibold px-2.5 py-1 rounded-lg ${
                          p.result === 'win'  ? 'bg-zest/15 text-zest' :
                          p.result === 'loss' ? 'bg-red-500/15 text-red-400' :
                                                'bg-nickel/60 text-sub'
                        }`}>
                          {p.result.charAt(0).toUpperCase() + p.result.slice(1)}
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-4 font-mono font-bold text-lg tabular-nums ${
                      p.result === 'pending' ? 'text-sub' : pnlColor(won)
                    }`}>
                      {p.result === 'pending' ? '—' : fmtPnL(won)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── All bets archive ─────────────────────────────────────────────

function AllBetsArchive({ picks, onRemove }: { picks: Pick[]; onRemove: (id: string) => void }) {
  const [sport,     setSport]     = useState('');
  const [capper,    setCapper]    = useState('');
  const [result,    setResult]    = useState('');
  const [from,      setFrom]      = useState('');
  const [to,        setTo]        = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const sports  = [...new Set(picks.map(p => p.sport).filter(Boolean))] as string[];
  const cappers = [...new Set(picks.map(p => p.capper_name).filter(Boolean))].sort();

  const filtered = useMemo(() => picks.filter(p => {
    if (sport  && p.sport !== sport) return false;
    if (capper && p.capper_name !== capper) return false;
    if (result && p.result !== result) return false;
    if (from   && p.pick_date < from) return false;
    if (to     && p.pick_date > to)   return false;
    return true;
  }), [picks, sport, capper, result, from, to]);

  const hasFilters = sport || capper || result || from || to;

  function fmtEntry(p: Pick) {
    if (p.result === 'pending') return '—';
    const n = p.units_won ?? 0;
    if (p.cost_dollars != null) return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;
    return `${n >= 0 ? '+' : ''}${Math.round(n * 100) / 100}U`;
  }

  function fmtCost(p: Pick) {
    if (p.cost_dollars != null) return `$${p.cost_dollars.toFixed(2)}`;
    return `$${p.units.toFixed(2)}`;
  }

  return (
    <div className="card p-7">
      <p className="table-header mb-1">Complete Record</p>
      <p className="section-title mb-2">All Bets Archive</p>
      <p className="text-base text-sub mb-6">Every pick ever entered. Remove any entry permanently.</p>

      <div className="flex flex-wrap gap-3 mb-6">
        <select value={sport} onChange={e => setSport(e.target.value)}
          className="bg-midnight border border-white/10 rounded-xl px-4 py-2.5 text-base text-ink outline-none focus:border-electric/50 cursor-pointer">
          <option value="">All Sports</option>
          {sports.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={capper} onChange={e => setCapper(e.target.value)}
          className="bg-midnight border border-white/10 rounded-xl px-4 py-2.5 text-base text-ink outline-none focus:border-electric/50 cursor-pointer">
          <option value="">All Cappers</option>
          {cappers.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={result} onChange={e => setResult(e.target.value)}
          className="bg-midnight border border-white/10 rounded-xl px-4 py-2.5 text-base text-ink outline-none focus:border-electric/50 cursor-pointer">
          <option value="">All Results</option>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
          <option value="push">Push</option>
          <option value="pending">Pending</option>
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="bg-midnight border border-white/10 rounded-xl px-4 py-2.5 text-base text-ink outline-none focus:border-electric/50" />
        <span className="self-center text-sub">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="bg-midnight border border-white/10 rounded-xl px-4 py-2.5 text-base text-ink outline-none focus:border-electric/50" />
        {hasFilters && (
          <button onClick={() => { setSport(''); setCapper(''); setResult(''); setFrom(''); setTo(''); }}
            className="btn-ghost px-4 py-2.5 text-sm">Clear</button>
        )}
        <span className="ml-auto self-center text-sub text-base">{filtered.length} picks</span>
      </div>

      <div className="overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/7">
              {['Date', 'Capper', 'Team', 'Bet', 'Odds', 'Cost', 'Result', 'P&L', ''].map(h => (
                <th key={h} className="table-header text-left px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-sub text-base">No picks match filters.</td></tr>
            ) : filtered.map(p => {
              const isConfirming = confirmId === p.id;
              const pnlStr = fmtEntry(p);
              const pnlPos = (p.units_won ?? 0) >= 0;
              return (
                <tr key={p.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] group">
                  <td className="px-4 py-3 text-sub text-sm tabular-nums whitespace-nowrap">{p.pick_date}</td>
                  <td className="px-4 py-3 text-violet text-sm max-w-[120px] truncate">{p.capper_name}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-base text-ink">{p.team}</span>
                    {p.sport && <span className="ml-2 text-xs text-violet">{p.sport}</span>}
                  </td>
                  <td className="px-4 py-3 text-sub text-sm">{fmtBet(p)}</td>
                  <td className="px-4 py-3">
                    <span className={`font-mono font-semibold text-sm ${p.odds > 0 ? 'text-zest' : 'text-ink'}`}>
                      {fmtOdds(p.odds)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sub text-sm tabular-nums">{fmtCost(p)}</td>
                  <td className="px-4 py-3">
                    {p.result === 'pending' ? (
                      <span className="text-sub text-sm">Pending</span>
                    ) : (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                        p.result === 'win'  ? 'bg-zest/15 text-zest' :
                        p.result === 'loss' ? 'bg-red-500/15 text-red-400' :
                                              'bg-nickel/60 text-sub'
                      }`}>
                        {p.result.charAt(0).toUpperCase() + p.result.slice(1)}
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3 font-mono font-bold text-base tabular-nums ${
                    p.result === 'pending' ? 'text-sub' : pnlPos ? 'text-zest' : 'text-red-400'
                  }`}>
                    {pnlStr}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isConfirming ? (
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => { onRemove(p.id); setConfirmId(null); }}
                          className="text-xs px-2 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/35 font-semibold transition-all">
                          Remove
                        </button>
                        <button onClick={() => setConfirmId(null)}
                          className="text-xs px-2 py-1 rounded-lg bg-white/5 text-sub hover:text-ink transition-all">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmId(p.id)}
                        title="Remove from all analytics"
                        className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-400 text-base transition-all">
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [picks, setPicks]               = useState<Pick[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedSport, setSelectedSport] = useState<SportStat | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('picks')
        .select('*')
        .order('pick_date', { ascending: false });
      setPicks((data as Pick[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function removePick(id: string) {
    await supabase.from('picks').delete().eq('id', id);
    setPicks(prev => prev.filter(p => p.id !== id));
  }

  const sportStats = useMemo(() => computeSportStats(picks), [picks]);
  const dailyPnL   = useMemo(() => computeDailyPnL(picks), [picks]);

  // All-time summary
  const graded   = picks.filter(p => p.result !== 'pending');
  const wins     = graded.filter(p => p.result === 'win').length;
  const totalPnL = graded.reduce((s, p) => s + (p.units_won ?? 0), 0);
  const wr       = winRatePct(wins, graded.length);

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-14 space-y-10">

      {/* Page header */}
      <div className="animate-fade-up">
        <p className="table-header mb-3">Capper Tracker</p>
        <h1 className="page-title mb-3">History</h1>
        <p className="text-base text-sub">All-time records, sport breakdown, P&amp;L calendar, and best bets archive.</p>
      </div>

      {/* All-time summary bar */}
      {!loading && picks.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-up" style={{ animationDelay: '40ms' }}>
          {[
            { label: 'Total Picks',  value: picks.length.toString() },
            { label: 'All-Time W-L', value: `${wins}-${graded.length - wins}` },
            { label: 'Win Rate',     value: wr != null ? `${wr}%` : '—',
              hi: wr != null && wr >= 55 ? 'text-zest' : wr != null && wr < 45 ? 'text-red-400' : '' },
            { label: 'All-Time P&L', value: fmtPnL(totalPnL), hi: pnlColor(totalPnL) },
          ].map(s => (
            <div key={s.label} className="card px-6 py-5">
              <p className="table-header mb-2">{s.label}</p>
              <p className={`stat-xl ${s.hi ?? ''}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32 text-sub text-lg">Loading history…</div>
      ) : picks.length === 0 ? (
        <div className="flex flex-col items-center py-32 gap-4 text-sub animate-fade-up">
          <div className="text-5xl opacity-20">📊</div>
          <p className="text-lg">No picks yet. Save picks on the Analyze tab to build history.</p>
        </div>
      ) : (
        <>
          {/* Row 1: Sport pie + Calendar */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-fade-up" style={{ animationDelay: '80ms' }}>
            <SportPieChart stats={sportStats} onSelect={setSelectedSport} />
            <PnLCalendar dailyPnL={dailyPnL} />
          </div>

          {/* Sport drill-down */}
          {selectedSport && (
            <div className="animate-fade-up">
              <SportDrillDown
                stat={selectedSport}
                picks={picks}
                onClose={() => setSelectedSport(null)}
              />
            </div>
          )}

          {/* Row 2: Capper records */}
          <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
            <CapperRecordsTable picks={picks} />
          </div>

          {/* Row 3: Best bets archive */}
          <div className="animate-fade-up" style={{ animationDelay: '160ms' }}>
            <BestBetsArchive picks={picks} />
          </div>

          {/* Row 4: All bets archive */}
          <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
            <AllBetsArchive picks={picks} onRemove={removePick} />
          </div>
        </>
      )}
    </main>
  );
}
