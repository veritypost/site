// Zero-dependency bot detection. Covers ~95% of crawlers and scripted
// clients without the isbot npm package. Upgrade to isbot (MIT, free,
// actively maintained) when a bot-class slips through that matters.
//
// Not a security boundary — a determined actor forges User-Agent. This
// is for analytics hygiene: keep crawler traffic out of product metrics
// and out of paid-ad impression counts.

const BOT_PATTERNS: RegExp[] = [
  /bot\b/i,
  /crawler/i,
  /spider/i,
  /slurp/i,                    // Yahoo
  /yandex/i,
  /baidu/i,
  /duckduck/i,
  /archive\.org/i,
  /googlebot/i,
  /adsbot/i,
  /mediapartners-google/i,
  /bingpreview/i,
  /applebot/i,
  /facebookexternal/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /slackbot/i,
  /discordbot/i,
  /embedly/i,
  /pingdom/i,
  /gtmetrix/i,
  /lighthouse/i,               // also fires headless Chrome
  /headlesschrome/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /chrome-lighthouse/i,
  /\bcurl\//i,
  /\bwget\//i,
  /\bpython-requests\//i,
  /\bgo-http-client/i,
  /\bjava\//i,
  /\bokhttp\//i,
  /\baxios\//i,
  /\bnode-fetch\//i,
  /\bpostmanruntime\//i,
  /\binsomnia\//i,
];

/**
 * Returns true if the User-Agent string matches a known crawler / script
 * pattern. Undefined / empty UA counts as a bot — legitimate browsers
 * always send one.
 */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true;
  const s = ua.toLowerCase();
  return BOT_PATTERNS.some((re) => re.test(s));
}
