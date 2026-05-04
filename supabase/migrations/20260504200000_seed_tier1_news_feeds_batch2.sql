-- Seed: tier-1 anchor news feeds (batch 2, 2026-05-04)
--
-- 47 new rows on top of the 26 from migration 4558b82's batch 1. Brings
-- the active anchor news set up to ~70 rows across wires, broadcasters,
-- newspapers, intl/regional, gov data, sci/tech.
--
-- Source list provided by owner; auto-deduped against existing feeds
-- (14 exact-URL matches + 2 host+path drift matches were skipped).
-- Categorization rules:
--   - feed_type='feed' for XML/RSS sources
--   - feed_type='scrape_json' + extraction_config='{}' for JSON APIs
--     that need per-source extraction config (Phase B); they surface as
--     "unconfigured" in the run summary until configured.
--   - is_active=false on the 3 Google News aggregator rows because the
--     GNews ToS gray area for commercial aggregation matches the
--     pre-existing AP/AP Sports/Reuters fallbacks staged inactive.
--
-- All 47 rows tagged metadata.tier='1-anchor', source_class='first_party'
-- (or 'gnews_fallback' for the 3 inactive aggregators), added_via='owner_seed_2026-05-04_batch2'.

-- 40 RSS feeds (active)
INSERT INTO public.feeds (name, url, source_name, feed_type, audience, is_active, priority_weight, metadata)
VALUES
  ('Reuters Top News', 'https://feeds.reuters.com/reuters/topNews', 'Reuters Top News', 'feed', 'adult', true, 8, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Reuters World News', 'https://feeds.reuters.com/reuters/worldNews', 'Reuters World News', 'feed', 'adult', true, 8, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Reuters Politics', 'http://feeds.reuters.com/Reuters/PoliticsNews', 'Reuters Politics', 'feed', 'adult', true, 8, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Reuters Business', 'https://feeds.reuters.com/reuters/businessNews', 'Reuters Business', 'feed', 'adult', true, 8, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Associated Press Top News', 'https://apnews.com/rss/apf-topnews', 'Associated Press Top News', 'feed', 'adult', true, 8, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Associated Press World', 'https://apnews.com/rss/apf-worldnews', 'Associated Press World', 'feed', 'adult', true, 8, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Associated Press Politics', 'https://apnews.com/rss/apf-politics', 'Associated Press Politics', 'feed', 'adult', true, 8, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('BBC Politics', 'http://feeds.bbci.co.uk/news/politics/rss.xml', 'BBC Politics', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('BBC Business', 'http://feeds.bbci.co.uk/news/business/rss.xml', 'BBC Business', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('CNN Top Stories', 'http://rss.cnn.com/rss/cnn_topstories.rss', 'CNN Top Stories', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('CNN World', 'http://rss.cnn.com/rss/cnn_world.rss', 'CNN World', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('CNN Politics', 'http://rss.cnn.com/rss/cnn_allpolitics.rss', 'CNN Politics', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('NBC News Top Stories', 'https://feeds.nbcnews.com/nbcnews/public/news', 'NBC News Top Stories', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('NBC Politics', 'https://feeds.nbcnews.com/nbcnews/public/politics', 'NBC Politics', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('ABC News Top Stories', 'https://abcnews.go.com/abcnews/topstories', 'ABC News Top Stories', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('CBS News Latest', 'https://www.cbsnews.com/latest/rss/main', 'CBS News Latest', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Fox News Latest', 'http://feeds.foxnews.com/foxnews/latest', 'Fox News Latest', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('New York Times World', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'NYT World', 'feed', 'adult', true, 8, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('The Guardian Politics', 'https://www.theguardian.com/politics/rss', 'The Guardian Politics', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Washington Post World', 'http://feeds.washingtonpost.com/rss/world', 'Washington Post World', 'feed', 'adult', true, 8, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Wall Street Journal World', 'https://feeds.a.dj.com/rss/RSSWorldNews.xml', 'Wall Street Journal World', 'feed', 'adult', true, 8, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Financial Times World', 'https://www.ft.com/world?format=rss', 'Financial Times World', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Sky News World', 'https://feeds.skynews.com/feeds/rss/world.xml', 'Sky News World', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Euronews', 'https://www.euronews.com/rss?level=theme&name=news', 'Euronews', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Deutsche Welle', 'https://rss.dw.com/xml/rss-en-all', 'Deutsche Welle', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('France 24', 'https://www.france24.com/en/rss', 'France 24', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('NHK World', 'https://www3.nhk.or.jp/rss/news/cat0.xml', 'NHK World', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('CBC News', 'https://www.cbc.ca/rss/', 'CBC News', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('FiveThirtyEight Politics', 'https://fivethirtyeight.com/politics/feed/', 'FiveThirtyEight Politics', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Reddit World News', 'https://www.reddit.com/r/worldnews/.rss', 'Reddit World News', 'feed', 'adult', true, 4, jsonb_build_object('tier','1-anchor','source_class','aggregator','added_via','owner_seed_2026-05-04_batch2')),
  ('Reddit News', 'https://www.reddit.com/r/news/.rss', 'Reddit News', 'feed', 'adult', true, 4, jsonb_build_object('tier','1-anchor','source_class','aggregator','added_via','owner_seed_2026-05-04_batch2')),
  ('White House Briefing Room', 'https://www.whitehouse.gov/briefing-room/feed/', 'White House Briefing Room', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Congress.gov RSS', 'https://www.congress.gov/rss/most-viewed', 'Congress.gov', 'feed', 'adult', true, 5, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('IMF Data RSS', 'https://www.imf.org/en/News/rss', 'IMF News', 'feed', 'adult', true, 5, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('UN News', 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', 'UN News', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('WHO News', 'https://www.who.int/rss-feeds/news-english.xml', 'WHO News', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('SEC Filings Feed', 'https://www.sec.gov/rss/litigation/litreleases.xml', 'SEC Filings', 'feed', 'adult', true, 5, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Hacker News', 'https://hnrss.org/frontpage', 'Hacker News', 'feed', 'adult', true, 5, jsonb_build_object('tier','1-anchor','source_class','aggregator','added_via','owner_seed_2026-05-04_batch2')),
  ('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'Ars Technica', 'feed', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2')),
  ('Nature News', 'https://www.nature.com/nature.rss', 'Nature News', 'feed', 'adult', true, 7, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2'));

-- 3 Google News aggregator rows (INACTIVE — GNews ToS gray area for commercial aggregation)
INSERT INTO public.feeds (name, url, source_name, feed_type, audience, is_active, priority_weight, metadata)
VALUES
  ('Google News Top', 'https://news.google.com/rss', 'Google News Top', 'feed', 'adult', false, 3, jsonb_build_object('tier','1-anchor','source_class','gnews_fallback','added_via','owner_seed_2026-05-04_batch2','inactive_reason','gnews_tos_gray_area')),
  ('Google News Search AI', 'https://news.google.com/rss/search?q=AI', 'Google News - AI', 'feed', 'adult', false, 3, jsonb_build_object('tier','1-anchor','source_class','gnews_fallback','added_via','owner_seed_2026-05-04_batch2','inactive_reason','gnews_tos_gray_area')),
  ('Google News Politics US', 'https://news.google.com/rss/search?q=politics&hl=en-US&gl=US&ceid=US:en', 'Google News - Politics US', 'feed', 'adult', false, 3, jsonb_build_object('tier','1-anchor','source_class','gnews_fallback','added_via','owner_seed_2026-05-04_batch2','inactive_reason','gnews_tos_gray_area'));

-- 4 JSON API rows (scrape_json type, extraction_config defaulted to '{}'; surface as
-- "unconfigured" in run summary until owner sets per-source field mappings via the
-- Phase B admin editor at /admin/feeds → row drawer → Extraction config)
INSERT INTO public.feeds (name, url, source_name, feed_type, audience, is_active, priority_weight, metadata, extraction_config)
VALUES
  ('USGS Earthquakes (All Day)', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', 'USGS Earthquakes', 'scrape_json', 'adult', true, 5, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2','format','geojson','needs_extraction_config',true), '{}'::jsonb),
  ('USGS Earthquakes (Significant)', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson', 'USGS Earthquakes (Significant)', 'scrape_json', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2','format','geojson','needs_extraction_config',true), '{}'::jsonb),
  ('NOAA Weather Alerts', 'https://api.weather.gov/alerts/active', 'NOAA Weather Alerts', 'scrape_json', 'adult', true, 5, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2','format','geojson','needs_extraction_config',true), '{}'::jsonb),
  ('CDC Newsroom', 'https://tools.cdc.gov/api/v2/resources/media?format=json', 'CDC Newsroom', 'scrape_json', 'adult', true, 6, jsonb_build_object('tier','1-anchor','source_class','first_party','added_via','owner_seed_2026-05-04_batch2','format','json','needs_extraction_config',true), '{}'::jsonb);
