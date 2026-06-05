'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { supabase } from '@/lib/supabase';

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

interface ActivePick {
  id: string;
  capper_id: string | null;
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
  pick_date: string;
  result: string;
  units_won: number | null;
  user_confirmed: boolean;
  cost_dollars: number | null;
  payout_dollars: number | null;
}

function calcUnitsWon(odds: number, units: number, result: string): number {
  if (result === 'push') return 0;
  if (result === 'loss') return -units;
  return odds > 0
    ? Math.round(units * (odds / 100) * 100) / 100
    : Math.round(units * (100 / Math.abs(odds)) * 100) / 100;
}

function calcDollarPnL(pick: ActivePick, result: 'win' | 'loss' | 'push'): number {
  if (result === 'push') return 0;
  if (result === 'loss') return -(pick.cost_dollars ?? pick.units);
  return (pick.payout_dollars ?? 0) - (pick.cost_dollars ?? 0);
}

function fmtOdds(o: number) { return !o ? '—' : o > 0 ? `+${o}` : `${o}`; }
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDateShort(d: string): string {
  const [, m, day] = d.split('-');
  return `${MONTHS_SHORT[parseInt(m)-1]} ${parseInt(day)}`;
}
function fmtBet(p: ActivePick) {
  if (p.bet_type === 'spread' && p.line != null) return `${p.line > 0 ? '+' : ''}${p.line}`;
  if (p.bet_type === 'total'  && p.line != null) return `${p.over_under} ${p.line}`;
  return 'ML';
}
function fmtUSD(n: number) {
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;
}

// ─── Drop zone ────────────────────────────────────────────────────────

type DropId = 'win' | 'loss' | 'push';

const DROP_CONFIG: Record<DropId, { label: string; icon: string; border: string; bg: string; text: string }> = {
  win:  { label: 'HIT',  icon: '✓', border: 'border-zest/50',    bg: 'bg-zest/10',    text: 'text-zest'    },
  loss: { label: 'MISS', icon: '✗', border: 'border-red-500/50', bg: 'bg-red-500/10', text: 'text-red-400' },
  push: { label: 'PUSH', icon: '↔', border: 'border-white/25',   bg: 'bg-white/5',    text: 'text-sub'     },
};

function DropZone({ id, disabled }: { id: DropId; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const cfg = DROP_CONFIG[id];
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 border-dashed py-8 text-center transition-all duration-200 ${
        isOver
          ? `${cfg.border} ${cfg.bg} scale-[1.03] shadow-lg`
          : 'border-white/10 hover:border-white/20'
      } ${disabled ? 'opacity-40 pointer-events-none' : ''}`}
    >
      <p className={`text-4xl mb-2 ${cfg.text}`}>{cfg.icon}</p>
      <p className={`text-sm font-bold tracking-widest ${cfg.text}`}>{cfg.label}</p>
    </div>
  );
}

// ─── Draggable pending card ───────────────────────────────────────────

function PendingCard({
  pick, grading, confirmDelete, editingDate,
  onGrade, onDelete, onConfirmDelete, onCancelDelete, onEditDate, onSaveDate,
}: {
  pick: ActivePick;
  grading: string | null;
  confirmDelete: string | null;
  editingDate: string | null;
  onGrade: (pick: ActivePick, result: 'win' | 'loss' | 'push') => void;
  onDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onEditDate: (id: string) => void;
  onSaveDate: (id: string, date: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: pick.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const isThisGrading  = grading === pick.id;
  const isConfirming   = confirmDelete === pick.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card p-5 select-none transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
    >
      {/* Drag handle strip */}
      <div
        {...listeners}
        {...attributes}
        className="flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing"
      >
        <div className="flex flex-col gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-6 h-0.5 bg-white/15 rounded" />
          ))}
        </div>
        <span className="text-[10px] text-muted uppercase tracking-widest">drag to grade</span>
      </div>

      {/* Pick info */}
      <div className="mb-3">
        <p className="font-semibold text-ink text-base leading-tight">{pick.team}</p>
        {pick.opponent && <p className="text-sub text-sm">vs {pick.opponent}</p>}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-sub bg-midnight px-2 py-0.5 rounded border border-white/7">{fmtBet(pick)}</span>
          {pick.sport && <span className="text-xs text-violet">{pick.sport}</span>}
          <span className={`text-sm font-mono font-semibold ml-auto ${pick.odds > 0 ? 'text-zest' : 'text-ink'}`}>
            {fmtOdds(pick.odds)}
          </span>
        </div>
      </div>

      {/* Capper + cost */}
      <div className="flex items-center justify-between border-t border-white/7 pt-3 mb-3">
        <span className="text-muted text-xs truncate max-w-[60%]">{pick.capper_name}</span>
        <div className="text-right">
          <span className="text-ink font-semibold text-sm">
            ${(pick.cost_dollars ?? pick.units).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Fallback grade buttons */}
      <div className="flex gap-1.5 mb-2">
        {(['win', 'loss', 'push'] as const).map(r => (
          <button key={r} onClick={() => onGrade(pick, r)} disabled={isThisGrading}
            className={`flex-1 text-xs py-1.5 rounded-lg font-semibold transition-all disabled:opacity-40 ${
              r === 'win'  ? 'bg-zest/15 text-zest hover:bg-zest/30' :
              r === 'loss' ? 'bg-red-500/15 text-red-400 hover:bg-red-500/30' :
                             'bg-nickel/60 text-sub hover:bg-nickel'
            }`}>
            {isThisGrading ? '…' : r === 'win' ? 'Hit' : r === 'loss' ? 'Miss' : 'Push'}
          </button>
        ))}
      </div>

      {/* Delete */}
      {isConfirming ? (
        <div className="flex gap-1.5 mt-1">
          <button onClick={() => onDelete(pick.id)}
            className="flex-1 text-xs py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 font-semibold transition-all">
            Delete
          </button>
          <button onClick={onCancelDelete}
            className="flex-1 text-xs py-1.5 rounded-lg bg-nickel/60 text-sub hover:bg-nickel font-semibold transition-all">
            Cancel
          </button>
        </div>
      ) : (
        <button onClick={() => onConfirmDelete(pick.id)}
          className="w-full text-xs py-1 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-all mt-1">
          Delete bet
        </button>
      )}

      {pick.special_label && (
        <div className="mt-2.5">
          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-amber/15 text-amber border border-amber/20 font-semibold">
            {pick.special_label}
          </span>
        </div>
      )}

      {/* Date edit row */}
      <div className="mt-3 pt-2.5 border-t border-white/7 flex items-center gap-1.5">
        {editingDate === pick.id ? (
          <input
            type="date"
            defaultValue={pick.pick_date}
            max={localDateStr()}
            autoFocus
            className="bg-midnight border border-electric/50 rounded-lg px-2 py-1 text-xs text-ink font-mono outline-none focus:border-electric/80"
            onChange={e => { if (e.target.value && e.target.value !== pick.pick_date) onSaveDate(pick.id, e.target.value); }}
            onBlur={() => onEditDate('')}
          />
        ) : (
          <>
            <span className="text-xs text-muted tabular-nums">{fmtDateShort(pick.pick_date)}</span>
            <button
              onClick={() => onEditDate(pick.id)}
              title="Edit date"
              className="text-[10px] text-muted/50 hover:text-violet transition-colors leading-none"
            >
              ✎
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Drag overlay ghost ───────────────────────────────────────────────

function CardGhost({ pick }: { pick: ActivePick }) {
  return (
    <div className="card p-5 shadow-2xl shadow-electric/20 rotate-2 w-64">
      <p className="font-semibold text-ink text-base">{pick.team}</p>
      <p className="text-sub text-sm mt-0.5">{fmtBet(pick)} · {fmtOdds(pick.odds)}</p>
      <p className="text-ink font-bold mt-3">${(pick.cost_dollars ?? pick.units).toFixed(2)}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

type Tab = 'all' | 'confirmed';

export default function MyBetsPage() {
  const [picks, setPicks]               = useState<ActivePick[]>([]);
  const [loading, setLoading]           = useState(true);
  const [grading, setGrading]           = useState<string | null>(null);
  const [regrading, setRegrading]       = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo]   = useState<string | null>(null);
  const [editingDate, setEditingDate]   = useState<string | null>(null);
  const [tab, setTab]                   = useState<Tab>('all');
  const [viewDate, setViewDate]         = useState(localDateStr());
  const [activePick, setActivePick]     = useState<ActivePick | null>(null);

  // P&L animation state
  const [animPnL, setAnimPnL]           = useState(0);
  const [flashResult, setFlashResult]   = useState<'win' | 'loss' | null>(null);
  const animPnLRef = useRef(0);
  const rafRef     = useRef<ReturnType<typeof requestAnimationFrame> | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('picks')
      .select('*')
      .order('pick_date', { ascending: false })
      .order('created_at', { ascending: false });
    setPicks((data as ActivePick[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── First-time grade ──────────────────────────────────────────────

  async function grade(pick: ActivePick, result: 'win' | 'loss' | 'push') {
    setGrading(pick.id);
    const unitsWon = pick.cost_dollars != null
      ? calcDollarPnL(pick, result)
      : calcUnitsWon(pick.odds, pick.units, result);

    await supabase.from('picks').update({ result, units_won: unitsWon }).eq('id', pick.id);

    const { data: pickRow } = await supabase.from('picks').select('capper_id').eq('id', pick.id).single();
    if (pickRow?.capper_id) {
      const { data: capper } = await supabase
        .from('cappers')
        .select('wins,losses,pushes,total_units_wagered,total_units_won')
        .eq('id', pickRow.capper_id)
        .single();
      if (capper) {
        await supabase.from('cappers').update({
          wins:                result === 'win'  ? capper.wins + 1   : capper.wins,
          losses:              result === 'loss' ? capper.losses + 1 : capper.losses,
          pushes:              result === 'push' ? capper.pushes + 1 : capper.pushes,
          total_units_wagered: capper.total_units_wagered + pick.units,
          total_units_won:     capper.total_units_won + unitsWon,
        }).eq('id', pickRow.capper_id);
      }
    }

    await load();
    if (result !== 'push') {
      setFlashResult(result === 'win' ? 'win' : 'loss');
      setTimeout(() => setFlashResult(null), 950);
    }
    setGrading(null);
  }

  // ── Change grade on already-graded pick ───────────────────────────

  async function regrade(pick: ActivePick, newResult: 'win' | 'loss' | 'push') {
    setGrading(pick.id);
    setRegrading(null);
    const oldResult   = pick.result as 'win' | 'loss' | 'push';
    const oldUnitsWon = pick.units_won ?? 0;
    const newUnitsWon = pick.cost_dollars != null
      ? calcDollarPnL(pick, newResult)
      : calcUnitsWon(pick.odds, pick.units, newResult);

    await supabase.from('picks').update({ result: newResult, units_won: newUnitsWon }).eq('id', pick.id);

    const { data: pickRow } = await supabase.from('picks').select('capper_id').eq('id', pick.id).single();
    if (pickRow?.capper_id) {
      const { data: capper } = await supabase
        .from('cappers')
        .select('wins,losses,pushes,total_units_wagered,total_units_won')
        .eq('id', pickRow.capper_id)
        .single();
      if (capper) {
        await supabase.from('cappers').update({
          wins:            capper.wins   - (oldResult === 'win'  ? 1 : 0) + (newResult === 'win'  ? 1 : 0),
          losses:          capper.losses - (oldResult === 'loss' ? 1 : 0) + (newResult === 'loss' ? 1 : 0),
          pushes:          capper.pushes - (oldResult === 'push' ? 1 : 0) + (newResult === 'push' ? 1 : 0),
          total_units_won: capper.total_units_won - oldUnitsWon + newUnitsWon,
        }).eq('id', pickRow.capper_id);
      }
    }

    await load();
    setGrading(null);
  }

  // ── Undo grade — move back to pending ────────────────────────────

  async function undoGrade(pick: ActivePick) {
    setGrading(pick.id);
    setConfirmUndo(null);
    const oldResult   = pick.result as 'win' | 'loss' | 'push';
    const oldUnitsWon = pick.units_won ?? 0;

    await supabase.from('picks').update({ result: 'pending', units_won: null }).eq('id', pick.id);

    const { data: pickRow } = await supabase.from('picks').select('capper_id').eq('id', pick.id).single();
    if (pickRow?.capper_id) {
      const { data: capper } = await supabase
        .from('cappers')
        .select('wins,losses,pushes,total_units_wagered,total_units_won')
        .eq('id', pickRow.capper_id)
        .single();
      if (capper) {
        await supabase.from('cappers').update({
          wins:                capper.wins   - (oldResult === 'win'  ? 1 : 0),
          losses:              capper.losses - (oldResult === 'loss' ? 1 : 0),
          pushes:              capper.pushes - (oldResult === 'push' ? 1 : 0),
          total_units_wagered: capper.total_units_wagered - pick.units,
          total_units_won:     capper.total_units_won - oldUnitsWon,
        }).eq('id', pickRow.capper_id);
      }
    }

    await load();
    setGrading(null);
  }

  // ── Delete ────────────────────────────────────────────────────────

  async function deletePick(id: string) {
    setGrading(id);
    setConfirmDelete(null);
    await supabase.from('picks').delete().eq('id', id);
    await load();
    setGrading(null);
  }

  // ── Update pick date ─────────────────────────────────────────────

  async function updatePickDate(id: string, newDate: string) {
    setEditingDate(null);
    await supabase.from('picks').update({ pick_date: newDate }).eq('id', id);
    await load();
  }

  // ── Tab filter + stats ────────────────────────────────────────────

  const visiblePicks   = tab === 'confirmed' ? picks.filter(p => p.user_confirmed) : picks;
  const confirmedCount = picks.filter(p => p.user_confirmed).length;

  const todayStr      = viewDate;
  const todayPicks    = picks.filter(p => p.user_confirmed && p.pick_date === todayStr);
  const todayPending  = todayPicks.filter(p => p.result === 'pending');
  const todayGraded   = todayPicks.filter(p => p.result !== 'pending');
  const todayWins     = todayGraded.filter(p => p.result === 'win').length;
  const todayLosses   = todayGraded.filter(p => p.result === 'loss').length;
  const todayWagered  = todayPicks.reduce((s, p) => s + (p.cost_dollars ?? p.units), 0);
  const todayNetPnL   = todayGraded.reduce((s, p) => s + (p.units_won ?? 0), 0);
  const todayPotential = todayPending.reduce(
    (s, p) => s + ((p.payout_dollars ?? 0) - (p.cost_dollars ?? 0)), 0
  );
  const todayPositive = todayNetPnL >= 0;

  // ── Animate P&L hero ──────────────────────────────────────────────

  useEffect(() => {
    const from = animPnLRef.current;
    const to   = todayNetPnL;
    if (from === to) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const t0 = performance.now();
    function tick(now: number) {
      const p      = Math.min((now - t0) / 800, 1);
      const eased  = 1 - (1 - p) ** 3;
      const val    = from + (to - from) * eased;
      animPnLRef.current = val;
      setAnimPnL(val);
      if (p < 1) { rafRef.current = requestAnimationFrame(tick); }
      else        { animPnLRef.current = to; setAnimPnL(to); }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [todayNetPnL]);

  // ── Drag handlers ─────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const pick = visiblePicks.find(p => p.id === String(event.active.id));
    setActivePick(pick ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActivePick(null);
    const { active, over } = event;
    if (!over) return;
    const pick = visiblePicks.find(p => p.id === String(active.id));
    if (!pick) return;
    const result = String(over.id) as DropId;
    if (['win', 'loss', 'push'].includes(result)) grade(pick, result);
  }

  const pending = visiblePicks.filter(p => p.result === 'pending');
  const graded  = visiblePicks.filter(p => p.result !== 'pending');

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-14">

      {/* Header */}
      <div className="mb-8 animate-fade-up">
        <p className="table-header mb-3">Capper Tracker</p>
        <h1 className="page-title mb-3">My Active Bets</h1>
        <p className="text-base text-sub">Grade picks to track your bankroll performance in real time.</p>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-3 mb-6 animate-fade-up" style={{ animationDelay: '5ms' }}>
        <div className="flex items-center gap-2 bg-surface border border-white/10 rounded-xl px-4 py-2.5">
          <span className="table-header shrink-0">Viewing</span>
          <input
            type="date"
            value={viewDate}
            max={localDateStr()}
            onChange={e => e.target.value && setViewDate(e.target.value)}
            className="bg-transparent text-base text-ink font-mono outline-none cursor-pointer"
          />
        </div>
        {viewDate !== localDateStr() && (
          <button
            onClick={() => setViewDate(localDateStr())}
            className="text-xs text-muted hover:text-ink border border-white/10 rounded-lg px-3 py-2 transition-colors"
          >
            Back to today
          </button>
        )}
      </div>

      {/* P&L hero — always shown */}
      <div className="relative card px-10 py-10 mb-8 overflow-hidden" style={{ animationDelay: '10ms' }}>
        {/* Flash overlay — separate element so it never fights with entry animation */}
        {flashResult && (
          <div
            key={flashResult + Date.now()}
            className={`absolute inset-0 rounded-[13px] pointer-events-none ${
              flashResult === 'win' ? 'flash-win' : 'flash-loss'
            }`}
          />
        )}
        <p className="table-header mb-3">
          {viewDate === localDateStr() ? "Today's P&L" : `P&L — ${viewDate}`}
        </p>
        <p className={`pnl-hero mb-3 ${todayPositive ? 'text-zest' : 'text-red-400'}`}>
          {fmtUSD(animPnL)}
        </p>
        <div className="flex flex-wrap gap-6 text-base text-sub">
          {todayWins > 0 && <span><span className="text-zest font-semibold">{todayWins}W</span></span>}
          {todayLosses > 0 && <span><span className="text-red-400 font-semibold">{todayLosses}L</span></span>}
          {todayPending.length > 0 && (
            <span><span className="text-ink font-semibold">{todayPending.length}</span> pending</span>
          )}
          {todayWagered > 0 && (
            <>
              <span className="text-muted">·</span>
              <span>${todayWagered.toFixed(2)} wagered</span>
            </>
          )}
          {todayPotential > 0 && (
            <>
              <span className="text-muted">·</span>
              <span className="text-zest/70">+${todayPotential.toFixed(2)} if all hit</span>
            </>
          )}
          {todayPicks.length === 0 && (
            <span className="text-muted text-sm">No confirmed bets yet — confirm picks on the Analyze tab.</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-4 mb-8 animate-fade-up" style={{ animationDelay: '20ms' }}>
        <div className="flex bg-surface border border-white/8 rounded-xl p-1 gap-1">
          {([['all', 'All Bets'], ['confirmed', 'My Confirmed']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === id
                  ? 'bg-electric/20 text-violet border border-electric/30'
                  : 'text-sub hover:text-ink'
              }`}>
              {label}
              {id === 'confirmed' && confirmedCount > 0 && (
                <span className="ml-2 text-xs bg-electric/30 text-violet px-1.5 py-0.5 rounded-full">
                  {confirmedCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32 text-sub text-lg">Loading bets…</div>
      ) : visiblePicks.length === 0 ? (
        <div className="flex flex-col items-center py-32 gap-4 text-sub animate-fade-up">
          <div className="text-5xl opacity-20">🎯</div>
          <p className="text-lg">
            {tab === 'confirmed'
              ? 'No confirmed picks yet. Confirm bets on the Analyze tab.'
              : 'No picks yet. Paste a capper message on the Analyze tab.'}
          </p>
        </div>
      ) : (
        <div className="space-y-10">

          {/* Pending — drag-drop */}
          {pending.length > 0 && (
            <section className="animate-fade-up" style={{ animationDelay: '80ms' }}>
              <h2 className="section-title mb-5">
                Pending
                <span className="text-sub font-normal text-xl ml-3">
                  {pending.length} bet{pending.length !== 1 ? 's' : ''}
                </span>
              </h2>

              <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                  {pending.map(p => (
                    <PendingCard
                      key={p.id} pick={p}
                      grading={grading} confirmDelete={confirmDelete} editingDate={editingDate}
                      onGrade={grade}
                      onDelete={deletePick}
                      onConfirmDelete={id => setConfirmDelete(id)}
                      onCancelDelete={() => setConfirmDelete(null)}
                      onEditDate={id => setEditingDate(id || null)}
                      onSaveDate={updatePickDate}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <DropZone id="win"  disabled={!!grading} />
                  <DropZone id="loss" disabled={!!grading} />
                  <DropZone id="push" disabled={!!grading} />
                </div>

                <DragOverlay>
                  {activePick ? <CardGhost pick={activePick} /> : null}
                </DragOverlay>
              </DndContext>
            </section>
          )}

          {/* Graded table */}
          {graded.length > 0 && (
            <section className="animate-fade-up" style={{ animationDelay: '120ms' }}>
              <h2 className="section-title mb-4">
                Graded
                <span className="text-sub font-normal text-xl ml-3">
                  {graded.length} bet{graded.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/7">
                      {['Date', 'Capper', 'Team', 'Bet', 'Odds', 'Wagered', 'Result', 'P&L', ''].map(h => (
                        <th key={h} className="table-header text-left px-5 py-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {graded.map(p => {
                      const wonUSD        = p.units_won ?? 0;
                      const isRegrading   = regrading === p.id;
                      const isDelConfirm  = confirmDelete === p.id;
                      const isUndoConfirm = confirmUndo === p.id;
                      const isThisGrading = grading === p.id;

                      return (
                        <tr key={p.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] group">
                          <td className="px-5 py-4">
                            {editingDate === p.id ? (
                              <input
                                type="date"
                                defaultValue={p.pick_date}
                                max={localDateStr()}
                                autoFocus
                                className="bg-midnight border border-electric/50 rounded-lg px-2 py-1 text-xs text-ink font-mono outline-none focus:border-electric/80 w-32"
                                onChange={e => { if (e.target.value && e.target.value !== p.pick_date) updatePickDate(p.id, e.target.value); }}
                                onBlur={() => setEditingDate(null)}
                              />
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-sub text-sm tabular-nums">{fmtDateShort(p.pick_date)}</span>
                                <button
                                  onClick={() => { setEditingDate(p.id); setRegrading(null); setConfirmDelete(null); setConfirmUndo(null); }}
                                  title="Edit date"
                                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-violet text-xs transition-all leading-none"
                                >
                                  ✎
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-violet text-base">{p.capper_name}</td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-base text-ink">{p.team}</p>
                            {p.sport && <p className="text-violet text-xs">{p.sport}</p>}
                          </td>
                          <td className="px-5 py-4 text-sub text-base">{fmtBet(p)}</td>
                          <td className="px-5 py-4">
                            <span className={`font-mono font-semibold text-base ${p.odds > 0 ? 'text-zest' : 'text-ink'}`}>
                              {fmtOdds(p.odds)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sub text-base">
                            ${(p.cost_dollars ?? p.units).toFixed(2)}
                          </td>

                          {/* Result — shows static badge or inline regrade buttons */}
                          <td className="px-5 py-4">
                            {isRegrading ? (
                              <div className="flex gap-1">
                                {(['win', 'loss', 'push'] as const).map(r => (
                                  <button key={r} onClick={() => regrade(p, r)} disabled={isThisGrading}
                                    className={`text-xs px-2 py-1 rounded-lg font-semibold transition-all disabled:opacity-40 ${
                                      r === 'win'  ? 'bg-zest/20 text-zest hover:bg-zest/35' :
                                      r === 'loss' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/35' :
                                                     'bg-nickel/60 text-sub hover:bg-nickel'
                                    }`}>
                                    {isThisGrading ? '…' : r === 'win' ? 'Hit' : r === 'loss' ? 'Miss' : 'Push'}
                                  </button>
                                ))}
                                <button onClick={() => setRegrading(null)}
                                  className="text-xs px-2 py-1 rounded-lg text-muted hover:text-ink bg-white/5 transition-all">
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold px-2.5 py-1 rounded-lg ${
                                  p.result === 'win'  ? 'bg-zest/15 text-zest' :
                                  p.result === 'loss' ? 'bg-red-500/15 text-red-400' :
                                                        'bg-nickel/60 text-sub'
                                }`}>
                                  {p.result.charAt(0).toUpperCase() + p.result.slice(1)}
                                </span>
                                <button
                                  onClick={() => { setRegrading(p.id); setConfirmDelete(null); setConfirmUndo(null); }}
                                  title="Change result"
                                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-violet text-base transition-all"
                                >
                                  ↺
                                </button>
                              </div>
                            )}
                          </td>

                          <td className={`px-5 py-4 font-mono font-bold text-lg tabular-nums ${
                            wonUSD > 0 ? 'text-zest' : wonUSD < 0 ? 'text-red-400' : 'text-sub'
                          }`}>
                            {fmtUSD(wonUSD)}
                          </td>

                          {/* Actions — undo to pending + delete */}
                          <td className="px-5 py-4 text-right">
                            {isUndoConfirm ? (
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => undoGrade(p)}
                                  className="text-xs px-2 py-1 rounded-lg bg-violet/20 text-violet hover:bg-violet/35 font-semibold transition-all">
                                  Undo
                                </button>
                                <button onClick={() => setConfirmUndo(null)}
                                  className="text-xs px-2 py-1 rounded-lg bg-white/5 text-sub hover:text-ink transition-all">
                                  Cancel
                                </button>
                              </div>
                            ) : isDelConfirm ? (
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => deletePick(p.id)}
                                  className="text-xs px-2 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/35 font-semibold transition-all">
                                  Delete
                                </button>
                                <button onClick={() => setConfirmDelete(null)}
                                  className="text-xs px-2 py-1 rounded-lg bg-white/5 text-sub hover:text-ink transition-all">
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all">
                                <button
                                  onClick={() => { setConfirmUndo(p.id); setConfirmDelete(null); setRegrading(null); }}
                                  title="Move back to pending"
                                  className="text-muted hover:text-violet text-base transition-all"
                                >
                                  ↩
                                </button>
                                <button
                                  onClick={() => { setConfirmDelete(p.id); setRegrading(null); setConfirmUndo(null); }}
                                  title="Delete bet"
                                  className="text-muted hover:text-red-400 text-base transition-all"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Session summary — always visible when confirmed picks exist */}
      {todayPicks.length > 0 && (
        <div className="mt-10 card px-8 py-6 animate-fade-up border border-white/[0.06]" style={{ animationDelay: '160ms' }}>
          <p className="table-header mb-2">Today&apos;s Session</p>
          <p className="text-ink text-base">
            <span className="font-semibold">{todayPicks.length}</span> bet{todayPicks.length !== 1 ? 's' : ''} confirmed
            {todayGraded.length > 0 && (
              <> — <span className="text-zest font-semibold">{todayWins}W</span>
              {todayLosses > 0 && <span className="text-red-400 font-semibold"> · {todayLosses}L</span>}
              {(todayGraded.length - todayWins - todayLosses) > 0 && (
                <span className="text-sub"> · {todayGraded.length - todayWins - todayLosses} push</span>
              )}
              {'. '}
              <span className={todayNetPnL >= 0 ? 'text-zest' : 'text-red-400'}>
                Net {fmtUSD(todayNetPnL)}
              </span>
              </>
            )}
            {todayPending.length > 0 && (
              <span className="text-sub"> · {todayPending.length} pending</span>
            )}
            .
          </p>
          <p className="text-muted text-sm mt-1">All data is saved automatically to your database.</p>
        </div>
      )}
    </main>
  );
}
