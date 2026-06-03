import { parseCapperText } from '../lib/parseCapperText';

const examples = [
  {
    label: 'Example 1 — HammeringHank (simple ML)',
    input: `🔮Hammering Hank
Padres ML +130 3U
Red Sox ML -129 3U
Reds ML -118 3U`,
  },
  {
    label: 'Example 2 — Porter (team vs team with spread)',
    input: `🔮Porter Picks
Philadelphia Phillies (-1.5) (+150) over San Diego Padres (3-UNITS)
Cincinnati Reds (-120) over KC Royals (2-UNITS)
Chicago White Sox (-118) over Minnesota Twins (5-UNITS)`,
  },
  {
    label: 'Example 3 — AlgoPicks (MAX label, record, em-dash units)',
    input: `🔮AlgoPicks MAX (9-0)
Brewers ML (-142) - 10U
Yankees -1.5 (+100) – 1U
Astros ML (-108) – 1U`,
  },
  {
    label: 'Example 4 — GamblingGawd (tier headers, POD label)',
    input: `🔮TheGamblingGawd
5U Plays:
Hurricanes ML (POD) -155
Phillies ML -149
1U Plays:
Rangers ML -125
Dodgers Over 9 -102`,
  },
  {
    label: 'Example 5 — Porter (mixed sports, WNBA header)',
    input: `🔮Porter Picks
NY METS (+115) over Seattle Mariners (3-UNITS)
WNBA
SEATTLE STORM (+12.5) over Dallas Wings (2-UNITS)
PHX MERCURY (+3) over Minnesota Lynx (2-UNITS)`,
  },
];

for (const { label, input } of examples) {
  console.log('\n' + '='.repeat(60));
  console.log(label);
  console.log('='.repeat(60));
  const result = parseCapperText(input);
  console.log(JSON.stringify(result, null, 2));
}
