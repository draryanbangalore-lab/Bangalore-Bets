export type BetType = 'ML' | 'spread' | 'total' | 'unknown';
export type SpecialLabel = 'POD' | 'MAX' | 'BEST BET' | 'POTD';

export interface ParsedPick {
  capper: string;
  team: string;
  opponent?: string;
  betType: BetType;
  line?: number;          // spread value or total line
  overUnder?: 'over' | 'under';
  odds: number;           // American odds (0 if unknown)
  units: number;
  sport?: string;
  specialLabel: SpecialLabel | null;
  raw: string;
}

export interface ParseResult {
  capper: string;
  capperSpecialLabel: SpecialLabel | null;
  picks: ParsedPick[];
}

const KNOWN_SPORTS = new Set([
  'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'WNBA',
  'MLS', 'UFC', 'PGA', 'SOCCER', 'TENNIS', 'GOLF', 'CFB',
]);

const SPECIAL_LABEL_MAP: Array<{ pattern: RegExp; label: SpecialLabel }> = [
  { pattern: /\bPOTD\b/i, label: 'POTD' },
  { pattern: /\bPOD\b/i, label: 'POD' },
  { pattern: /\bMAX[-\s]BET\b/i, label: 'MAX' },
  { pattern: /\bBEST[-\s]BET\b/i, label: 'BEST BET' },
  { pattern: /\bMAX\b/i, label: 'MAX' },
];

function stripEmoji(s: string): string {
  return s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '').trim();
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

  // em/en dash or hyphen before unit: – 1U, - 10U
  m = s.match(/[-–—]\s*(\d+(?:\.\d+)?)\s*U\b/i);
  if (m) return { text: s.replace(m[0], '').trim(), units: parseFloat(m[1]) };

  // standalone XU
  m = s.match(/\b(\d+(?:\.\d+)?)\s*U\b/i);
  if (m) return { text: s.replace(m[0], '').trim(), units: parseFloat(m[1]) };

  return { text: s, units: fallback };
}

// Extracts all numeric values and returns the cleaned string without them
function extractNumbers(s: string): { text: string; nums: number[] } {
  const nums: number[] = [];

  // Parenthesized: (+150), (-1.5), (-142)
  let text = s.replace(/\(([+-]?\d+(?:\.\d+)?)\)/g, (_, n) => {
    nums.push(parseFloat(n));
    return ' ';
  });

  // Bare decimal values (spreads): -1.5, +3.5
  text = text.replace(/(?<!\w)([+-]\d+\.\d+)(?!\d)/g, (_, n) => {
    nums.push(parseFloat(n));
    return ' ';
  });

  // Bare signed integers: +130, -129 (2–4 digits to avoid matching single-digit spreads here)
  text = text.replace(/(?<!\w)([+-]\d{2,4})(?!\d|\.\d)/g, (_, n) => {
    nums.push(parseFloat(n));
    return ' ';
  });

  return { text: text.replace(/\s+/g, ' ').trim(), nums };
}

// Separates odds from spread/line values using heuristics
function classifyNums(nums: number[]): { odds: number; spread: number | null } {
  let odds = 0;
  let spread: number | null = null;

  for (const n of nums) {
    const abs = Math.abs(n);
    if (n % 1 !== 0 || abs < 30) {
      // fractional or small absolute value → spread/line
      if (spread === null) spread = n;
    } else {
      // large integer → American odds
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

function parseCapperLine(line: string): { name: string; specialLabel: SpecialLabel | null } {
  let s = stripEmoji(line).trim();
  s = s.replace(/\(\d+-\d+\)/g, '').trim(); // remove record like (9-0)
  const { text, label } = extractSpecialLabel(s);
  return { name: text.trim(), specialLabel: label };
}

function parsePickLine(
  raw: string,
  capper: string,
  sport: string | undefined,
  defaultUnits: number
): ParsedPick | null {
  let s = raw.trim();
  if (!s) return null;

  const { text: afterLabel, label: specialLabel } = extractSpecialLabel(s);
  s = afterLabel;

  // Detect "Over/Under N" totals before splitting on "over" as a team separator
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

  // Detect ML keyword
  const isML = /\bML\b/i.test(s);
  if (isML) {
    s = s.replace(/\bML\b/i, ' ').trim();
    if (betType === 'unknown') betType = 'ML';
  }

  // Split on " over " as team separator (only when not already a total)
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

  // Skip lines that produced no useful data
  if (!team && odds === 0 && spread === null) return null;

  return {
    capper,
    team: team || 'Unknown',
    ...(opponent ? { opponent } : {}),
    betType,
    ...(line !== undefined ? { line } : {}),
    ...(overUnder ? { overUnder } : {}),
    odds,
    units,
    ...(sport ? { sport } : {}),
    specialLabel,
    raw,
  };
}

export function parseCapperText(input: string): ParseResult {
  const lines = input.split('\n').map(l => l.trim());

  let capperName = '';
  let capperSpecialLabel: SpecialLabel | null = null;
  let currentSport: string | undefined;
  let tierUnits = 1;
  const picks: ParsedPick[] = [];
  let foundCapper = false;

  for (const line of lines) {
    if (!line) continue;

    if (!foundCapper) {
      const { name, specialLabel } = parseCapperLine(line);
      capperName = name;
      capperSpecialLabel = specialLabel;
      foundCapper = true;
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

    const pick = parsePickLine(line, capperName, currentSport, tierUnits);
    if (pick) picks.push(pick);
  }

  return { capper: capperName, capperSpecialLabel, picks };
}
