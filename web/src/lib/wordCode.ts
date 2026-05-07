const ADJECTIVES = [
  'amber', 'arctic', 'blazing', 'bold', 'brave', 'bright', 'brisk', 'calm',
  'cedar', 'clear', 'clever', 'coastal', 'cool', 'copper', 'crisp', 'daring',
  'dawn', 'deep', 'deft', 'dusty', 'eager', 'early', 'fair', 'fast', 'fleet',
  'foggy', 'free', 'fresh', 'frosted', 'glad', 'golden', 'grand', 'hardy',
  'hushed', 'jade', 'jovial', 'keen', 'kind', 'lively', 'lone', 'lucky',
  'lunar', 'mellow', 'mild', 'misty', 'noble', 'open', 'peak', 'plain',
  'plucky', 'prime', 'proud', 'pure', 'quick', 'quiet', 'rapid', 'ready',
  'rich', 'rising', 'roving', 'rustic', 'sage', 'sandy', 'sharp', 'silver',
  'sleek', 'slim', 'smart', 'smooth', 'snappy', 'solar', 'solid', 'spare',
  'still', 'stoic', 'sunny', 'swift', 'tawny', 'tidal', 'true', 'vast',
  'vivid', 'warm', 'wild', 'windy', 'wiry', 'witty', 'zesty',
];

const NOUNS = [
  'ash', 'atlas', 'bay', 'beam', 'birch', 'blaze', 'bloom', 'brook',
  'cape', 'cedar', 'cleft', 'cliff', 'cloud', 'coast', 'cove', 'creek',
  'crest', 'drift', 'dune', 'dusk', 'eagle', 'elm', 'fern', 'fjord',
  'flare', 'fleet', 'flint', 'flux', 'foam', 'fox', 'gale', 'glade',
  'glen', 'grove', 'gust', 'hawk', 'heath', 'hill', 'holt', 'isle',
  'jade', 'kite', 'lake', 'lark', 'leaf', 'light', 'lynx', 'maple',
  'marsh', 'mesa', 'mist', 'moor', 'moss', 'nest', 'oak', 'owl',
  'peak', 'pine', 'pond', 'puma', 'reed', 'reef', 'ridge', 'rift',
  'river', 'rook', 'rush', 'sand', 'shade', 'shore', 'sky', 'slate',
  'slope', 'spark', 'spring', 'star', 'stone', 'storm', 'stream', 'surf',
  'swift', 'teal', 'tern', 'tide', 'torch', 'trail', 'vale', 'vent',
  'vine', 'wake', 'wave', 'wren', 'yew',
];

export function generateWordCode(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}
