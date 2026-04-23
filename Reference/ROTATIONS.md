# Credential Rotations

Things that expire or should be rotated periodically. Check this file every quarter.

---

## Apple Sign In With Apple — Client Secret JWT

- **Expires:** every 6 months (Apple max)
- **Last rotated:** 2026-04-23
- **Next rotation due:** 2026-10-23
- **How to rotate:**
  1. In Terminal:
     ```
     export APPLE_P8_PATH=~/Desktop/AuthKey_S462U229AG.p8
     export APPLE_KID=S462U229AG
     export APPLE_TEAM_ID=FQCAS829U7
     export APPLE_SUB=com.veritypost.signin
     node scripts/generate-apple-client-secret.js
     ```
  2. Copy the JWT it prints
  3. Supabase Dashboard → Authentication → Providers → Apple → Secret Keys → paste new JWT → Save
  4. Update **Last rotated** date above + bump **Next rotation due** by 6 months
- **What breaks if you forget:** Sign In With Apple stops working on web + iOS adult app. Users get an "Authentication failed" error. Existing logged-in sessions keep working until they expire.
- **Rotation does NOT require:** new .p8 file, new Key ID, app rebuild, or Vercel redeploy. Supabase-only change.

---

## Apple APNs Auth Key

- **Expires:** never (revocable manually if compromised)
- **Key ID:** 8WQ2K66T63
- **Stored in:** `~/Desktop/AuthKey_8WQ2K66T63.p8` + Vercel env (`APNS_AUTH_KEY`)
- **Action only needed if:** key is compromised. Generate new one at https://developer.apple.com/account/resources/authkeys/list, swap into Vercel.

---

## Apple Service ID + App IDs

- **Expires:** never
- **Service ID:** `com.veritypost.signin`
- **App IDs:** `com.veritypost.app`, `com.veritypost.kids`
- **Team ID:** `FQCAS829U7`
- **Action only needed if:** product changes (new app, new domain). Update at https://developer.apple.com/account/resources/identifiers/list

---

## Supabase Anon Key

- **Expires:** never (revocable manually)
- **Stored in:** Vercel env + iOS Info.plist (publishable, safe to ship)
- **Action only needed if:** Supabase project rotates keys (rare; usually security incident).

---

## Supabase Service Role Key

- **Expires:** never (revocable manually)
- **Sensitive:** YES — full DB bypass. Server-only.
- **Stored in:** Vercel env (`SUPABASE_SERVICE_ROLE_KEY`)
- **Recommended rotation cadence:** annually OR after any suspected leak.

---

## Stripe Keys

- **Test + Live secret keys:** never expire (revocable)
- **Webhook signing secret:** never expires (rotate if endpoint URL changes)
- **Recommended rotation cadence:** annually.

---

## Anthropic API Key + OpenAI API Key

- **Expires:** never (revocable)
- **Used by:** F7 AI pipeline only
- **Recommended rotation cadence:** annually OR after suspected leak.

---

## Sentry Auth Token

- **Expires:** never (revocable)
- **Used by:** Vercel build for source-map upload
- **Recommended rotation cadence:** annually.

---

## CRON_SECRET

- **Expires:** never
- **Used by:** Vercel cron auth header
- **Recommended rotation cadence:** annually OR if a cron route's URL leaks.
- **How to rotate:** generate new random string (`openssl rand -hex 32`), update in Vercel env var, deploy.

---

## Resend API Key (if used)

- **Expires:** never (revocable)
- **Used by:** transactional email
- **Recommended rotation cadence:** annually.

---

## Quarterly checklist

Every 3 months, glance at this file:
- Is anything within 60 days of expiry? → rotate now, don't wait
- Any keys compromised since last check (security incident, leaked screenshot, etc)? → rotate
- Update **Last rotated** dates in this file as you go
