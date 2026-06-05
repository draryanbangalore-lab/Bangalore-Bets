export type BetType = 'ML' | 'spread' | 'total' | 'prop' | 'unknown';
export type SpecialLabel = 'POD' | 'MAX' | 'BEST BET' | 'POTD';

export interface ParsedPick {
  capper: string;
  team: string;
  opponent?: string;
  betType: BetType;
  line?: number;
  overUnder?: 'over' | 'under';
  propStat?: string;    // for prop bets: "points", "rebounds", etc.
  odds: number;
  units: number;
  sport?: string;
  specialLabel: SpecialLabel | null;
  raw: string;
  isPersonal?: boolean;
  isParlay?: boolean;
}

export interface ParseResult {
  capper: string;
  capperSpecialLabel: SpecialLabel | null;
  capperRecord?: string;   // e.g. "9-0" — from capper header parentheses
  picks: ParsedPick[];
  skippedLines: string[];  // lines with content that weren't parsed as bets
  selfReportedRecords: Array<{ capper: string; record: string }>; // brag records from body lines
}

const KNOWN_SPORTS = new Set([
  'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'WNBA',
  'MLS', 'UFC', 'PGA', 'SOCCER', 'TENNIS', 'GOLF', 'CFB', 'KBO',
]);

// ─── Team/player → sport lookup ───────────────────────────────────────────────
// Keys are lowercase. Checked against the normalized team string in parsePickLine.
// For ambiguous names (Giants, Panthers, Twins) the entry covers the most common
// context; explicit sport headers always take precedence.

const TEAM_SPORT_LOOKUP: Record<string, string> = {
  // ── MLB ──────────────────────────────────────────────────────────────
  'yankees': 'MLB', 'red sox': 'MLB', 'dodgers': 'MLB', 'cubs': 'MLB',
  'brewers': 'MLB', 'phillies': 'MLB', 'rays': 'MLB', 'astros': 'MLB',
  'braves': 'MLB', 'mets': 'MLB', 'cardinals': 'MLB', 'padres': 'MLB',
  'sf giants': 'MLB', 'giants': 'MLB', 'athletics': 'MLB', 'mariners': 'MLB',
  'tigers': 'MLB', 'royals': 'MLB', 'reds': 'MLB', 'orioles': 'MLB',
  'twins': 'MLB', 'white sox': 'MLB', 'angels': 'MLB', 'rangers': 'MLB',
  'rockies': 'MLB', 'pirates': 'MLB', 'nationals': 'MLB', 'marlins': 'MLB',
  'blue jays': 'MLB', 'guardians': 'MLB', 'diamondbacks': 'MLB',
  'd-backs': 'MLB', 'dbacks': 'MLB',
  // ── NBA ──────────────────────────────────────────────────────────────
  'lakers': 'NBA', 'celtics': 'NBA', 'warriors': 'NBA', 'bucks': 'NBA',
  'heat': 'NBA', 'nets': 'NBA', 'knicks': 'NBA', 'suns': 'NBA',
  'clippers': 'NBA', 'nuggets': 'NBA', 'spurs': 'NBA', 'mavericks': 'NBA',
  'mavs': 'NBA', 'grizzlies': 'NBA', 'hawks': 'NBA', 'raptors': 'NBA',
  'cavaliers': 'NBA', 'cavs': 'NBA', 'pistons': 'NBA', 'pacers': 'NBA',
  'bulls': 'NBA', 'hornets': 'NBA', 'magic': 'NBA', 'wizards': 'NBA',
  'thunder': 'NBA', 'trail blazers': 'NBA', 'blazers': 'NBA',
  'timberwolves': 'NBA', 'wolves': 'NBA', 'jazz': 'NBA', 'pelicans': 'NBA',
  'kings': 'NBA', 'rockets': 'NBA', '76ers': 'NBA', 'sixers': 'NBA',
  // ── NFL ──────────────────────────────────────────────────────────────
  'chiefs': 'NFL', 'eagles': 'NFL', 'cowboys': 'NFL', '49ers': 'NFL',
  'bills': 'NFL', 'ravens': 'NFL', 'bengals': 'NFL', 'browns': 'NFL',
  'steelers': 'NFL', 'patriots': 'NFL', 'jets': 'NFL', 'dolphins': 'NFL',
  'titans': 'NFL', 'colts': 'NFL', 'jaguars': 'NFL', 'texans': 'NFL',
  'broncos': 'NFL', 'raiders': 'NFL', 'chargers': 'NFL', 'seahawks': 'NFL',
  'rams': 'NFL', 'falcons': 'NFL', 'saints': 'NFL', 'panthers': 'NFL',
  'buccaneers': 'NFL', 'bucs': 'NFL', 'bears': 'NFL', 'lions': 'NFL',
  'packers': 'NFL', 'vikings': 'NFL', 'ny giants': 'NFL', 'commanders': 'NFL',
  // ── NHL ──────────────────────────────────────────────────────────────
  'oilers': 'NHL', 'maple leafs': 'NHL', 'leafs': 'NHL', 'bruins': 'NHL',
  'ny rangers': 'NHL', 'penguins': 'NHL', 'capitals': 'NHL', 'caps': 'NHL',
  'lightning': 'NHL', 'florida panthers': 'NHL', 'avalanche': 'NHL', 'avs': 'NHL',
  'stars': 'NHL', 'golden knights': 'NHL', 'la kings': 'NHL', 'ducks': 'NHL',
  'sharks': 'NHL', 'flames': 'NHL', 'canucks': 'NHL', 'winnipeg jets': 'NHL',
  'predators': 'NHL', 'preds': 'NHL', 'blues': 'NHL', 'hurricanes': 'NHL',
  'canes': 'NHL', 'blue jackets': 'NHL', 'sabres': 'NHL', 'red wings': 'NHL',
  'blackhawks': 'NHL', 'senators': 'NHL', 'sens': 'NHL', 'canadiens': 'NHL',
  'habs': 'NHL', 'devils': 'NHL', 'islanders': 'NHL', 'wild': 'NHL',
  // ── WNBA ─────────────────────────────────────────────────────────────
  'sky': 'WNBA', 'liberty': 'WNBA', 'storm': 'WNBA', 'aces': 'WNBA',
  'fever': 'WNBA', 'mystics': 'WNBA', 'sparks': 'WNBA', 'wings': 'WNBA',
  'lynx': 'WNBA', 'sun': 'WNBA', 'dream': 'WNBA', 'mercury': 'WNBA',
  // ── KBO ──────────────────────────────────────────────────────────────
  'samsung lions': 'KBO', 'lotte giants': 'KBO', 'kiwoom heroes': 'KBO',
  'lg twins': 'KBO', 'kt wiz': 'KBO', 'doosan bears': 'KBO',
  'nc dinos': 'KBO', 'ssg landers': 'KBO', 'hanwha eagles': 'KBO',
  'kia tigers': 'KBO',
  // ── NBA players ──────────────────────────────────────────────────────
  'brunson': 'NBA', 'wembanyama': 'NBA', 'towns': 'NBA', 'anunoby': 'NBA',
  'bridges': 'NBA', 'mitchell': 'NBA', 'curry': 'NBA', 'lebron': 'NBA',
  'durant': 'NBA', 'giannis': 'NBA', 'embiid': 'NBA', 'jokic': 'NBA',
  'sga': 'NBA', 'gilgeous-alexander': 'NBA', 'tatum': 'NBA', 'jaylen brown': 'NBA',
  'lillard': 'NBA', 'booker': 'NBA', 'morant': 'NBA', 'edwards': 'NBA',
  'hart': 'NBA', ' og anunoby': 'NBA', 'randle': 'NBA', 'barrett': 'NBA',
  // ── NFL players ──────────────────────────────────────────────────────
  'mahomes': 'NFL', 'jefferson': 'NFL', 'tyreek hill': 'NFL', 'chase': 'NFL',
  'mccaffrey': 'NFL', 'derrick henry': 'NFL', 'lamb': 'NFL', 'stroud': 'NFL',
  'burrow': 'NFL', 'lamar jackson': 'NFL', 'josh allen': 'NFL',
  // ── MLB players ──────────────────────────────────────────────────────
  'judge': 'MLB', 'ohtani': 'MLB', 'acuna': 'MLB', 'trout': 'MLB',
  'betts': 'MLB', 'lindor': 'MLB', 'juan soto': 'MLB',
  // ── Tennis (known player surnames) ───────────────────────────────────
  'djokovic': 'TENNIS', 'alcaraz': 'TENNIS', 'sinner': 'TENNIS',
  'medvedev': 'TENNIS', 'zverev': 'TENNIS', 'nadal': 'TENNIS',
  'federer': 'TENNIS', 'swiatek': 'TENNIS', 'sabalenka': 'TENNIS',
  'gauff': 'TENNIS', 'rybakina': 'TENNIS', 'andreeva': 'TENNIS',
  'kostyuk': 'TENNIS', 'cirstea': 'TENNIS', 'tsitsipas': 'TENNIS',
  'rune': 'TENNIS', 'fritz': 'TENNIS', 'ruud': 'TENNIS', 'tiafoe': 'TENNIS',
  'dimitrov': 'TENNIS', 'hurkacz': 'TENNIS', 'shelton': 'TENNIS',
  'berrettini': 'TENNIS', 'khachanov': 'TENNIS', 'wawrinka': 'TENNIS',
  'kerber': 'TENNIS', 'keys': 'TENNIS', 'badosa': 'TENNIS',
  'pegula': 'TENNIS', 'kvitova': 'TENNIS', 'jabeur': 'TENNIS',
  'kontaveit': 'TENNIS', 'osaka': 'TENNIS', 'halep': 'TENNIS',
  'errani': 'TENNIS', 'vavassori': 'TENNIS', 'lajal': 'TENNIS',
  'forti': 'TENNIS', 'hijikata': 'TENNIS', 'choinski': 'TENNIS',
};

// Checks the raw team/player name string against the lookup table.
// Tries exact match first, then checks if any lookup key appears as a
// whole word in the name (handles "SF Giants" → "giants" → "MLB").
function detectSportFromName(name: string): string | undefined {
  const lower = name.toLowerCase().trim();
  if (TEAM_SPORT_LOOKUP[lower]) return TEAM_SPORT_LOOKUP[lower];
  // Substring match: look for the longest key that fully appears in the name
  let best: string | undefined;
  let bestLen = 0;
  for (const key of Object.keys(TEAM_SPORT_LOOKUP)) {
    if (lower.includes(key) && key.length > bestLen) {
      best = TEAM_SPORT_LOOKUP[key];
      bestLen = key.length;
    }
  }
  return best;
}

const SPECIAL_LABEL_MAP: Array<{ pattern: RegExp; label: SpecialLabel }> = [
  { pattern: /\bPOTD\b/i, label: 'POTD' },
  { pattern: /\bPOD\b/i,  label: 'POD'  },
  { pattern: /\bMAX[-\s]BET\b/i, label: 'MAX' },
  { pattern: /\bBEST[-\s]BET\b/i, label: 'BEST BET' },
  { pattern: /\bMAX\b/i, label: 'MAX' },
];

function stripEmoji(s: string): string {
  return s.replace(/\p{Extended_Pictographic}|️|‍/gu, '').trim();
}

// Expand short Over/Under notation before all other parsing.
// O4.5 → over 4.5 | U7.5 → under 7.5
// Safe: \b ensures "2U" (unit size) and "Oklahoma" never match.
function normalizeLine(s: string): string {
  return s
    .replace(/\bO(\d+\.?\d*)\b/g, 'over $1')
    .replace(/\bU(\d+\.?\d*)\b/g, 'under $1');
}

function normalizePropStat(stat: string): string {
  const s = stat.toLowerCase().trim();
  if (/^pts?$|^points?$/.test(s))     return 'points';
  if (/^reb$|^rebounds?$/.test(s))    return 'rebounds';
  if (/^ast$|^assists?$/.test(s))     return 'assists';
  if (/^blk$|^blocks?$/.test(s))      return 'blocks';
  if (/^stl$|^steals?$/.test(s))      return 'steals';
  if (/^3pm?$|^threes?$/.test(s))     return 'threes';
  if (/^pra$/.test(s))                return 'PRA';
  return s;
}

// Returns true only if the line contains at least one unambiguous betting signal.
// Used to gate isNoiseLine and parsePickLine — anything with zero signals cannot be a bet.
function hasBettingSignal(s: string): boolean {
  // American odds (at least 2 digits after sign): +130, -142
  if (/(?<!\w)[+-]\d{2,4}(?!\d|\.\d)/.test(s)) return true;
  // ML or moneyline keyword
  if (/\b(ML|moneyline)\b/i.test(s)) return true;
  // Over/under + number (total bet)
  if (/\b(over|under)\s+\d/i.test(s)) return true;
  // Decimal spread or line: -4.5, +3.5
  if (/(?<!\w)[+-]\d{1,2}\.\d+(?!\d)/.test(s)) return true;
  // Unit size: 1U, 2.5U, (3 UNITS)
  if (/\b\d+(?:\.\d+)?\s*U\b/i.test(s)) return true;
  if (/\(\d+(?:\.\d+)?\s*-?\s*UNITS?\)/i.test(s)) return true;
  // Dollar bet size: $50
  if (/\$\d+/.test(s)) return true;
  // Sport-specific bet markers
  if (/\b(F5|ATS|RL|PL)\b/.test(s)) return true;
  // Short Over/Under notation: O4.5, U7.5, O218
  if (/\b[OU]\d+(?:\.\d+)?\b/i.test(s)) return true;
  // Player prop: "20+ points", "8.5 rebounds", "25 pts"
  if (/\b\d+(?:\.\d+)?\+?\s+(points?|pts?|rebounds?|reb|assists?|ast|blocks?|blk|steals?|stl|threes?|3pm?|pra)\b/i.test(s)) return true;
  return false;
}

function extractSpecialLabel(s: string): { text: string; label: SpecialLabel | null } {
  for (const { pattern, label } of SPECIAL_LABEL_MAP) {
    if (pattern.test(s)) {
      const text = s.replace(pattern, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
      return { text, label };
    }
  }
  return { text: s, label: null };
}

function extractUnits(s: string, fallback: number): { text: string; units: number } {
  // (3-UNITS) or (3 UNITS)
  let m = s.match(/\((\d+(?:\.\d+)?)\s*-?\s*UNITS?\)/i);
  if (m) return { text: s.replace(m[0], '').trim(), units: parseFloat(m[1]) };

  // em/en/hyphen dash before unit: – 1U, - 10U
  m = s.match(/[-–—]\s*(\d+(?:\.\d+)?)\s*U\b/i);
  if (m) return { text: s.replace(m[0], '').trim(), units: parseFloat(m[1]) };

  // standalone XU
  m = s.match(/\b(\d+(?:\.\d+)?)\s*U\b/i);
  if (m) return { text: s.replace(m[0], '').trim(), units: parseFloat(m[1]) };

  // Dollar amount as bet size: $50, $100 — stored as raw number; UI uses unitSize for display
  m = s.match(/\$(\d+(?:\.\d+)?)\b/);
  if (m) return { text: s.replace(m[0], '').trim(), units: parseFloat(m[1]) };

  return { text: s, units: fallback };
}

function extractNumbers(s: string): { text: string; nums: number[] } {
  const nums: number[] = [];

  // Parenthesized: (+150), (-1.5)
  let text = s.replace(/\(([+-]?\d+(?:\.\d+)?)\)/g, (_, n) => {
    nums.push(parseFloat(n));
    return ' ';
  });

  // Bare decimal values (spreads): -1.5, +3.5
  text = text.replace(/(?<!\w)([+-]\d+\.\d+)(?!\d)/g, (_, n) => {
    nums.push(parseFloat(n));
    return ' ';
  });

  // Bare signed integers: +130, -129 (2–4 digits)
  text = text.replace(/(?<!\w)([+-]\d{2,4})(?!\d|\.\d)/g, (_, n) => {
    nums.push(parseFloat(n));
    return ' ';
  });

  return { text: text.replace(/\s+/g, ' ').trim(), nums };
}

function classifyNums(nums: number[]): { odds: number; spread: number | null } {
  let odds = 0;
  let spread: number | null = null;

  for (const n of nums) {
    const abs = Math.abs(n);
    if (n % 1 !== 0 || abs < 30) {
      if (spread === null) spread = n;
    } else {
      if (odds === 0) odds = n;
    }
  }
  return { odds, spread };
}

function parseTierHeader(line: string): number | null {
  const m = line.match(/^(\d+(?:\.\d+)?)\s*U\s+(?:PLAYS?|BETS?|LOCKS?):?\s*$/i);
  return m ? parseFloat(m[1]) : null;
}

function isSportHeader(line: string): boolean {
  return KNOWN_SPORTS.has(line.trim().toUpperCase());
}

function parseCapperLine(line: string): { name: string; record?: string; specialLabel: SpecialLabel | null } {
  let s = stripEmoji(line).trim();
  // Extract record — handle hyphen, en-dash, em-dash variants
  const recordMatch = s.match(/\((\d+[-–—]\d+)\)/);
  const record = recordMatch ? recordMatch[1].replace(/[–—]/, '-') : undefined;
  s = s.replace(/\(\d+[-–—]\d+\)/g, '').trim();
  const { text, label } = extractSpecialLabel(s);
  return { name: text.trim(), record, specialLabel: label };
}

function parsePickLine(
  raw: string,
  capper: string,
  sport: string | undefined,
  defaultUnits: number
): ParsedPick | null {
  let s = raw.trim();
  if (!s || s.length < 3) return null;

  // Hard gate: a line with zero betting signals cannot be a bet
  if (!hasBettingSignal(s)) return null;

  // ── Player prop detection ──────────────────────────────────────────
  // Matches: "Brunson 20+ points", "Tatum 25.5 pts -115 2U", "SGA 30 PRA"
  const PROP_RE = /^(.+?)\s+(\d+(?:\.\d+)?)\+?\s+(points?|pts?|rebounds?|reb|assists?|ast|blocks?|blk|steals?|stl|threes?|3pm?|pra)\b(.*)$/i;
  const propMatch = s.match(PROP_RE);
  if (propMatch) {
    const playerName = propMatch[1].replace(/[-–—]/g, ' ').replace(/[()[\]]/g, '').trim();
    const propLine   = parseFloat(propMatch[2]);
    const propStat   = normalizePropStat(propMatch[3]);
    const rest       = propMatch[4].trim();
    const { text: restAfterLabel, label: propSpecialLabel } = extractSpecialLabel(s);
    void restAfterLabel;
    const { text: restNoUnits, units: propUnits } = extractUnits(rest, defaultUnits);
    const { nums: propNums } = extractNumbers(restNoUnits);
    const { odds: propOdds } = classifyNums(propNums);
    const resolvedSport = sport ?? detectSportFromName(playerName);
    return {
      capper,
      team:        playerName,
      betType:     'prop',
      line:        propLine,
      overUnder:   'over',   // prop "20+" means over 20
      propStat,
      odds:        propOdds,
      units:       propUnits,
      ...(resolvedSport ? { sport: resolvedSport } : {}),
      specialLabel: propSpecialLabel,
      raw,
    };
  }

  const { text: afterLabel, label: specialLabel } = extractSpecialLabel(s);
  s = afterLabel;

  // Detect Over/Under totals BEFORE using "over" as team separator
  let betType: BetType = 'unknown';
  let line: number | undefined;
  let overUnder: 'over' | 'under' | undefined;

  const totalMatch = s.match(/\b(over|under)\s+(\d+(?:\.\d+)?)\b/i);
  if (totalMatch) {
    betType = 'total';
    line = parseFloat(totalMatch[2]);
    overUnder = totalMatch[1].toLowerCase() as 'over' | 'under';
    s = s.replace(totalMatch[0], ' ').trim();
  }

  const isML = /\b(ML|moneyline)\b/i.test(s);
  if (isML) {
    s = s.replace(/\b(ML|moneyline)\b/gi, ' ').trim();
    if (betType === 'unknown') betType = 'ML';
  }

  // Split on " over " as a team separator (only when not already a total)
  let effectiveUnits = defaultUnits;
  let opponent: string | undefined;

  if (betType !== 'total') {
    const overIdx = s.search(/\s+over\s+/i);
    if (overIdx !== -1) {
      const rightPart = s.slice(overIdx).replace(/^\s+over\s+/i, '').trim();
      s = s.slice(0, overIdx).trim();
      const { text: rightNoUnits, units: rightUnits } = extractUnits(rightPart, 0);
      if (rightUnits > 0) effectiveUnits = rightUnits;
      opponent = rightNoUnits.trim() || undefined;
    }
  }

  const { text: afterUnits, units } = extractUnits(s, effectiveUnits);
  s = afterUnits;

  const { text: afterNums, nums } = extractNumbers(s);
  s = afterNums;

  const { odds, spread } = classifyNums(nums);

  if (spread !== null && betType === 'unknown') {
    betType = 'spread';
    line = spread;
  } else if (betType === 'unknown') {
    betType = 'ML';
  }

  const team = s
    .replace(/[-–—]/g, ' ')
    .replace(/[()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Reject lines with no recognizable team or data
  if (!team || team.length < 2) return null;

  // Auto-detect sport from team/player name when no header was present
  const resolvedSport = sport
    ?? detectSportFromName(team)
    ?? (opponent ? detectSportFromName(opponent) : undefined);

  return {
    capper,
    team,
    ...(opponent ? { opponent } : {}),
    betType,
    ...(line !== undefined ? { line } : {}),
    ...(overUnder ? { overUnder } : {}),
    odds,
    units,
    ...(resolvedSport ? { sport: resolvedSport } : {}),
    specialLabel,
    raw,
  };
}

// ─── Brag record extraction ───────────────────────────────────────────────────
// Called on lines before they're discarded as noise; returns the W-L record
// embedded in common brag patterns, or null if none found.

function extractBragRecord(line: string): string | null {
  // "on a 12-3 run" / "i'm 8-2 this week"
  let m = line.match(/\b(?:on a|i'?m)\s+(\d+[-–—]\d+)\b/i);
  if (m) return m[1].replace(/[–—]/, '-');
  // "12-3 on the week" / "15-5 this season"
  m = line.match(/\b(\d+[-–—]\d+)\s+(?:on the|this)\s+(?:week|month|year|season|run)\b/i);
  if (m) return m[1].replace(/[–—]/, '-');
  // Standalone record: "Record: 32-18" / "(32-18)"
  m = line.match(/^(?:record:?\s*)?\(?\d{1,3}[-–—]\d{1,3}\)?$/i);
  if (m) {
    const inner = line.match(/(\d{1,3})[-–—](\d{1,3})/);
    if (inner) return `${inner[1]}-${inner[2]}`;
  }
  return null;
}

// ─── Noise line detection ─────────────────────────────────────────────────────
// Returns true for lines that carry zero betting information and should be
// completely ignored before any other processing.

const HYPE_RE = /^(good luck|let['']s (ride|go|get it)|lfg|gl (everyone|guys)?|ride with me|easy money|lock of the day|bang|fire+|certified|released|posting|dropping|here are|check (out|em)|my plays|my picks|today i like|free (plays?|picks?)|hammer (this|these|it)|trust (me|us)|don'?t sleep( on)?|tail (this|these)|let'?s (ride|go|get it)|bet (this|these)|all (in|day)|giddy ?up|let['']?s cook|sending it|stay locked)\b/i;

function isNoiseLine(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;

  // After stripping emoji, nothing meaningful remains → noise
  const noEmoji = s.replace(/\p{Extended_Pictographic}|️|‍/gu, '').trim();
  if (!noEmoji) return true;
  // Only 1-3 punctuation/space chars left after emoji removal → noise
  if (noEmoji.length <= 3 && /^[^a-zA-Z0-9]*$/.test(noEmoji)) return true;

  // Separator lines: ---, ===, ***, ───
  if (/^[-=*─_~]{3,}$/.test(s)) return true;

  // Day-of-week lines
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(s)) return true;

  // Date patterns: "June 3", "6/3", "06/03/25", "June 3, 2025"
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}/i.test(s)) return true;
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(s)) return true;

  // Standalone record: (32-18), 32-18, Record: 32-18
  if (/^(record:?\s*)?\(?\d{1,3}[-–—]\d{1,3}\)?$/.test(s)) return true;

  // "on each", "each game", "each MLB", etc. — distribution noise
  if (/^(on each|each)\b/i.test(s) && !hasBettingSignal(s)) return true;

  // Standalone sport name only (e.g. "MLB", "NBA Tonight", "NFL Week 12")
  if (/^(MLB|NBA|NFL|NHL|WNBA|KBO|MLS|NCAAF?|NCAAB?|UFC|PGA)\b[^:]*$/i.test(s) && !hasBettingSignal(s)) return true;

  // ALL CAPS header ending in PICKS/PLAYS/LOCKS/BETS/LEANS/FADES
  if (/^[A-Z\s'&]+\s+(PICKS|PLAYS|LOCKS?|BETS?|LEANS?|FADES?|PARLAYS?)\.?$/.test(s)) return true;

  // Hype/filler phrases
  if (HYPE_RE.test(s)) return true;

  // Social handles standing alone: @username
  if (/^@[\w._]+$/.test(s)) return true;

  // URLs and invite links
  if (/^https?:\/\//i.test(s)) return true;
  if (/\b(t\.me|discord\.gg|telegram\.me|linktr\.ee)\//i.test(s)) return true;

  // Promo / follow-me phrases
  if (/\b(follow|join|sub(scribe)?)\b.{0,35}(telegram|discord|twitter|x\.com|instagram|tiktok|channel|group)\b/i.test(s)) return true;
  if (/\b(dm (me|us)|link in bio|check (my|the) (telegram|discord|twitter))\b/i.test(s)) return true;

  // Win-streak brags: "on a 12-3 run", "i'm 8-2 this week"
  if (/\b(on a|i'?m)\s+\d+[-–—]\d+\b/i.test(s)) return true;
  if (/\b\d+[-–—]\d+\s+(on the|this)\s+(week|month|year|season|run)\b/i.test(s)) return true;

  // Timestamps: "2:30 PM EST", "10:00"
  if (/^\d{1,2}:\d{2}\s*(am|pm)?\s*(e[sd]t|c[sd]t|m[sd]t|p[sd]t)?\.?$/i.test(s)) return true;

  // Disclaimer / legal lines
  if (/\b(not financial advice|gamble responsibly|(18|21)\+\s*(only)?|must be \d+\+?|please gamble)\b/i.test(s)) return true;

  // Lines starting with emoji that contain no betting signal → capper identifier / branding
  if (/^\p{Extended_Pictographic}/u.test(s) && !hasBettingSignal(s)) return true;

  // Lines ending in capper-identity words with no betting signal → header/name line
  if (/\b(picks?|caps?|capper?|plays?|card|lines?|locked?|sniper|safari|gawd|whale|sharp|profit|degens?|degenerates?)\s*$/i.test(s) && !hasBettingSignal(s)) return true;

  // Short lines (≤3 tokens) with no betting signal → almost certainly a name/header
  if (s.split(/\s+/).filter(Boolean).length <= 3 && !hasBettingSignal(s)) return true;

  return false;
}

// ─── Pre-parse cleaning (for UI indicator) ───────────────────────────────────
// Does NOT change parser behaviour — parseCapperText filters noise internally.
// Call this separately to show the user what was stripped and flag suspicious removals.

function looksLikePick(line: string): boolean {
  const s = line.trim();
  if (s.length < 5) return false;
  if (/[+-]\d{2,3}\b/.test(s)) return true;       // odds: +130, -150
  if (/\b\d+(?:\.\d+)?U\b/i.test(s)) return true; // unit size
  if (/\bML\b/.test(s)) return true;               // moneyline keyword
  if (/\b(over|under)\s+\d/i.test(s)) return true; // totals
  if (/\$\d+/.test(s)) return true;                // dollar bet size
  return false;
}

export interface CleanResult {
  removedCount: number;
  suspiciousLines: string[];
}

export function cleanCapperText(input: string): CleanResult {
  if (!input.trim()) return { removedCount: 0, suspiciousLines: [] };

  let removedCount = 0;
  const suspiciousLines: string[] = [];

  for (const line of input.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue; // blank lines don't count toward removed tally
    if (isNoiseLine(trimmed)) {
      removedCount++;
      if (looksLikePick(trimmed)) suspiciousLines.push(trimmed);
    }
  }

  return { removedCount, suspiciousLines };
}

export function parseCapperText(input: string): ParseResult {
  const rawLines = input.split('\n').map(l => l.trim());

  const picks: ParsedPick[] = [];
  const skippedLines: string[] = [];
  const selfReportedRecords: Array<{ capper: string; record: string }> = [];

  // These hold the FIRST capper's info for ParseResult (backward compat with UI)
  let firstCapperName = '';
  let firstCapperSpecialLabel: SpecialLabel | null = null;
  let firstCapperRecord: string | undefined;

  // Mutable state per capper block
  let currentCapper = '';
  let currentSport: string | undefined;
  let tierUnits = 1;
  let foundFirstCapper = false;

  for (const raw of rawLines) {
    const line = normalizeLine(raw.trim());
    if (!line) continue;

    // ── Capper header detection ─────────────────────────────────────
    // The first non-empty line is always a capper header.
    // Mid-paste: any line that starts with an emoji AND has no betting
    // signal is treated as a new capper header, not a noise discard.
    const startsWithEmoji = /^\p{Extended_Pictographic}/u.test(line);
    const isCapperHeader = !foundFirstCapper || (startsWithEmoji && !hasBettingSignal(line));

    if (isCapperHeader) {
      // Check if it's an emoji-prefixed sport label (e.g. "⚾ MLB") rather than a name
      if (startsWithEmoji && foundFirstCapper) {
        const afterEmoji = stripEmoji(line).trim().toUpperCase();
        if (KNOWN_SPORTS.has(afterEmoji)) {
          currentSport = afterEmoji;
          continue;
        }
      }

      const { name, record, specialLabel } = parseCapperLine(line);
      currentCapper = name;
      currentSport = undefined; // sport context resets for each new capper
      tierUnits = 1;

      if (!foundFirstCapper) {
        firstCapperName = name;
        firstCapperSpecialLabel = specialLabel;
        firstCapperRecord = record;
        foundFirstCapper = true;
      }
      continue;
    }

    // ── Standard noise filter for non-header lines ──────────────────
    if (isNoiseLine(line)) {
      // Before discarding, check for an embedded self-reported W-L record
      const brag = extractBragRecord(line);
      if (brag && currentCapper) selfReportedRecords.push({ capper: currentCapper, record: brag });
      continue;
    }

    if (isSportHeader(line)) {
      currentSport = line.trim().toUpperCase();
      continue;
    }

    const tierFromHeader = parseTierHeader(line);
    if (tierFromHeader !== null) {
      tierUnits = tierFromHeader;
      continue;
    }

    // ── Explicit parlay keyword: "Parlay: X + Y", "Parlay: X / Y / Z" ──
    if (/\bparlay(ing|ed|s)?\b/i.test(line)) {
      const parlayText = line
        .replace(/^\s*parlay(ing|ed|s)?:?\s*/i, '')  // strip leading "Parlay:"
        .replace(/\bparlay\b/gi, '')                  // strip trailing "parlay"
        .trim();
      const legs = parlayText.split(/\s+[+/]\s+/);
      for (const leg of legs) {
        const pick = parsePickLine(leg.trim(), currentCapper, currentSport, tierUnits);
        if (pick) picks.push({ ...pick, isParlay: true });
      }
      continue;
    }

    // ── Implicit parlay: " + " separated legs (e.g. "Brewers ML + Phillies F5") ──
    {
      const plusLegs = line.split(/\s+\+\s+/);
      if (plusLegs.length >= 2) {
        const legPicks: ParsedPick[] = [];
        for (const leg of plusLegs) {
          const p = parsePickLine(leg.trim(), currentCapper, currentSport, tierUnits);
          if (p) legPicks.push({ ...p, isParlay: true });
        }
        if (legPicks.length >= 2) { picks.push(...legPicks); continue; }
      }
    }

    // ── Implicit parlay: " / " separated legs (e.g. "Spurs ML / Knicks +4.5") ──
    {
      const slashLegs = line.split(/\s+\/\s+/);
      if (slashLegs.length >= 2) {
        const legPicks: ParsedPick[] = [];
        for (const leg of slashLegs) {
          const p = parsePickLine(leg.trim(), currentCapper, currentSport, tierUnits);
          if (p) legPicks.push({ ...p, isParlay: true });
        }
        if (legPicks.length >= 2) { picks.push(...legPicks); continue; }
      }
    }

    const pick = parsePickLine(line, currentCapper, currentSport, tierUnits);
    if (pick) {
      picks.push(pick);
    } else if (line.length > 3) {
      skippedLines.push(line);
    }
  }

  return {
    capper: firstCapperName,
    capperSpecialLabel: firstCapperSpecialLabel,
    ...(firstCapperRecord ? { capperRecord: firstCapperRecord } : {}),
    picks,
    skippedLines,
    selfReportedRecords,
  };
}
