# Discovery scraper reclassify preview — 2026-05-04

Audit trail for the data-only `feed_type` reclassify migration that extends the
discovery scraper layer beyond RSS-only defaults. Generated before any UPDATE
ran; numbers below match the actual rows the migration will touch.

## Summary

- **Total rows touched:** 129
- **→ scrape_html:** 96
- **→ scrape_json:** 33

Scope: rows where `deleted_at IS NULL` AND `is_active = true` AND the URL does
NOT contain `/rss`, `/feed`, `.xml`, or `.atom` (case-insensitive). Already
RSS-shaped rows (123) and existing `scrape_*` rows (0) are untouched.

Classification rule:

- `scrape_json` if the URL contains `/api/`, OR the URL host starts with
  `api.` (matched via `~* '://api\.'`), OR the name ends in ` API`, OR the
  name starts with `API `.
- Otherwise `scrape_html`.

Reason codes: `json-api-url-pattern`, `json-api-name-pattern`,
`default-html-scrape`.

## Reclassify table

| name | url (≤80 chars) | proposed_type | reason |
|---|---|---|---|
| ABC News International | https://abcnews.go.com/abcnews/internationalheadlines | scrape_html | default-html-scrape |
| Animal Diversity Web (UMich) | https://animaldiversity.org | scrape_html | default-html-scrape |
| AP News | https://apnews.com | scrape_html | default-html-scrape |
| APITube.io | https://apitube.io | scrape_html | default-html-scrape |
| BBC Earth | https://www.bbcearth.com | scrape_html | default-html-scrape |
| BBC News | https://www.bbc.com/news | scrape_html | default-html-scrape |
| BBC Science/Nature | https://www.bbc.com/news/science_and_environment | scrape_html | default-html-scrape |
| Caltech News | https://www.caltech.edu/about/news | scrape_html | default-html-scrape |
| Cambridge Research News | https://www.cam.ac.uk/research/news | scrape_html | default-html-scrape |
| CDC Open Data | https://data.cdc.gov | scrape_html | default-html-scrape |
| CDC Topics A-Z | https://www.cdc.gov/az/ | scrape_html | default-html-scrape |
| Census.gov QuickFacts | https://www.census.gov/quickfacts/ | scrape_html | default-html-scrape |
| CIA World Factbook | https://www.cia.gov/the-world-factbook/ | scrape_html | default-html-scrape |
| CK-12 Foundation | https://www.ck12.org | scrape_html | default-html-scrape |
| Columbia News | https://news.columbia.edu | scrape_html | default-html-scrape |
| Cornell All About Birds | https://www.allaboutbirds.org | scrape_html | default-html-scrape |
| Data.gov | https://data.gov | scrape_html | default-html-scrape |
| DK Find Out | https://www.dkfindout.com | scrape_html | default-html-scrape |
| eBird | https://ebird.org | scrape_html | default-html-scrape |
| Encyclopaedia Britannica (free pages) | https://www.britannica.com | scrape_html | default-html-scrape |
| Energy.gov Science | https://www.energy.gov/science/science | scrape_html | default-html-scrape |
| EPA Environmental Topics | https://www.epa.gov/environmental-topics | scrape_html | default-html-scrape |
| GBIF (Global Biodiversity) | https://www.gbif.org | scrape_html | default-html-scrape |
| Global Volcanism Program | https://volcano.si.edu | scrape_html | default-html-scrape |
| GNews.io | https://gnews.io | scrape_html | default-html-scrape |
| Guardian Environment | https://www.theguardian.com/environment | scrape_html | default-html-scrape |
| Guardian Science | https://www.theguardian.com/science | scrape_html | default-html-scrape |
| Harvard Gazette | https://news.harvard.edu/gazette/ | scrape_html | default-html-scrape |
| iNaturalist | https://www.inaturalist.org | scrape_html | default-html-scrape |
| Internet Archive | https://archive.org | scrape_html | default-html-scrape |
| IUCN Red List Pages | https://www.iucnredlist.org | scrape_html | default-html-scrape |
| Johns Hopkins Hub | https://hub.jhu.edu | scrape_html | default-html-scrape |
| Kiddle (kid-safe encyclopedia) | https://www.kiddle.co | scrape_html | default-html-scrape |
| kjk | km | scrape_html | default-html-scrape |
| Library of Congress Digital | https://www.loc.gov/collections/ | scrape_html | default-html-scrape |
| LiveScience | https://www.livescience.com | scrape_html | default-html-scrape |
| MediaStack | https://mediastack.com | scrape_html | default-html-scrape |
| MIT News | https://news.mit.edu | scrape_html | default-html-scrape |
| Mongabay | https://news.mongabay.com | scrape_html | default-html-scrape |
| NASA APOD Archive | https://apod.nasa.gov/apod/archivepix.html | scrape_html | default-html-scrape |
| NASA Earthdata | https://www.earthdata.nasa.gov | scrape_html | default-html-scrape |
| NASA Image & Video Library | https://images-api.nasa.gov | scrape_html | default-html-scrape |
| NASA Image Library | https://images.nasa.gov | scrape_html | default-html-scrape |
| NASA Mars Rover Gallery | https://mars.nasa.gov/mars2020/multimedia/raw-images/ | scrape_html | default-html-scrape |
| NASA.gov (all pages) | https://www.nasa.gov | scrape_html | default-html-scrape |
| National Geographic (public pages) | https://www.nationalgeographic.com | scrape_html | default-html-scrape |
| National Park Service | https://www.nps.gov | scrape_html | default-html-scrape |
| NewsData.io | https://newsdata.io | scrape_html | default-html-scrape |
| NIH MedlinePlus | https://medlineplus.gov | scrape_html | default-html-scrape |
| NIST (standards/measurement) | https://www.nist.gov | scrape_html | default-html-scrape |
| NOAA APIs | https://www.weather.gov/documentation/services-web-api | scrape_html | default-html-scrape |
| NOAA Climate.gov | https://www.climate.gov | scrape_html | default-html-scrape |
| NOAA Fisheries | https://www.fisheries.noaa.gov/species-directory | scrape_html | default-html-scrape |
| NOAA Hurricane Center | https://www.nhc.noaa.gov/aboutrss.shtml | scrape_html | default-html-scrape |
| NOAA National Weather Service | https://www.weather.gov | scrape_html | default-html-scrape |
| NOAA Ocean Explorer | https://oceanexplorer.noaa.gov | scrape_html | default-html-scrape |
| Nominatim (OSM) | https://nominatim.openstreetmap.org | scrape_html | default-html-scrape |
| NPR Animals | https://www.npr.org/sections/animals/ | scrape_html | default-html-scrape |
| NPR Science | https://www.npr.org/sections/science/ | scrape_html | default-html-scrape |
| NSF Discoveries | https://www.nsf.gov/discoveries/ | scrape_html | default-html-scrape |
| OBIS (Ocean Biodiversity) | https://obis.org | scrape_html | default-html-scrape |
| Open Trivia DB | https://opentdb.com/api_config.php | scrape_html | default-html-scrape |
| OpenAlex | https://openalex.org | scrape_html | default-html-scrape |
| OpenStreetMap | https://www.openstreetmap.org | scrape_html | default-html-scrape |
| OpenWeatherMap | https://openweathermap.org/api | scrape_html | default-html-scrape |
| Our World in Data | https://ourworldindata.org | scrape_html | default-html-scrape |
| Oxford Science Blog | https://www.ox.ac.uk/news/science-blog | scrape_html | default-html-scrape |
| Paleobiology Database | https://paleobiodb.org | scrape_html | default-html-scrape |
| Phys.org | https://phys.org | scrape_html | default-html-scrape |
| Project Gutenberg | https://www.gutenberg.org | scrape_html | default-html-scrape |
| Reuters | https://www.reuters.com | scrape_html | default-html-scrape |
| San Diego Zoo Animals | https://animals.sandiegozoo.org | scrape_html | default-html-scrape |
| ScienceDaily | https://www.sciencedaily.com | scrape_html | default-html-scrape |
| Simple English Wikipedia | https://simple.wikipedia.org | scrape_html | default-html-scrape |
| Smithsonian Magazine | https://www.smithsonianmag.com | scrape_html | default-html-scrape |
| Smithsonian Open Access | https://www.si.edu/openaccess | scrape_html | default-html-scrape |
| Space.com | https://www.space.com | scrape_html | default-html-scrape |
| Stanford News | https://news.stanford.edu | scrape_html | default-html-scrape |
| The Conversation | https://theconversation.com | scrape_html | default-html-scrape |
| Tree of Life Web Project | https://tolweb.org | scrape_html | default-html-scrape |
| UC Berkeley News | https://news.berkeley.edu | scrape_html | default-html-scrape |
| UN Data | https://data.un.org | scrape_html | default-html-scrape |
| Understanding Science (Berkeley) | https://undsci.berkeley.edu | scrape_html | default-html-scrape |
| US Fish & Wildlife Species | https://www.fws.gov/species | scrape_html | default-html-scrape |
| USDA Food Data Central | https://fdc.nal.usda.gov | scrape_html | default-html-scrape |
| USGS Earthquake Data | https://earthquake.usgs.gov/earthquakes/ | scrape_html | default-html-scrape |
| USGS Volcano Hazards | https://www.usgs.gov/programs/volcano-hazards | scrape_html | default-html-scrape |
| USGS Water Dashboard | https://dashboard.waterdata.usgs.gov | scrape_html | default-html-scrape |
| USGS Water Services | https://waterservices.usgs.gov | scrape_html | default-html-scrape |
| WeatherAPI.com | https://www.weatherapi.com | scrape_html | default-html-scrape |
| Wikidata | https://www.wikidata.org | scrape_html | default-html-scrape |
| Wikimedia Commons | https://commons.wikimedia.org | scrape_html | default-html-scrape |
| Wikipedia - On This Day | https://en.wikipedia.org/w/api.php?action=featuredfeed&feed=onthis... | scrape_html | default-html-scrape |
| Wikipedia Articles | https://en.wikipedia.org | scrape_html | default-html-scrape |
| World Register Marine Species | https://www.marinespecies.org | scrape_html | default-html-scrape |
| Yale News | https://news.yale.edu | scrape_html | default-html-scrape |
| Air Quality (WAQI) | https://aqicn.org/api/ | scrape_json | json-api-url-pattern |
| API Countries | https://www.apicountries.com | scrape_json | json-api-name-pattern |
| API Ninjas - Animals | https://api-ninjas.com/api/animals | scrape_json | json-api-url-pattern |
| API Ninjas - Facts | https://api-ninjas.com/api/facts | scrape_json | json-api-url-pattern |
| API Ninjas - Trivia | https://api-ninjas.com/api/trivia | scrape_json | json-api-url-pattern |
| Cat Facts API | https://catfact.ninja | scrape_json | json-api-name-pattern |
| CORE API | https://core.ac.uk | scrape_json | json-api-name-pattern |
| Country State City API | https://countrystatecity.in | scrape_json | json-api-name-pattern |
| Currents API | https://currentsapi.services | scrape_json | json-api-name-pattern |
| Datamuse API | https://www.datamuse.com/api/ | scrape_json | json-api-url-pattern |
| Dog API | https://dog.ceo/dog-api/ | scrape_json | json-api-name-pattern |
| eBird API | https://documenter.getpostman.com/view/664302/S1ENwy59 | scrape_json | json-api-name-pattern |
| FishWatch API | https://www.fishwatch.gov/developers | scrape_json | json-api-name-pattern |
| Free Dictionary API | https://dictionaryapi.dev | scrape_json | json-api-name-pattern |
| iNaturalist API | https://api.inaturalist.org | scrape_json | json-api-url-pattern |
| ISS Location API | http://api.open-notify.org | scrape_json | json-api-url-pattern |
| IUCN Red List API | https://apiv3.iucnredlist.org | scrape_json | json-api-name-pattern |
| NASA APOD | https://api.nasa.gov | scrape_json | json-api-url-pattern |
| Numbers API | https://numbersapi.com | scrape_json | json-api-name-pattern |
| Pexels API | https://www.pexels.com/api/ | scrape_json | json-api-url-pattern |
| Pixabay API | https://pixabay.com/api/docs/ | scrape_json | json-api-url-pattern |
| REST Countries API | https://restcountries.com | scrape_json | json-api-name-pattern |
| Solar System OpenData | https://api.le-systeme-solaire.net | scrape_json | json-api-url-pattern |
| Sunrise-Sunset API | https://api.sunrise-sunset.org | scrape_json | json-api-url-pattern |
| Unsplash API | https://unsplash.com/developers | scrape_json | json-api-name-pattern |
| Useless Facts API | https://uselessfacts.jsph.pl/api/v2/facts/random | scrape_json | json-api-url-pattern |
| USGS Earthquake API | https://earthquake.usgs.gov/fdsnws/event/1/ | scrape_json | json-api-name-pattern |
| USGS Volcanoes API | https://www.usgs.gov/products/web-tools/apis | scrape_json | json-api-name-pattern |
| Wikidata API | https://www.wikidata.org/w/api.php | scrape_json | json-api-name-pattern |
| Wikimedia Commons API | https://commons.wikimedia.org/w/api.php | scrape_json | json-api-name-pattern |
| Wikipedia REST API | https://en.wikipedia.org/api/rest_v1/ | scrape_json | json-api-url-pattern |
| World Bank API | https://data.worldbank.org | scrape_json | json-api-name-pattern |
| Zoo Animal API | https://zoo-animal-api.herokuapp.com | scrape_json | json-api-name-pattern |
