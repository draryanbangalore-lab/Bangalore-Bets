import { ParsedPick, SpecialLabel } from './parseCapperText';

// ─── Types ──────────────────────────────────────────────────────────

export interface ConsensusPick {
  key: string;
  team: string;
  opponent?: string;
  betType: string;
  line?: number;
  overUnder?: 'over' | 'under';
  sport?: string;
  cappers: string[];
  totalUnits: number;
  avgOdds: number;
  specialLabels: SpecialLabel[];
  tier: 1 | 2 | 3;   // 1 = 4+ cappers, 2 = 2–3, 3 = 1
  straightCount: number;
  parlayCount: number;
}

export interface Conflict {
  game: string;
  side1: { team: string; cappers: string[] };
  side2: { team: string; cappers: string[] };
}

export interface SportBreakdown {
  sport: string;
  count: number;
  units: number;
  color: string;
}

export interface ParlayLeg {
  team: string;
  betType: string;
  line?: number;
  odds: number;
  cappers: string[];
  units: number;
}

export interface ParlayResult {
  legs: ParlayLeg[];
  combinedOdds: number;
  combinedDecimal: number;
}

export interface UnitRisk {
  sport: string;
  totalUnits: number;
  pickCount: number;
  podUnits: number;
}

// ─── Sport colors ────────────────────────────────────────────────────

const SPORT_COLORS: Record<string, string> = {
  MLB:   '#6c3bff',
  NBA:   '#f59e0b',
  NFL:   '#22ff73',
  NHL:   '#32f3e9',
  WNBA:  '#863bff',
  NCAAF: '#f66f81',
  NCAAB: '#b39aff',
  UFC:   '#da8b17',
  MLS:   '#00B442',
  Other: '#867e8e',
};

export function sportColor(sport: string | undefined): string {
  return SPORT_COLORS[sport?.toUpperCase() ?? ''] ?? SPORT_COLORS.Other;
}

// ─── Team name normalization ──────────────────────────────────────────
// Strips city/location prefixes so "San Antonio Spurs" and "Spurs" produce
// the same consensus key. Display names keep the original first-seen string.

const LOCATION_PREFIXES = [
  'new york', 'los angeles', 'la', 'san antonio', 'san francisco',
  'golden state', 'oklahoma city', 'new orleans', 'kansas city',
  'tampa bay', 'green bay', 'new england', 'san diego', 'st. louis', 'st louis',
  'las vegas', 'salt lake', 'washington', 'washington dc',
  'new jersey', 'ny', 'nyc', 'phx', 'philly',
  'charlotte', 'portland', 'phoenix', 'detroit', 'boston', 'miami',
  'chicago', 'dallas', 'houston', 'denver', 'atlanta', 'cleveland',
  'indiana', 'minnesota', 'utah', 'orlando', 'sacramento', 'memphis',
  'milwaukee', 'brooklyn', 'philadelphia', 'toronto', 'montreal',
  'seattle', 'cincinnati', 'pittsburgh', 'baltimore', 'arizona',
  'colorado', 'oakland', 'texas', 'tampa', 'florida', 'carolina',
  'jacksonville', 'tennessee', 'buffalo', 'new mexico',
].sort((a, b) => b.length - a.length); // longest first to match greedily

const TEAM_ALIASES: Record<string, string> = {
  // ── MLB full names → nickname ──
  'arizona diamondbacks': 'diamondbacks',
  'atlanta braves':       'braves',
  'baltimore orioles':    'orioles',
  'boston red sox':       'red sox',
  'chicago cubs':         'cubs',
  'chicago white sox':    'white sox',
  'cincinnati reds':      'reds',
  'cleveland guardians':  'guardians',
  'colorado rockies':     'rockies',
  'detroit tigers':       'tigers',
  'houston astros':       'astros',
  'kansas city royals':   'royals',
  'los angeles angels':   'angels',
  'los angeles dodgers':  'dodgers',
  'miami marlins':        'marlins',
  'milwaukee brewers':    'brewers',
  'minnesota twins':      'twins',
  'new york mets':        'mets',
  'new york yankees':     'yankees',
  'oakland athletics':    'athletics',
  'philadelphia phillies':'phillies',
  'pittsburgh pirates':   'pirates',
  'san diego padres':     'padres',
  'san francisco giants': 'giants',
  'seattle mariners':     'mariners',
  'st. louis cardinals':  'cardinals',
  'st louis cardinals':   'cardinals',
  'tampa bay rays':       'rays',
  'texas rangers':        'rangers',
  'toronto blue jays':    'blue jays',
  'washington nationals': 'nationals',
  // ── NBA full names → nickname ──
  'atlanta hawks':            'hawks',
  'boston celtics':           'celtics',
  'brooklyn nets':            'nets',
  'charlotte hornets':        'hornets',
  'chicago bulls':            'bulls',
  'cleveland cavaliers':      'cavaliers',
  'dallas mavericks':         'mavericks',
  'denver nuggets':           'nuggets',
  'detroit pistons':          'pistons',
  'golden state warriors':    'warriors',
  'houston rockets':          'rockets',
  'indiana pacers':           'pacers',
  'los angeles clippers':     'clippers',
  'los angeles lakers':       'lakers',
  'memphis grizzlies':        'grizzlies',
  'miami heat':               'heat',
  'milwaukee bucks':          'bucks',
  'minnesota timberwolves':   'timberwolves',
  'new orleans pelicans':     'pelicans',
  'new york knicks':          'knicks',
  'oklahoma city thunder':    'thunder',
  'orlando magic':            'magic',
  'philadelphia 76ers':       '76ers',
  'phoenix suns':             'suns',
  'portland trail blazers':   'trail blazers',
  'sacramento kings':         'kings',
  'san antonio spurs':        'spurs',
  'toronto raptors':          'raptors',
  'utah jazz':                'jazz',
  'washington wizards':       'wizards',
  // ── NFL full names → nickname ──
  'arizona cardinals':        'cardinals',
  'atlanta falcons':          'falcons',
  'baltimore ravens':         'ravens',
  'buffalo bills':            'bills',
  'carolina panthers':        'panthers',
  'chicago bears':            'bears',
  'cincinnati bengals':       'bengals',
  'cleveland browns':         'browns',
  'dallas cowboys':           'cowboys',
  'denver broncos':           'broncos',
  'detroit lions':            'lions',
  'green bay packers':        'packers',
  'houston texans':           'texans',
  'indianapolis colts':       'colts',
  'jacksonville jaguars':     'jaguars',
  'kansas city chiefs':       'chiefs',
  'las vegas raiders':        'raiders',
  'los angeles chargers':     'chargers',
  'los angeles rams':         'rams',
  'miami dolphins':           'dolphins',
  'minnesota vikings':        'vikings',
  'new england patriots':     'patriots',
  'new orleans saints':       'saints',
  'new york giants':          'giants',
  'new york jets':            'jets',
  'philadelphia eagles':      'eagles',
  'pittsburgh steelers':      'steelers',
  'san francisco 49ers':      '49ers',
  'seattle seahawks':         'seahawks',
  'tampa bay buccaneers':     'buccaneers',
  'tennessee titans':         'titans',
  'washington commanders':    'commanders',
  // ── NHL full names → nickname ──
  'anaheim ducks':            'ducks',
  'arizona coyotes':          'coyotes',
  'boston bruins':            'bruins',
  'buffalo sabres':           'sabres',
  'calgary flames':           'flames',
  'carolina hurricanes':      'hurricanes',
  'chicago blackhawks':       'blackhawks',
  'colorado avalanche':       'avalanche',
  'columbus blue jackets':    'blue jackets',
  'dallas stars':             'stars',
  'detroit red wings':        'red wings',
  'edmonton oilers':          'oilers',
  'florida panthers':         'panthers',
  'los angeles kings':        'kings',
  'minnesota wild':           'wild',
  'montreal canadiens':       'canadiens',
  'nashville predators':      'predators',
  'new jersey devils':        'devils',
  'new york islanders':       'islanders',
  'new york rangers':         'rangers',
  'ottawa senators':          'senators',
  'philadelphia flyers':      'flyers',
  'pittsburgh penguins':      'penguins',
  'san jose sharks':          'sharks',
  'seattle kraken':           'kraken',
  'st. louis blues':          'blues',
  'st louis blues':           'blues',
  'tampa bay lightning':      'lightning',
  'toronto maple leafs':      'maple leafs',
  'utah hockey club':         'utah hc',
  'vancouver canucks':        'canucks',
  'vegas golden knights':     'golden knights',
  'washington capitals':      'capitals',
  'winnipeg jets':            'jets',
  // ── Abbreviations ──
  'kc':    'chiefs',
  'ne':    'patriots',
  'gb':    'packers',
  'no':    'saints',
  'sf':    '49ers',
  'tb':    'buccaneers',
  'nyk':   'knicks',
  'gsw':   'warriors',
  'okc':   'thunder',
  'phx':   'suns',
  'nop':   'pelicans',
  'sas':   'spurs',
  'bos':   'celtics',
  'mia':   'heat',
  'dal':   'mavericks',
  'den':   'nuggets',
  'atl':   'hawks',
  'chi':   'bulls',
  'nyy':   'yankees',
  'nym':   'mets',
  'lad':   'dodgers',
  'laa':   'angels',
  'sdp':   'padres',
  'sfg':   'giants',
  'ari':   'diamondbacks',
  'dbacks':'diamondbacks',
  'd-backs':'diamondbacks',
  'chc':   'cubs',
  'chw':   'white sox',
  'cws':   'white sox',
  'mil':   'brewers',
  'cle':   'guardians',
  'kcr':   'royals',
  'oak':   'athletics',
  'tbr':   'rays',
  'bal':   'orioles',
  'wsh':   'nationals',
  'tor':   'blue jays',
  'hou':   'astros',
  'sea':   'mariners',
  'pit':   'pirates',
  'vgk':   'golden knights',
  'wpg':   'jets',
  'cbj':   'blue jackets',
  'nsh':   'predators',
  'njd':   'devils',
};

export function normalizeTeam(name: string): string {
  let s = name.toLowerCase().trim();

  // Strip leading location prefix
  for (const prefix of LOCATION_PREFIXES) {
    if (s === prefix) return s; // the name IS just a city — keep it
    if (s.startsWith(prefix + ' ')) {
      s = s.slice(prefix.length + 1).trim();
      break;
    }
  }

  // Apply alias map
  return TEAM_ALIASES[s] ?? s;
}

// ─── Consensus ───────────────────────────────────────────────────────

function pickKey(p: ParsedPick): string {
  return `${normalizeTeam(p.team)}|${p.betType}|${p.line ?? ''}|${p.overUnder ?? ''}`;
}

export function buildConsensus(picks: ParsedPick[]): ConsensusPick[] {
  const map = new Map<string, ConsensusPick>();

  for (const p of picks) {
    const key = pickKey(p);
    if (!map.has(key)) {
      map.set(key, {
        key,
        team: p.team,
        opponent: p.opponent,
        betType: p.betType,
        line: p.line,
        overUnder: p.overUnder,
        sport: p.sport,
        cappers: [],
        totalUnits: 0,
        avgOdds: 0,
        specialLabels: [],
        tier: 3,
        straightCount: 0,
        parlayCount: 0,
      });
    }
    const cp = map.get(key)!;
    if (!cp.cappers.includes(p.capper)) cp.cappers.push(p.capper);
    cp.totalUnits += p.units;
    if (p.isParlay) cp.parlayCount += 1;
    else cp.straightCount += 1;
    if (p.specialLabel && !cp.specialLabels.includes(p.specialLabel)) {
      cp.specialLabels.push(p.specialLabel);
    }
  }

  // Compute avg odds and tier
  for (const cp of map.values()) {
    const matched = picks.filter(p => pickKey(p) === cp.key && p.odds !== 0);
    cp.avgOdds = matched.length
      ? Math.round(matched.reduce((s, p) => s + p.odds, 0) / matched.length)
      : 0;
    cp.tier = cp.cappers.length >= 4 ? 1 : cp.cappers.length >= 2 ? 2 : 3;
  }

  return Array.from(map.values()).sort(
    (a, b) => b.cappers.length - a.cappers.length || b.totalUnits - a.totalUnits
  );
}

// ─── Conflict detection ───────────────────────────────────────────────

export function detectConflicts(picks: ParsedPick[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const mlPicks = picks.filter(p => p.betType === 'ML' && p.opponent);

  for (let i = 0; i < mlPicks.length; i++) {
    for (let j = i + 1; j < mlPicks.length; j++) {
      const a = mlPicks[i];
      const b = mlPicks[j];

      const aTeams = new Set([a.team.toLowerCase(), (a.opponent ?? '').toLowerCase()]);
      const bTeams = new Set([b.team.toLowerCase(), (b.opponent ?? '').toLowerCase()]);
      const sameGame = [...aTeams].every(t => bTeams.has(t)) && aTeams.size === bTeams.size && aTeams.size === 2;
      const differentSide = a.team.toLowerCase() !== b.team.toLowerCase();

      if (sameGame && differentSide) {
        // Merge into existing conflict if same game already logged
        const existing = conflicts.find(c => c.game.toLowerCase().includes(a.team.toLowerCase()));
        if (existing) {
          if (!existing.side1.cappers.includes(a.capper)) existing.side1.cappers.push(a.capper);
          if (!existing.side2.cappers.includes(b.capper)) existing.side2.cappers.push(b.capper);
        } else {
          conflicts.push({
            game: `${a.team} vs ${a.opponent}`,
            side1: { team: a.team, cappers: [a.capper] },
            side2: { team: b.team, cappers: [b.capper] },
          });
        }
      }
    }
  }

  // Also detect Over vs Under conflicts
  const totalPicks = picks.filter(p => p.betType === 'total');
  for (let i = 0; i < totalPicks.length; i++) {
    for (let j = i + 1; j < totalPicks.length; j++) {
      const a = totalPicks[i];
      const b = totalPicks[j];
      if (a.line === b.line && a.overUnder !== b.overUnder) {
        conflicts.push({
          game: `${a.line} total`,
          side1: { team: `Over ${a.line}`, cappers: [a.capper] },
          side2: { team: `Under ${b.line}`, cappers: [b.capper] },
        });
      }
    }
  }

  return conflicts;
}

// ─── Sport breakdown ──────────────────────────────────────────────────

export function buildSportBreakdown(picks: ParsedPick[]): SportBreakdown[] {
  const map = new Map<string, SportBreakdown>();

  for (const p of picks) {
    const sport = p.sport ?? 'Other';
    if (!map.has(sport)) {
      map.set(sport, { sport, count: 0, units: 0, color: sportColor(sport) });
    }
    const s = map.get(sport)!;
    s.count++;
    s.units += p.units;
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// ─── Unit risk ────────────────────────────────────────────────────────

export function buildUnitRisk(picks: ParsedPick[]): UnitRisk[] {
  const map = new Map<string, UnitRisk>();

  for (const p of picks) {
    const sport = p.sport ?? 'Other';
    if (!map.has(sport)) {
      map.set(sport, { sport, totalUnits: 0, pickCount: 0, podUnits: 0 });
    }
    const r = map.get(sport)!;
    r.totalUnits += p.units;
    r.pickCount++;
    if (p.specialLabel === 'POD' || p.specialLabel === 'MAX') {
      r.podUnits += p.units;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalUnits - a.totalUnits);
}

// ─── Parlay builder ───────────────────────────────────────────────────

function americanToDecimal(american: number): number {
  if (!american) return 1;
  return american > 0 ? american / 100 + 1 : 100 / Math.abs(american) + 1;
}

function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) return 0;
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1));
}

export function buildParlay(consensus: ConsensusPick[]): ParlayResult | null {
  // Take top 3 picks that have real odds
  const legs = consensus
    .filter(cp => cp.avgOdds !== 0)
    .slice(0, 3)
    .map(cp => ({
      team:     cp.team,
      betType:  cp.betType,
      line:     cp.line,
      odds:     cp.avgOdds,
      cappers:  cp.cappers,
      units:    cp.totalUnits,
    }));

  if (legs.length < 2) return null;

  const combinedDecimal = legs.reduce(
    (acc, leg) => acc * americanToDecimal(leg.odds), 1
  );

  return {
    legs,
    combinedDecimal: Math.round(combinedDecimal * 100) / 100,
    combinedOdds: decimalToAmerican(combinedDecimal),
  };
}

// ─── Chart data helpers ───────────────────────────────────────────────

export function consensusToBarData(consensus: ConsensusPick[]) {
  return consensus.map(cp => {
    const betLabel =
      cp.betType === 'spread' && cp.line !== undefined
        ? `${cp.line > 0 ? '+' : ''}${cp.line}`
        : cp.betType === 'total' && cp.line !== undefined
        ? `${cp.overUnder ?? ''} ${cp.line}`.trim()
        : 'ML';

    return {
      name:          cp.team.length > 14 ? cp.team.slice(0, 13) + '…' : cp.team,
      fullName:      cp.team,
      betLabel,
      cappers:       cp.cappers.length,
      capperNames:   cp.cappers,
      units:         Math.round(cp.totalUnits * 10) / 10,
      fill:          cp.tier === 1 ? '#22ff73' : cp.tier === 2 ? '#f59e0b' : '#3b3440',
      straightCount: cp.straightCount,
      parlayCount:   cp.parlayCount,
      hasParlay:     cp.parlayCount > 0,
    };
  });
}
