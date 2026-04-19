-- ============================================================
-- Seed timelines for sample articles
-- Run in Supabase SQL Editor
-- ============================================================

-- Supreme Court Social Media Case timeline
INSERT INTO "timelines" ("article_id", "event_date", "event_label", "event_body", "sort_order")
SELECT articles.id, t.ts, t.label, t.body, t.ord FROM articles,
(VALUES
  ('2024-03-15'::timestamptz, 'Texas and Florida pass social media laws', 'Both states enact legislation requiring platforms to host all legal speech, sparking immediate legal challenges.', 1),
  ('2024-09-22'::timestamptz, 'Appeals courts split on constitutionality', 'The 5th Circuit upholds Texas law while the 11th Circuit strikes down Florida law, creating a circuit split.', 2),
  ('2025-01-10'::timestamptz, 'Supreme Court agrees to hear case', 'The court grants certiorari to resolve the circuit split on platform content moderation rights.', 3),
  ('2025-06-15'::timestamptz, 'Oral arguments scheduled', 'Both sides prepare briefs as tech companies, civil liberties groups, and state AGs file amicus briefs.', 4),
  ('2026-04-13'::timestamptz, 'Decision expected this term', 'The court is expected to rule before the end of the current term in June.', 5)
) AS t(ts, label, body, ord)
WHERE articles.slug = 'supreme-court-social-media-case';

-- Global Trade Tensions timeline
INSERT INTO "timelines" ("article_id", "event_date", "event_label", "event_body", "sort_order")
SELECT articles.id, t.ts, t.label, t.body, t.ord FROM articles,
(VALUES
  ('2025-08-01'::timestamptz, 'Initial tariff announcement', 'First round of tariffs imposed on $50B worth of goods, targeting technology and agriculture sectors.', 1),
  ('2025-11-15'::timestamptz, 'Retaliatory measures begin', 'Trading partners respond with equivalent tariffs on exports, escalating tensions.', 2),
  ('2026-01-20'::timestamptz, 'Negotiations stall', 'Talks break down over intellectual property protections and market access requirements.', 3),
  ('2026-03-01'::timestamptz, 'New tariff round takes effect', 'Additional 25% tariffs imposed on $200B in goods across multiple sectors.', 4),
  ('2026-04-10'::timestamptz, 'Supply chain disruptions reported', 'Major manufacturers announce plans to diversify supply chains away from affected regions.', 5)
) AS t(ts, label, body, ord)
WHERE articles.slug = 'global-trade-tensions-tariffs';

-- Tech AI Spending timeline
INSERT INTO "timelines" ("article_id", "event_date", "event_label", "event_body", "sort_order")
SELECT articles.id, t.ts, t.label, t.body, t.ord FROM articles,
(VALUES
  ('2024-01-01'::timestamptz, 'AI spending surge begins', 'Major tech companies announce unprecedented capital expenditure plans focused on AI infrastructure.', 1),
  ('2024-06-15'::timestamptz, 'GPU shortage intensifies', 'Demand for AI chips outstrips supply, with wait times extending to 6+ months.', 2),
  ('2025-03-01'::timestamptz, 'Custom silicon programs announced', 'Three major companies reveal plans for proprietary AI training chips.', 3),
  ('2025-09-01'::timestamptz, 'Data center boom', 'Over 50 new AI-focused data centers break ground across North America.', 4),
  ('2026-01-15'::timestamptz, 'Combined spending exceeds $200B', 'Annual reports reveal combined AI infrastructure investment has passed the $200 billion mark.', 5),
  ('2026-04-01'::timestamptz, 'Energy concerns mount', 'Regulators begin examining the environmental impact of AI data center power consumption.', 6)
) AS t(ts, label, body, ord)
WHERE articles.slug = 'tech-giants-ai-infrastructure-spending';

-- NASA Exoplanet timeline
INSERT INTO "timelines" ("article_id", "event_date", "event_label", "event_body", "sort_order")
SELECT articles.id, t.ts, t.label, t.body, t.ord FROM articles,
(VALUES
  ('2025-04-01'::timestamptz, 'Initial detection by JWST', 'James Webb Space Telescope identifies a transit signal from a nearby star system.', 1),
  ('2025-07-15'::timestamptz, 'Ground-based confirmation', 'Multiple observatories confirm the exoplanet detection and refine orbital parameters.', 2),
  ('2025-11-01'::timestamptz, 'Atmosphere detected', 'Spectroscopic analysis reveals the planet has a substantial atmosphere.', 3),
  ('2026-02-01'::timestamptz, 'Habitable zone confirmed', 'Orbital analysis confirms the planet resides within the star habitable zone.', 4),
  ('2026-04-13'::timestamptz, 'NASA official announcement', 'NASA holds press conference designating TOI-4633 b as a priority target for atmospheric study.', 5)
) AS t(ts, label, body, ord)
WHERE articles.slug = 'nasa-exoplanet-habitable-zone';

-- Arctic Ice timeline
INSERT INTO "timelines" ("article_id", "event_date", "event_label", "event_body", "sort_order")
SELECT articles.id, t.ts, t.label, t.body, t.ord FROM articles,
(VALUES
  ('2019-04-01'::timestamptz, 'Previous record low set', 'April 2019 ice extent sets the previous record for lowest April measurement.', 1),
  ('2023-09-01'::timestamptz, 'Summer minimum hits new low', 'September 2023 records historically low summer ice extent.', 2),
  ('2025-01-01'::timestamptz, 'Winter recovery weakens', 'Winter ice regrowth falls short of historical averages for the third year in a row.', 3),
  ('2026-04-01'::timestamptz, 'April 2026 record broken', 'Satellite data confirms April ice extent is 8% below the 2019 record.', 4)
) AS t(ts, label, body, ord)
WHERE articles.slug = 'arctic-ice-record-low-april';

-- Fed Rate Cuts timeline
INSERT INTO "timelines" ("article_id", "event_date", "event_label", "event_body", "sort_order")
SELECT articles.id, t.ts, t.label, t.body, t.ord FROM articles,
(VALUES
  ('2024-09-01'::timestamptz, 'First rate cut in 4 years', 'Fed cuts rates by 50 basis points, signaling a pivot from tightening.', 1),
  ('2024-12-01'::timestamptz, 'Two more cuts follow', 'Fed cuts rates in November and December, bringing the total reduction to 100 basis points.', 2),
  ('2025-03-01'::timestamptz, 'Inflation stalls above 2%', 'Core PCE inflation remains stuck at 2.6%, complicating the easing path.', 3),
  ('2025-09-01'::timestamptz, 'Rate cuts pause', 'Fed holds rates steady for three consecutive meetings citing persistent inflation.', 4),
  ('2026-04-13'::timestamptz, 'Caution signaled', 'Latest statement emphasizes patience and data dependence before further cuts.', 5)
) AS t(ts, label, body, ord)
WHERE articles.slug = 'federal-reserve-rate-cuts-caution';
