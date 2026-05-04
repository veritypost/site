-- Seed: research / reference feeds (batch 3, 2026-05-04)
--
-- 20 owner-curated research + reference + dataset sources. Different tier from
-- the anchor-news batch 2 ('2-reference' vs '1-anchor'); these are scholarly /
-- gov-data / encyclopedia sources, not editorial news.
--
-- Categorization:
--   - feed_type='feed' for true RSS/Atom XML (4): Wikinews, arXiv RSS, arXiv API
--     Atom, PubMed RSS — these poll cleanly via rss-parser.
--   - feed_type='scrape_json' + extraction_config='{}' (15): JSON APIs that need
--     per-source field-mapping config via Phase B admin editor. Surface as
--     "unconfigured" in run summary until configured; no error_count inflation.
--   - feed_type='scrape_html' (1): Project Gutenberg new-releases search page;
--     polled by the Phase A Jina+Cheerio discovery scraper.
--
-- All rows tagged metadata.tier='2-reference', commercial_ok=true (owner-marked),
-- added_via='owner_seed_2026-05-04_batch3'.
--
-- Two flagged-for-review rows (single-resource URLs that will dedup to no-ops
-- after the first poll): Wikipedia Page Extract API (Artificial_intelligence
-- page only), Wikidata Entity API (Q42 only). Inserted is_active=true per
-- owner request; deactivate via /admin/feeds if zero_results_streak grows.

INSERT INTO public.feeds (name, url, source_name, feed_type, audience, is_active, priority_weight, metadata)
VALUES
  ('Wikinews RSS', 'https://en.wikinews.org/rss.xml', 'Wikinews', 'feed', 'adult', true, 4, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3')),
  ('arXiv RSS (cs.AI)', 'http://export.arxiv.org/rss/cs.AI', 'arXiv cs.AI', 'feed', 'adult', true, 5, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3')),
  ('arXiv API (Atom)', 'http://export.arxiv.org/api/query?search_query=all:ai', 'arXiv API', 'feed', 'adult', true, 5, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','format','atom')),
  ('PubMed Recent Articles', 'https://pubmed.ncbi.nlm.nih.gov/rss/search/1YkH/example.xml', 'PubMed', 'feed', 'adult', true, 5, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3'));

INSERT INTO public.feeds (name, url, source_name, feed_type, audience, is_active, priority_weight, metadata, extraction_config)
VALUES
  ('Wikipedia Recent Changes', 'https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&format=json', 'Wikipedia Recent Changes', 'scrape_json', 'adult', true, 3, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('Wikipedia Page Extract API', 'https://en.wikipedia.org/api/rest_v1/page/summary/Artificial_intelligence', 'Wikipedia Page Extract', 'scrape_json', 'adult', true, 2, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true,'flagged','single-resource-url-will-dedup-to-no-op'), '{}'::jsonb),
  ('Wikipedia Featured Content Feed', 'https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=featured&feedformat=json', 'Wikipedia Featured', 'scrape_json', 'adult', true, 4, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('Wikidata Entity API', 'https://www.wikidata.org/wiki/Special:EntityData/Q42.json', 'Wikidata', 'scrape_json', 'adult', true, 2, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true,'flagged','single-resource-url-will-dedup-to-no-op'), '{}'::jsonb),
  ('Open Library API', 'https://openlibrary.org/search.json?q=history', 'Open Library', 'scrape_json', 'adult', true, 3, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('DOAJ (Open Access Journals)', 'https://doaj.org/api/v2/search/articles/ai', 'DOAJ', 'scrape_json', 'adult', true, 4, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('CORE Open Research API', 'https://api.core.ac.uk/v3/search/works?q=machine%20learning', 'CORE', 'scrape_json', 'adult', true, 4, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('CrossRef Works API', 'https://api.crossref.org/works?query=ai', 'CrossRef', 'scrape_json', 'adult', true, 4, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('OpenAlex Papers API', 'https://api.openalex.org/works?search=artificial%20intelligence', 'OpenAlex', 'scrape_json', 'adult', true, 4, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('Semantic Scholar API', 'https://api.semanticscholar.org/graph/v1/paper/search?query=ai', 'Semantic Scholar', 'scrape_json', 'adult', true, 4, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('NASA Technical Reports Server', 'https://ntrs.nasa.gov/api/citations/search?q=space', 'NASA Technical Reports', 'scrape_json', 'adult', true, 4, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('Data.gov Catalog', 'https://catalog.data.gov/api/3/action/package_search?q=climate', 'Data.gov', 'scrape_json', 'adult', true, 3, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('EU Open Data Portal', 'https://data.europa.eu/api/hub/search/search?q=energy', 'EU Open Data', 'scrape_json', 'adult', true, 3, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('World Bank Open Data', 'https://api.worldbank.org/v2/indicator/SP.POP.TOTL?format=json', 'World Bank', 'scrape_json', 'adult', true, 3, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true), '{}'::jsonb),
  ('OECD Data API', 'https://stats.oecd.org/SDMX-JSON/data/all/all', 'OECD', 'scrape_json', 'adult', true, 3, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3','needs_extraction_config',true,'format','sdmx-json'), '{}'::jsonb);

INSERT INTO public.feeds (name, url, source_name, feed_type, audience, is_active, priority_weight, metadata)
VALUES
  ('Project Gutenberg New Books', 'https://www.gutenberg.org/ebooks/search/?sort_order=release_date', 'Project Gutenberg', 'scrape_html', 'adult', true, 3, jsonb_build_object('tier','2-reference','source_class','first_party','commercial_ok',true,'added_via','owner_seed_2026-05-04_batch3'));
