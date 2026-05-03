# Q11 — Kids iOS image-host allowlist

**Status:** Decided
**Date:** 2026-05-03
**Source finding:** PM-7 [P1] — `KidReaderView.swift:122-132`, REVIEW_REPORT.md:1703-1722
**Compliance regime:** Apple App Store Review Guidelines 1.3 (Kids Category) + 5.1.4 (Privacy / Kids); COPPA persistent-identifier rule.

---

## TL;DR — recommendation

**Option B+, scoped down: ship Option A as a hard zero-host allowlist today, because there is no production data to support any other shape, and the kids app should never fetch a cover image from an external host. Move to a first-party-only stance now while the cost is zero.**

Concrete rule for `KidReaderView.swift:122`:

```
1. If `article.coverImageUrl` is nil → render gradientPlaceholder (already happens).
2. Parse the URL. If parse fails → gradientPlaceholder.
3. If `url.scheme != "https"` → gradientPlaceholder.
4. If `url.host` is not in the allowlist → gradientPlaceholder.
5. Otherwise → AsyncImage(url:).
```

**Allowlist (current ship, 2026-05-03):**

```swift
private static let kidSafeImageHosts: Set<String> = [
    "<PROJECT_REF>.supabase.co",   // first-party Supabase Storage public bucket
    "cdn.veritypost.com",          // reserved — not active yet, see §6
]
```

The `<PROJECT_REF>` placeholder must be replaced with the actual Supabase project ref via `SupabaseKidsClient`'s configured URL (extract host at module load, not hardcode). `cdn.veritypost.com` is a forward-compatibility entry — no DNS exists today, but listing it now means flipping to a Cloudflare/Fastly proxy is a config change, not a code change.

**Why not name news-wire CDNs (AP, Reuters, Getty, Unsplash, etc.):** under guideline 1.3, those are third-party hosts that receive the kid device's IP and User-Agent on every image load. None of them have publicly-documented Kids-Category review practices, so they fall outside the "limited cases" exception. They are non-compliant by default.

---

## 1. The legal bar (verbatim from Apple, 2026-05-03)

**Guideline 1.3:**
> Kids Category apps may not send personally identifiable information or device information to third parties. Apps in the Kids Category should not include third-party analytics or third-party advertising. … In limited cases, third-party analytics may be permitted provided that the services do not collect or transmit the IDFA or any identifiable information about children (such as name, date of birth, email address), their location, or their devices. This includes any device, network, or other information that could be used directly or combined with other information to identify users and their devices.

**Guideline 5.1.4(a):**
> Apps intended primarily for kids should not include third-party analytics or third-party advertising. This provides a safer experience for kids.

**Practical read:** every HTTPS image GET from a kid device leaks IP address (a COPPA "persistent identifier" when combined with User-Agent), a User-Agent string, and an `Accept-Language` header to whatever host serves the image. That is "device information" sent to a third party. Apple reviewers run a network-traffic capture on Kids apps; an image GET to `static01.nyt.com` or `images.unsplash.com` lights up the same red flag a tracking pixel would. The only safe stance is: **the kid device only talks to first-party hosts.**

---

## 2. Current state (verified on disk + DB, 2026-05-03)

**Kids-app image call sites:** exactly one. `VerityPostKids/VerityPostKids/KidReaderView.swift:122-132`. `ArticleListView.swift` selects `cover_image_url` in its query but never renders it (uses an SF-Symbol placeholder card). No other `AsyncImage` exists in `VerityPostKids/`. Confirmed by `grep -rn "AsyncImage\|coverImageUrl\|cover_image_url" VerityPostKids/`.

**Database state (production, queried via MCP):**
- `articles` total rows: **1**.
- That one row: `is_kids_safe=false`, `age_band='adult'`, `cover_image_url=NULL`.
- Distinct hosts in `articles.cover_image_url` for `is_kids_safe=true OR age_band IN ('kids','tweens')`: **zero** (no rows match).

**No host distribution exists today.** Whatever allowlist we ship is for a future-state that hasn't generated any data yet.

**Pipeline analysis (`web/src/lib/pipeline/persist-article.ts` + `scrape-article.ts` + RPC body via `pg_get_functiondef`):**
- The `persist_generated_article(jsonb)` RPC body **does not read `cover_image_url` from the payload at all.** The column is silently dropped. The persist payload type (`PersistArticlePayload`) doesn't even define a cover field.
- `scrape-article.ts` extracts body text via Jina Reader / Cheerio; it doesn't extract or store images.
- Grep for `cover_image_url` writes across `web/src/`: **zero write sites.** Only readers (story OG metadata + the iOS-kids client).
- No Supabase Storage bucket exists for article covers — `storage.buckets` lists only `avatars`, `banners`, `data-exports`. No `article-covers` or similar.

**Conclusion: no path in production code currently sets `cover_image_url`.** The PM-7 finding is technically a latent risk against future data, not a leak in current shipped behavior. However:
1. The column is in the public RLS-readable schema and will be wired up by some future admin-edit or pipeline-image-extraction work.
2. Once it's wired, anything dropped in is rendered to kid devices with no scheme/host check.
3. Apple review is a pre-launch gate — they will scrutinize the *capability*, not just current data. A code path that loads `AsyncImage(url: someServerString)` with no validation is a finding regardless of whether the server has yet returned a hostile URL.

So PM-7 is correct to flag it as P1, and the fix should ship now while it's a 15-line change against an empty DB.

---

## 3. Options reconsidered against the evidence

| Option | Description | Verdict |
|---|---|---|
| **A** | Hard allowlist of N specific hosts (Verity Post storage + named news CDNs) | **Half-right.** Allowlist yes, named news CDNs no — they fail guideline 1.3 by default. |
| **B** | Every image proxied through a first-party host (e.g. `cdn.veritypost.com`) | **Correct end state, but the proxy doesn't exist.** No CDN, no signing key, no rehost worker. Building it pre-launch is unforced work for an empty pipeline. |
| **C** | Already-proxied; finding partially incorrect | **Refuted.** Pipeline never sets cover_image_url, so nothing is proxied. The finding is correct: the *next* admin/pipeline write will be unsafe. |

**The right answer is "A as the launch ship, designed so the migration to B is a single config flip when traffic justifies a CDN."** That means:

- Allowlist is a `Set<String>` keyed off the configured Supabase host.
- The `cdn.veritypost.com` entry is in the set today even though DNS doesn't exist yet — when the rehost worker ships, it gets pointed at the bucket and the iOS app needs no change.
- We do **not** add any third-party host (Unsplash, AP, Getty, Reuters, Imgur, news.cdn.com, …) to the set — they each independently violate 1.3.

---

## 4. Implementation sketch (`KidReaderView.swift`)

**File:** `VerityPostKids/VerityPostKids/KidReaderView.swift` around lines 119-136.

```swift
// Hosts the kid device is allowed to fetch images from. First-party only.
// Apple Kids Category guideline 1.3 / 5.1.4: no third-party hosts may
// receive the kid device's IP/UA on passive image loads. cdn.veritypost.com
// is reserved for the future rehost CDN — entry is harmless until DNS lands.
private static let kidSafeImageHosts: Set<String> = {
    var hosts: Set<String> = ["cdn.veritypost.com"]
    if let supabaseHost = URL(string: SupabaseKidsClient.shared.client.supabaseURL.absoluteString)?.host {
        hosts.insert(supabaseHost)
    }
    return hosts
}()

private static func isKidSafeImageURL(_ url: URL) -> Bool {
    guard url.scheme == "https", let host = url.host?.lowercased() else { return false }
    return kidSafeImageHosts.contains(host)
}
```

Then at line 122:
```swift
if let urlString = article.coverImageUrl,
   let url = URL(string: urlString),
   Self.isKidSafeImageURL(url) {
    AsyncImage(url: url) { phase in … }
} else {
    gradientPlaceholder
}
```

**Why module-load and not per-render:** the Supabase host is a constant for the app lifetime. Computing it once via the static initializer is cheaper than parsing on every cell render and avoids any chance of subtle string-comparison drift if a future code path mutates the client.

**Why NOT `host.hasSuffix(".supabase.co")`:** that would allowlist any Supabase project's storage URL, including ones an attacker could spin up to host arbitrary content. We pin to **our** project ref.

---

## 5. Server-side reciprocal (so the client allowlist isn't load-bearing alone)

The client allowlist is the immediate safety net. The durable shape PM-7 names — "rewrite externally-sourced covers into a first-party storage bucket" — has to ship before the pipeline ever sets a cover. Two follow-ups, **out of scope for this fix slice but tracked here for sequencing:**

1. **Add `article-covers` Supabase Storage bucket** (public, image MIME allowlist matching the existing `avatars` bucket: `image/png`, `image/jpeg`, `image/webp`). When the AI pipeline gains image extraction, it fetches the source image server-side, re-encodes through `sharp`, uploads to this bucket, and stores the bucket URL in `articles.cover_image_url`. The kid device then only ever sees a `<project>.supabase.co` URL.
2. **Persist payload + RPC support.** Add `cover_image_url`, `cover_image_alt`, `cover_image_credit` to the `PersistArticlePayload` type and the `persist_generated_article` RPC body. Today they're silently dropped — when image extraction lands, this drop turns into a silent data loss bug. Lock this down before shipping image extraction.

Both are independently small. Tracking them here so we don't ship image extraction with a third-party-host hole.

---

## 6. `cdn.veritypost.com` — why list a host that doesn't exist

Listing it now costs nothing (a missing DNS resolves to a network error and falls through to `gradientPlaceholder`, exactly the same UX as a non-allowlisted host). Listing it now buys: when the rehost CDN ships, the iOS app already trusts the host. No client release coupled to the CDN cutover. The kids app already has a slow App Store review cycle; decoupling client allowlist edits from CDN rollouts is worth the one extra line in the Set today.

---

## 7. Cross-platform impact (per CLAUDE.md cross-platform rule)

- **Web:** N/A. Web reads `cover_image_url` only for adult-side article OG metadata (`web/src/app/story/[slug]/layout.js:27`). Not a kid surface; not subject to 1.3. **No change required.**
- **iOS-adult (`VerityPost/`):** The adult app is not in the Kids Category, so guideline 1.3 doesn't apply. Today it does not load cover images at all (no `AsyncImage(url:)` against `cover_image_url` in `VerityPost/`; verified by grep). If it later does, an `https`-only check is still recommended for ATS compliance, but no host allowlist is required by Apple. **Defer until the adult app actually adds cover-image rendering.**
- **iOS-kids:** This is the surface PM-7 flagged. Ship the allowlist here.

---

## 8. Done definition

1. `KidReaderView.swift` validates scheme + host before instantiating `AsyncImage`. Non-allowlisted URLs render `gradientPlaceholder` silently (no error UI — the kid doesn't need a "blocked image" affordance).
2. Allowlist contains exactly the configured Supabase host + `cdn.veritypost.com`. **Zero third-party hosts.**
3. `ArticleListView.swift` query unchanged (it selects `cover_image_url` for forward-compat but doesn't render it).
4. No server change today (RPC drop of `cover_image_url` is preserved as a separate bug-track for whoever ships image extraction).
5. Adversary check: greps prove no other `AsyncImage(url: URL)` against a server-supplied host exists in `VerityPostKids/`.

---

## 9. One-sentence recommendation

Ship a hard 2-host first-party allowlist (Supabase project host + reserved `cdn.veritypost.com`) on `KidReaderView.swift` now — the production database has zero kid cover images today, the persist pipeline doesn't even write the column, and naming any third-party news CDN would itself violate Apple guideline 1.3.
