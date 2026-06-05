'use client';

import { useState, useMemo, useEffect } from 'react';
import { parseCapperText, cleanCapperText, ParseResult, ParsedPick } from '@/lib/parseCapperText';
import { supabase } from '@/lib/supabase';
import AnalyticsDashboard from './AnalyticsDashboard';

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type InputTab  = 'capper' | 'personal';

interface DbPick {
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
}

function dbPickToParsed(dp: DbPick): ParsedPick {
  return {
    capper:       dp.capper_name,
    team:         dp.team,
    opponent:     dp.opponent ?? undefined,
    betType:      dp.bet_type as ParsedPick['betType'],
    line:         dp.line ?? undefined,
    overUnder:    dp.over_under as ParsedPick['overUnder'],
    odds:         dp.odds,
    units:        dp.units,
    sport:        dp.sport ?? undefined,
    specialLabel: dp.special_label as ParsedPick['specialLabel'],
    raw:          dp.team,
  };
}

function fmtPickLabel(p: ParsedPick): string {
  if (p.betType === 'spread' && p.line !== undefined)
    return `${p.line > 0 ? '+' : ''}${p.line}`;
  if (p.betType === 'total' && p.line !== undefined)
    return `${p.overUnder ?? ''} ${p.line}`.trim();
  return 'ML';
}

function pickFingerprint(p: ParsedPick): string {
  return `${p.capper.toLowerCase()}|${p.team.toLowerCase()}|${p.betType}|${p.line ?? ''}|${p.overUnder ?? ''}`;
}

function parsePersonalPicks(raw: string): ParsedPick[] {
  if (!raw.trim()) return [];
  // Prepend "Personal" so the parser uses it as the capper name
  const result = parseCapperText(`Personal\n${raw.trim()}`);
  return result.picks.map(p => ({ ...p, capper: 'Personal', isPersonal: true }));
}

export default function AnalyzePage() {
  const [raw, setRaw]               = useState('');
  const [personalRaw, setPersonalRaw] = useState('');
  const [inputTab, setInputTab]     = useState<InputTab>('capper');
  const [result, setResult]         = useState<ParseResult | null>(null);
  const [allPicks, setAllPicks]     = useState<ParsedPick[]>([]);
  const [historical, setHistorical] = useState<Array<Record<string, string | number>>>([]);
  const [allCappers, setAllCappers] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [saveState, setSaveState]   = useState<SaveState>('idle');
  const [saveError, setSaveError]   = useState('');
  const [capperStats, setCapperStats] = useState<Record<string, { wins: number; total: number }>>({});
  const [activeTab, setActiveTab]   = useState<'input' | 'analytics'>('input');

  // ── Daily session accumulation ──────────────────────────────────────
  const [sessionDate, setSessionDate]         = useState(localDateStr());
  const sessionKey = `ct_session_${sessionDate}`;
  const [sessionPicks, setSessionPicks]       = useState<ParsedPick[]>([]);
  const [pasteCount, setPasteCount]           = useState(0);
  const [lastAdded, setLastAdded]             = useState<{ count: number; skipped: number; cappers: string[] } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSkipped, setShowSkipped]           = useState(false);

  useEffect(() => {
    // Reset session state when date changes before re-fetching
    setSessionPicks([]);
    setPasteCount(0);
    setLastAdded(null);
    setResult(null);
    setAllPicks([]);

    async function restoreSession() {
      try {
        const stored = localStorage.getItem(sessionKey);
        const storedPicks: ParsedPick[] = stored ? (JSON.parse(stored).picks ?? []) : [];
        const count: number             = stored ? (JSON.parse(stored).count ?? 0) : 0;

        if (storedPicks.length > 0) {
          setSessionPicks(storedPicks);
          setPasteCount(count);
        }

        // Fetch DB picks for the selected date to merge with session
        const { data: dbToday } = await supabase
          .from('picks')
          .select('capper_name,team,opponent,bet_type,line,over_under,odds,units,sport,special_label')
          .eq('pick_date', sessionDate);

        const dbParsed = (dbToday ?? []).map(dbPickToParsed);
        const sessionFps = new Set(storedPicks.map(pickFingerprint));
        const dbFiltered = dbParsed.filter(p => !sessionFps.has(pickFingerprint(p)));
        const combined   = [...storedPicks, ...dbFiltered];

        // Fetch 30-day history for performance timeline + capperStats
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: dbHistory } = await supabase
          .from('picks')
          .select('capper_name,result,pick_date')
          .gte('pick_date', thirtyDaysAgo.toISOString().split('T')[0])
          .in('result', ['win', 'loss'])
          .order('pick_date', { ascending: true });

        const histCaps = [...new Set((dbHistory ?? []).map((r: { capper_name: string }) => r.capper_name))];
        const sessionCapperNames = [...new Set(storedPicks.map(p => p.capper))].filter(Boolean);
        const cappers = [...new Set([...sessionCapperNames, ...histCaps])].filter(Boolean);

        const timelineMap = new Map<string, Record<string, string | number>>();
        const restoredCapperStats: Record<string, { wins: number; total: number }> = {};
        for (const row of dbHistory ?? []) {
          const r = row as { capper_name: string; result: string; pick_date: string };
          if (!restoredCapperStats[r.capper_name]) restoredCapperStats[r.capper_name] = { wins: 0, total: 0 };
          restoredCapperStats[r.capper_name].total++;
          if (r.result === 'win') restoredCapperStats[r.capper_name].wins++;
          if (!timelineMap.has(r.pick_date)) timelineMap.set(r.pick_date, { date: r.pick_date });
          const point = timelineMap.get(r.pick_date)!;
          const stats  = restoredCapperStats[r.capper_name];
          point[r.capper_name] = Math.round((stats.wins / stats.total) * 100);
        }

        if (combined.length > 0) {
          // Synthesize a ParseResult so the Analytics dashboard can render
          const syntheticResult: ParseResult = {
            capper:             sessionCapperNames[0] ?? 'Session',
            capperSpecialLabel: null,
            picks:              storedPicks,
            skippedLines:       [],
            selfReportedRecords: [],
          };
          setResult(syntheticResult);
          setAllPicks(combined);
          setHistorical(Array.from(timelineMap.values()) as Array<Record<string, string | number>>);
          setAllCappers(cappers);
          setCapperStats(restoredCapperStats);
        }
      } catch (err) {
        console.error('[restoreSession]', err);
      }
    }
    restoreSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDate]);

  const cleanResult    = useMemo(() => cleanCapperText(raw), [raw]);
  const personalPicks  = useMemo(() => parsePersonalPicks(personalRaw), [personalRaw]);
  const canAnalyze     = (raw.trim().length > 0 || personalPicks.length > 0) && !isAnalyzing;

  async function handleAnalyze() {
    if (!canAnalyze) return;
    setIsAnalyzing(true);
    setSaveState('idle');

    const parsed: ParseResult = raw.trim()
      ? parseCapperText(raw)
      : { capper: '', capperSpecialLabel: null, picks: [], skippedLines: [], selfReportedRecords: [] };

    const { data: dbToday } = await supabase
      .from('picks')
      .select('capper_name,team,opponent,bet_type,line,over_under,odds,units,sport,special_label')
      .eq('pick_date', sessionDate);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: dbHistory } = await supabase
      .from('picks')
      .select('capper_name,result,pick_date')
      .gte('pick_date', thirtyDaysAgo.toISOString().split('T')[0])
      .in('result', ['win', 'loss'])
      .order('pick_date', { ascending: true });

    const dbParsed = (dbToday ?? []).map(dbPickToParsed);

    // ── Merge new picks into session (dedup by fingerprint) ──────────
    const existingFps   = new Set(sessionPicks.map(pickFingerprint));
    const freshPicks    = parsed.picks.filter(p => !existingFps.has(pickFingerprint(p)));
    const skippedCount  = parsed.picks.length - freshPicks.length;
    const updatedSession = [...sessionPicks, ...freshPicks];
    const newPasteCount  = pasteCount + 1;

    localStorage.setItem(sessionKey, JSON.stringify({ picks: updatedSession, count: newPasteCount }));
    setSessionPicks(updatedSession);
    setPasteCount(newPasteCount);
    setLastAdded({
      count:   freshPicks.length,
      skipped: skippedCount,
      cappers: [...new Set(freshPicks.map(p => p.capper))].filter(Boolean),
    });

    // Dedup DB picks against session so they don't double-count
    const sessionFps = new Set(updatedSession.map(pickFingerprint));
    const dbFiltered = dbParsed.filter(p => !sessionFps.has(pickFingerprint(p)));
    const combined   = [...updatedSession, ...personalPicks, ...dbFiltered];

    const histCaps = [...new Set((dbHistory ?? []).map((r: { capper_name: string }) => r.capper_name))];
    const cappers  = [...new Set([parsed.capper, ...histCaps])].filter(Boolean);

    const timelineMap = new Map<string, Record<string, string | number>>();
    const newCapperStats: Record<string, { wins: number; total: number }> = {};
    for (const row of dbHistory ?? []) {
      const r = row as { capper_name: string; result: string; pick_date: string };
      if (!newCapperStats[r.capper_name]) newCapperStats[r.capper_name] = { wins: 0, total: 0 };
      newCapperStats[r.capper_name].total++;
      if (r.result === 'win') newCapperStats[r.capper_name].wins++;
      if (!timelineMap.has(r.pick_date)) timelineMap.set(r.pick_date, { date: r.pick_date });
      const point = timelineMap.get(r.pick_date)!;
      const stats  = newCapperStats[r.capper_name];
      point[r.capper_name] = Math.round((stats.wins / stats.total) * 100);
    }

    // result.picks = what shows in PicksTable:
    //   - "My Picks" tab → personal picks (with MY PICK badge)
    //   - "Capper" tab   → capper's parsed picks
    const displayResult: ParseResult = {
      capper:             inputTab === 'personal' ? 'My Picks' : (parsed.capper || 'My Picks'),
      capperSpecialLabel: parsed.capperSpecialLabel,
      ...(parsed.capperRecord ? { capperRecord: parsed.capperRecord } : {}),
      picks:              inputTab === 'personal' ? personalPicks : parsed.picks,
      skippedLines:       parsed.skippedLines,
      selfReportedRecords: parsed.selfReportedRecords,
    };

    setResult(displayResult);
    setAllPicks(combined);
    setHistorical(Array.from(timelineMap.values()) as Array<Record<string, string | number>>);
    setAllCappers(cappers);
    setCapperStats(newCapperStats);
    setIsAnalyzing(false);
    setRaw('');           // clear textarea so next capper paste is fresh
    setActiveTab('analytics');
  }

  async function handleSave() {
    if (!result || result.picks.length === 0) return;
    // Only save capper picks (not personal — those flow through confirmBet)
    const capperPicks = result.picks.filter(p => !p.isPersonal);
    if (capperPicks.length === 0) return;
    setSaveState('saving');
    setSaveError('');
    try {
      const { data: capper, error: capperErr } = await supabase
        .from('cappers')
        .upsert({ name: result.capper }, { onConflict: 'name' })
        .select('id')
        .single();
      if (capperErr) throw capperErr;

      // Persist self-reported record if extracted from this message (silently ignore if column missing)
      if (result.capperRecord && capper) {
        await supabase.from('cappers')
          .update({ self_reported_record: result.capperRecord })
          .eq('id', capper.id);
      }

      const rows = capperPicks.map(p => ({
        capper_id:     capper.id,
        capper_name:   p.capper,
        team:          p.team,
        opponent:      p.opponent ?? null,
        bet_type:      p.betType,
        line:          p.line ?? null,
        over_under:    p.overUnder ?? null,
        odds:          p.odds,
        units:         p.units,
        sport:         p.sport ?? null,
        special_label: p.specialLabel,
        raw_text:      p.raw,
        pick_date:     sessionDate,
      }));
      const { error: picksErr } = await supabase.from('picks').insert(rows);
      if (picksErr) throw picksErr;
      setSaveState('saved');
    } catch (err: unknown) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  function handleClearDay() {
    localStorage.removeItem(sessionKey);
    setSessionPicks([]);
    setPasteCount(0);
    setLastAdded(null);
    setResult(null);
    setAllPicks([]);
    setRaw('');
    setSaveState('idle');
    setShowClearConfirm(false);
    setActiveTab('input');
  }

  const sessionCappers = [...new Set(sessionPicks.map(p => p.capper))].filter(Boolean);

  return (
    <main className="flex-1 w-full max-w-[1600px] mx-auto px-8 py-12">

      {/* ── Confirm clear modal ── */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="card p-6 max-w-sm w-full">
            <p className="text-ink font-semibold mb-2">Clear today&apos;s session?</p>
            <p className="text-sub text-sm mb-5">
              This will remove all {sessionPicks.length} pick{sessionPicks.length !== 1 ? 's' : ''} from{' '}
              {sessionCappers.length} capper{sessionCappers.length !== 1 ? 's' : ''} collected today. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={handleClearDay} className="btn-primary flex-1 py-2.5">Yes, clear it</button>
              <button onClick={() => setShowClearConfirm(false)} className="btn-ghost flex-1 py-2.5">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header + persistent tab toggle ── */}
      <div className="mb-8 animate-fade-up">
        <p className="table-header mb-2">Capper Tracker</p>
        <div className="flex items-end justify-between gap-4 mb-6">
          <h1 className="page-title">Analyze Picks</h1>
        </div>
        <div className="flex gap-1 bg-midnight rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('input')}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'input'
                ? 'bg-electric/20 text-violet border border-electric/30'
                : 'text-sub hover:text-ink'
            }`}
          >
            Input
          </button>
          <button
            onClick={() => allPicks.length > 0 && setActiveTab('analytics')}
            disabled={allPicks.length === 0}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'analytics'
                ? 'bg-electric/20 text-violet border border-electric/30'
                : allPicks.length > 0
                ? 'text-sub hover:text-ink'
                : 'text-muted opacity-40 cursor-not-allowed'
            }`}
          >
            Analytics
            {allPicks.length > 0 && (
              <span className="text-[10px] bg-electric/25 text-violet px-1.5 py-0.5 rounded-full font-bold leading-none">
                {allPicks.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ══ INPUT TAB ══════════════════════════════════════════════════════ */}
      <div className={`flex flex-col${activeTab !== 'input' ? ' hidden' : ''}`}>

          {/* Date selector + session banner */}
          <div className="mb-5 flex items-center gap-3 animate-fade-up">
            <div className="flex items-center gap-2 bg-surface border border-white/10 rounded-xl px-4 py-2.5">
              <span className="table-header shrink-0">Session date</span>
              <input
                type="date"
                value={sessionDate}
                max={localDateStr()}
                onChange={e => e.target.value && setSessionDate(e.target.value)}
                className="bg-transparent text-base text-ink font-mono outline-none cursor-pointer"
              />
            </div>
            {sessionDate !== localDateStr() && (
              <button
                onClick={() => setSessionDate(localDateStr())}
                className="text-xs text-muted hover:text-ink border border-white/10 rounded-lg px-3 py-2 transition-colors"
              >
                Back to today
              </button>
            )}
          </div>

          {sessionPicks.length > 0 && (
            <div className="mb-5 rounded-xl border border-electric/20 bg-electric/5 px-5 py-3 flex items-center justify-between animate-fade-up">
              <div>
                <p className="text-sm text-sub">
                  <span className="font-semibold text-ink">
                    Session for {sessionDate === localDateStr() ? 'today' : sessionDate}:
                  </span>{' '}
                  {sessionPicks.length} pick{sessionPicks.length !== 1 ? 's' : ''} from{' '}
                  <span className="text-violet">{sessionCappers.length} capper{sessionCappers.length !== 1 ? 's' : ''}</span>{' '}
                  across {pasteCount} paste{pasteCount !== 1 ? 's' : ''}
                </p>
                {lastAdded && lastAdded.count > 0 && (
                  <p className="text-xs text-muted mt-0.5">
                    Last: <span className="text-zest">{lastAdded.count}</span> picks added from{' '}
                    {lastAdded.cappers.join(', ')}
                    {lastAdded.skipped > 0 ? ` · ${lastAdded.skipped} duplicate${lastAdded.skipped !== 1 ? 's' : ''} skipped` : ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="text-xs text-ruby hover:text-red-400 font-semibold ml-4 shrink-0 transition-colors"
              >
                Clear Day
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 animate-fade-up" style={{ animationDelay: '40ms' }}>
            {/* Input area */}
            <div className="lg:col-span-3 flex flex-col">
              <div className="card p-7 flex flex-col flex-1">

                {/* Sub-tab toggle */}
                <div className="flex gap-1 bg-midnight rounded-xl p-1 mb-5 self-start">
                  {([['capper', 'Capper Message'], ['personal', 'My Picks']] as [InputTab, string][]).map(([id, label]) => (
                    <button key={id} onClick={() => setInputTab(id)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                        inputTab === id
                          ? 'bg-electric/20 text-violet border border-electric/30'
                          : 'text-sub hover:text-ink'
                      }`}>
                      {label}
                      {id === 'personal' && personalPicks.length > 0 && (
                        <span className="ml-2 text-xs bg-amber/20 text-amber px-1.5 py-0.5 rounded-full font-bold">
                          {personalPicks.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Capper Message sub-tab */}
                {inputTab === 'capper' && (
                  <textarea
                    id="paste" value={raw} onChange={e => setRaw(e.target.value)}
                    className="w-full flex-1 bg-transparent text-base text-ink placeholder:text-muted resize-none outline-none font-mono leading-relaxed min-h-[320px]"
                    placeholder={"🔮Hammering Hank\nPadres ML +130 3U\nRed Sox ML -129 3U\nReds ML -118 3U"}
                  />
                )}

                {/* My Picks sub-tab */}
                {inputTab === 'personal' && (
                  <div className="flex flex-col flex-1">
                    <textarea
                      value={personalRaw} onChange={e => setPersonalRaw(e.target.value)}
                      className="w-full bg-transparent text-base text-ink placeholder:text-muted resize-none outline-none font-mono leading-relaxed min-h-[200px]"
                      placeholder={"Dodgers ML -130 2U\nCubs Over 8.5 -115 1U\nSpurs -4.5 +105 2U"}
                    />
                    {personalPicks.length > 0 && (
                      <div className="mt-5 border-t border-white/7 pt-4">
                        <p className="text-xs text-muted uppercase tracking-widest mb-3">
                          {personalPicks.length} pick{personalPicks.length !== 1 ? 's' : ''} ready
                        </p>
                        <div className="space-y-2">
                          {personalPicks.map((p, i) => (
                            <div key={i} className="flex items-center gap-3 bg-midnight rounded-lg px-3 py-2.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/20 text-amber border border-amber/40 font-bold shrink-0">MY PICK</span>
                              <span className="text-sm text-ink font-medium flex-1 truncate">{p.team}</span>
                              <span className="text-xs text-muted shrink-0">{fmtPickLabel(p)}</span>
                              {p.odds !== 0 && (
                                <span className={`text-xs font-mono font-semibold shrink-0 ${p.odds > 0 ? 'text-zest' : 'text-sub'}`}>
                                  {p.odds > 0 ? '+' : ''}{p.odds}
                                </span>
                              )}
                              <span className="text-xs text-muted shrink-0">{p.units}U</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Noise indicator */}
              {inputTab === 'capper' && cleanResult.removedCount > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted">
                    ✦ Cleaned {cleanResult.removedCount} line{cleanResult.removedCount !== 1 ? 's' : ''} of noise
                  </p>
                  {cleanResult.suspiciousLines.length > 0 && (
                    <div className="rounded-xl border border-amber/30 bg-amber/5 px-4 py-3">
                      <p className="text-xs text-amber font-semibold mb-2">
                        ⚠ {cleanResult.suspiciousLines.length} stripped line{cleanResult.suspiciousLines.length !== 1 ? 's' : ''} may contain picks — verify manually
                      </p>
                      <div className="space-y-0.5">
                        {cleanResult.suspiciousLines.map((line, i) => (
                          <p key={i} className="text-xs text-amber/70 font-mono truncate">{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button onClick={handleAnalyze} disabled={!canAnalyze} className="btn-primary w-full mt-4 py-4 text-lg">
                {isAnalyzing ? 'Analyzing…' : 'Analyze Picks'}
              </button>
            </div>

            {/* Guide panel */}
            <div className="lg:col-span-2 flex flex-col gap-5">
              {inputTab === 'capper' ? (
                <>
                  <div className="card p-7 flex-1">
                    <p className="table-header mb-5">Supported Formats</p>
                    <div className="space-y-5">
                      {[
                        { label: 'Simple ML',     example: '🔮Hammering Hank\nPadres ML +130 3U\nRed Sox ML -129 3U' },
                        { label: 'Team vs Team',  example: '🔮Porter Picks\nPhillies (-1.5) (+150) over Padres (3-UNITS)' },
                        { label: 'Tier Headers',  example: '🔮TheGamblingGawd\n5U Plays:\nHurricanes ML (POD) -155\n1U Plays:\nDodgers Over 9 -102' },
                        { label: 'Sport Headers', example: '🔮Porter Picks\nNY METS (+115) over Mariners (3-UNITS)\nWNBA\nSEATTLE STORM (+12.5) over Wings (2-UNITS)' },
                      ].map(f => (
                        <div key={f.label}>
                          <p className="text-sm font-semibold text-violet mb-2">{f.label}</p>
                          <pre className="text-xs text-sub font-mono leading-relaxed bg-midnight rounded-lg px-4 py-3 whitespace-pre-wrap">{f.example}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="card p-7">
                    <p className="table-header mb-4">Auto-detected Labels</p>
                    <div className="flex flex-wrap gap-2">
                      {['POD','MAX','MAX BET','BEST BET','POTD'].map(l => (
                        <span key={l} className="text-sm px-3 py-1.5 rounded-lg bg-amber/15 text-amber border border-amber/20 font-semibold">{l}</span>
                      ))}
                    </div>
                    <p className="text-sm text-sub mt-4 leading-relaxed">
                      Detected anywhere in the pick line and flagged on every card.
                    </p>
                  </div>
                </>
              ) : (
                <div className="card p-7 flex-1">
                  <p className="table-header mb-5">My Picks Format</p>
                  <p className="text-sm text-sub mb-5 leading-relaxed">
                    Enter one pick per line using the same format as capper messages. Your picks show a gold{' '}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/20 text-amber border border-amber/40 font-bold align-middle">MY PICK</span>{' '}
                    badge and count toward consensus alongside capper picks.
                  </p>
                  <div className="space-y-4">
                    {[
                      { label: 'Moneyline',     example: 'Dodgers ML -130 2U' },
                      { label: 'Spread',        example: 'Chiefs -3.5 -110 1U' },
                      { label: 'Total',         example: 'Over 8.5 Cubs Brewers -115 1U' },
                      { label: 'Special label', example: 'Yankees ML -145 3U (POD)' },
                    ].map(f => (
                      <div key={f.label}>
                        <p className="text-sm font-semibold text-violet mb-1.5">{f.label}</p>
                        <pre className="text-xs text-sub font-mono leading-relaxed bg-midnight rounded-lg px-4 py-3 whitespace-pre-wrap">{f.example}</pre>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted mt-5">
                    Personal picks are tracked via &ldquo;Confirm Bet&rdquo; on the consensus cards — not the Save button (which is for capper data).
                  </p>
                </div>
              )}
            </div>
          </div>
      </div>

      {/* ══ ANALYTICS TAB ══════════════════════════════════════════════════ */}
      {allPicks.length > 0 && (
        <div className={activeTab !== 'analytics' ? 'hidden' : ''}>
          {/* Analytics action row */}
          <div className="flex items-center gap-3 mb-6 animate-fade-up">
            <button
              onClick={() => setActiveTab('input')}
              className="btn-ghost text-sm py-2 px-4 shrink-0"
            >
              ← Add Picks
            </button>
            <div className="flex-1 min-w-0">
              {lastAdded && (
                <p className="text-sm text-sub truncate">
                  {lastAdded.count > 0
                    ? <>Added <span className="text-zest font-semibold">{lastAdded.count}</span> pick{lastAdded.count !== 1 ? 's' : ''}{lastAdded.cappers.length > 0 ? ` from ${lastAdded.cappers.join(', ')}` : ''}.{lastAdded.skipped > 0 ? ` Skipped ${lastAdded.skipped} dupe${lastAdded.skipped !== 1 ? 's' : ''}.` : ''}</>
                    : lastAdded.skipped > 0
                    ? <>All {lastAdded.skipped} pick{lastAdded.skipped !== 1 ? 's' : ''} already in session.</>
                    : 'No new picks in this paste.'
                  }
                  {' '}<span className="text-muted">{sessionPicks.length} picks · {sessionCappers.length} cappers today.</span>
                </p>
              )}
            </div>
            {personalPicks.length > 0 && (
              <span className="text-xs text-amber font-semibold shrink-0 flex items-center gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/20 text-amber border border-amber/40 font-bold">MY PICK</span>
                {personalPicks.length}
              </span>
            )}
            {saveState === 'saved' && (
              <span className="text-zest text-sm font-medium shrink-0">✓ Saved</span>
            )}
          </div>

          {/* Skipped lines disclosure */}
          {result && result.skippedLines.length > 0 && (
            <div className="mb-5 animate-fade-up">
              <button
                onClick={() => setShowSkipped(v => !v)}
                className="text-xs text-muted hover:text-sub transition-colors"
              >
                {showSkipped ? '▾' : '▸'} {result.skippedLines.length} line{result.skippedLines.length !== 1 ? 's' : ''} skipped (no betting signals)
              </button>
              {showSkipped && (
                <div className="mt-2 rounded-xl border border-white/7 bg-midnight px-4 py-3 space-y-1">
                  {result.skippedLines.map((l, i) => (
                    <p key={i} className="text-xs text-muted font-mono truncate">{l}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="animate-fade-up" style={{ animationDelay: '20ms' }}>
              <AnalyticsDashboard
                result={result}
                allPicks={allPicks}
                historicalData={historical}
                allCappers={allCappers}
                capperStats={capperStats}
              />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
