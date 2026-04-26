# Mockups — How to view

Static HTML files. No build step. Run a simple HTTP server from this folder and open the gallery.

## Run it

```bash
cd "Future Projects/mockups"
python3 -m http.server 4000
```

Then open: **http://localhost:4000**

That serves `index.html` which is a gallery linking to every mockup.

## What's in here

All mockups follow the updated Future Projects spec: no labels on summaries, banned-words compliance, prose summaries, timeline above body, counter-evidence in body, kicker as a dated next event, gaps named in prose, quiz with Type A + Type D.

No bylines. No reporter identity. No read times. No publication timestamps. No corrections UI on articles. No sourcing-strength row. No sources block at the bottom of articles. The article is the product; it stands on its own.

- **index.html** — Gallery landing with links to everything.
- **styles.css** — Shared token-driven stylesheet.
- **web-home.html** — Front page: masthead, hero slot, supporting stories. Each story is eyebrow + headline + summary.
- **web-story.html** — Story detail: eyebrow + headline + deck + prose summary + timeline above body + body + defection link + quiz + comments.
- **web-quiz-states.html** — Pass, fail, and cool-down states for the quiz.
- **web-paywall.html** — Invitation-voice paywall with visible trial timeline.
- **kids-home.html** — Kids greeting scene.
- **kids-reader.html** — Kid article with progress bar.
- **kids-quiz-pass.html** — Kids quiz pass celebration.

Every mockup is static HTML — no JavaScript dependencies, no network calls, no external CSS frameworks.
