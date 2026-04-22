// Shared sample edition for the five feed prototypes. Editor-sequenced
// per the memo — role slots assigned manually. Dek text is the
// load-bearing invariant, never truncated.

export type Role = 'lead' | 'subordinate' | 'sidebar' | 'off-lead' | 'color' | 'digest';

export interface Story {
  id: string;
  title: string;
  dek: string;
  byline: string;
  minutes: number;
  category: string;
  role: Role;
  hoursAgo?: number;
  editorsPick?: boolean;
  sinceLastVisit?: boolean;
}

export const EDITION_DATE = 'Tuesday, April 21';
export const EDITION_TIME = '7:04 am';
export const NEXT_UPDATE = 'noon';

export const STORIES: Story[] = [
  {
    id: 's1',
    title: 'Senate Finance vote stalls on the 2026 infrastructure package after a late amendment',
    dek: 'A bloc of four moderates is holding out for rural-broadband carve-outs. The White House has until Friday to avoid a recess without a deal.',
    byline: 'Maya Chen',
    minutes: 7,
    category: 'Politics',
    role: 'lead',
    hoursAgo: 2,
    sinceLastVisit: true,
  },
  {
    id: 's1b',
    title: 'The four holdouts, by the numbers',
    dek: 'A fact box on where each senator stands, what their state actually gets under the bill, and which amendments they would accept.',
    byline: 'Verity Desk',
    minutes: 2,
    category: 'Politics',
    role: 'sidebar',
  },
  {
    id: 's2',
    title: 'What the ruling on Chevron means for the EPA\u2019s methane rule',
    dek: 'The opinion reads narrowly, but three footnotes point to a broader reading that would reshape how every federal agency writes regulations.',
    byline: 'Adrian Park',
    minutes: 11,
    category: 'Law',
    role: 'subordinate',
    hoursAgo: 4,
    sinceLastVisit: true,
    editorsPick: true,
  },
  {
    id: 's3',
    title:
      'The Fed\u2019s quiet pivot on balance-sheet runoff, and why markets haven\u2019t noticed',
    dek: 'Minutes from the March meeting reveal a sharper internal debate than the official statement let on. The dollar is already responding.',
    byline: 'Jordan Wong',
    minutes: 8,
    category: 'Economy',
    role: 'off-lead',
    hoursAgo: 6,
    sinceLastVisit: true,
  },
  {
    id: 's4',
    title: 'Lagos\u2019s water crisis is now the city\u2019s next housing crisis',
    dek: 'A block-by-block report from the flooded neighborhoods where middle-class families are quietly moving out, and what the governor isn\u2019t saying.',
    byline: 'Ifeoma Ade',
    minutes: 14,
    category: 'World',
    role: 'color',
    hoursAgo: 8,
  },
  {
    id: 's5',
    title: 'Chip-act review heads to the House as deadline slips',
    dek: 'Committee leaders have signaled flexibility on two provisions the administration had considered non-negotiable.',
    byline: 'Hana Mori',
    minutes: 6,
    category: 'Business',
    role: 'digest',
    hoursAgo: 9,
  },
  {
    id: 's6',
    title: 'European grid operators warn of winter capacity strain despite record renewables',
    dek: 'The strain is less about supply than about how interconnects settle imbalances across national pricing zones.',
    byline: 'Teun de Vries',
    minutes: 5,
    category: 'Business',
    role: 'digest',
    hoursAgo: 11,
  },
  {
    id: 's7',
    title: 'CDC reverses guidance on at-home respiratory tests citing false-negative rate',
    dek: 'The new guidance concedes what outside studies have shown for a year, and nudges clinicians back toward in-office testing for symptomatic adults.',
    byline: 'Rachel Simmons',
    minutes: 3,
    category: 'Health',
    role: 'digest',
    hoursAgo: 12,
  },
  {
    id: 's8',
    title: 'Shipping coalition announces binding 2030 emissions target in Rotterdam',
    dek: 'Seven of the ten largest carriers have signed; the two biggest have not. A third coalition could form within months.',
    byline: 'Olav Kristensen',
    minutes: 5,
    category: 'Environment',
    role: 'digest',
    hoursAgo: 15,
  },
  {
    id: 's9',
    title: 'Federal judge dismisses antitrust case against regional airline alliance',
    dek: 'The opinion leans on a 2019 precedent the DOJ had argued was distinguishable. An appeal is expected within the week.',
    byline: 'Priya Narayan',
    minutes: 4,
    category: 'Business',
    role: 'digest',
    hoursAgo: 18,
  },
  {
    id: 's10',
    title: 'First confirmed detection of a planetary atmosphere around a rogue exoplanet',
    dek: 'The spectrum is thin but unambiguous. The paper rewrites what astronomers assumed about heat retention in untethered worlds.',
    byline: 'Sam Greene',
    minutes: 7,
    category: 'Science',
    role: 'digest',
    hoursAgo: 20,
    editorsPick: true,
  },
  {
    id: 's11',
    title: 'Opinion: the city the subway is quietly rebuilding under your feet',
    dek: 'A columnist\u2019s case that the five-year track-work program is producing a different kind of transit system, not just a restored one.',
    byline: 'Evelyn Ross',
    minutes: 6,
    category: 'Opinion',
    role: 'digest',
    hoursAgo: 22,
  },
  {
    id: 's12',
    title: 'Mexico City water crisis deepens as reservoir reaches record low',
    dek: 'The rationing schedule released this week is the first formal acknowledgement that the status quo cannot hold through summer.',
    byline: 'Lucia Fernandez',
    minutes: 5,
    category: 'World',
    role: 'digest',
    hoursAgo: 26,
  },
  {
    id: 's13',
    title: 'What a quiet boom in community-solar financing is doing to rural utilities',
    dek: 'The business model is newer than most rural co-ops, and the tension with incumbent utilities is starting to surface in state regulatory filings.',
    byline: 'Marcus Holloway',
    minutes: 9,
    category: 'Business',
    role: 'digest',
    hoursAgo: 30,
  },
  {
    id: 's14',
    title: 'The returning American mall, and who\u2019s actually shopping there',
    dek: 'Traffic is up at redeveloped centers; the mix of stores, and the age of the customer, has quietly changed.',
    byline: 'Neha Kulkarni',
    minutes: 8,
    category: 'Culture',
    role: 'digest',
    hoursAgo: 40,
  },
];

export const BREAKING = {
  active: false,
  title: 'Fed cuts rates by 50 bps in emergency move; briefing at 2 pm.',
  minAgo: 17,
};

export const T = {
  bg: '#fdfcf9',
  paper: '#ffffff',
  text: '#141210',
  textDim: '#5a544d',
  textMute: '#8a847c',
  rule: '#d9d2c7',
  ruleSoft: '#ebe6dd',
  accent: '#1a1815',
  breaking: '#b4281f',
  serif: 'var(--font-source-serif), "Tiempos Text", Georgia, "Times New Roman", serif',
  sans: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
};
