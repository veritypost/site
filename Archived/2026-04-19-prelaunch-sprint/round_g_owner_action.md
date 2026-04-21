# Round G owner action — H-04 HIBP leaked-password check

This toggle is dashboard-only. It cannot be applied via code, migration, or API.

## Exact clickpath

1. Open the Supabase dashboard for the VP project:
   https://supabase.com/dashboard/project/fyiwulqphgmoqullmrfn
2. Left sidebar: `Auth`
3. Sub-nav: `Providers`
4. Click `Email` to expand the provider panel
5. Scroll to the `Password Security` section
6. Enable the toggle: `Prevent use of leaked passwords`
   (Supabase may also label this `Check passwords against HaveIBeenPwned`)
7. Click `Save`

If the toggle is not under `Email -> Password Security` on your dashboard revision, check `Auth -> Policies -> Password strength and leaked password protection`. Look for the HIBP / "leaked password" string.

## Expected effect

- New signups and password changes using a breached password are rejected with an error similar to: `Password has appeared in a data breach. Please choose a different password.`
- Existing users with previously-set breached passwords are not forcibly reset; the check applies on the next password change.
- Additive to the existing length/complexity rules in `site/src/lib/password.js`.

## Verification after toggling

1. Open an incognito/private window and go to the signup page.
2. Attempt to create a new account using the password `password123` (a well-known breached password in the HIBP corpus).
3. Expect the signup to be rejected with a leaked-password error (wording similar to `Password has appeared in a data breach. Please choose a different password.`).
4. Re-try with a strong, unique password — signup should succeed.
5. Also verify password-change flow: as an existing user, attempt to change password to `password123` and expect the same rejection.

## Rollback

Same panel, toggle off, Save.
