# Supabase hardening checklist (do before opening sign-ups to the public)

Status checked on 2026-10-01 with Supabase's own security/performance advisors and the live Auth settings.

## Already fine (no action)
- Row-level security is on for every public table; every user policy is scoped to the user's own rows.
- `app_settings` and `signup_allowlist` have RLS with no policies on purpose: only the sign-up trigger (`restrict_signups`, SECURITY DEFINER, fixed `search_path`) reads them. Clients can't.
- `delete_my_account()` is SECURITY DEFINER with a fixed `search_path`, only deletes `auth.uid()`, and is callable by signed-in users only (not `anon`). It is the in-app "Delete account" (an App Store requirement).
- Avatars: private bucket, 5 MB limit, images only, each user can only touch their own folder.
- Email confirmation is ON (`mailer_autoconfirm = false`); allowlisted accounts skip it via the trigger. Anonymous sign-ins are off. No social providers.
- Performance advisor: only "unused index" notes on tiny tables (they back foreign keys; leave them).

## In the app (done)
- "Forgot your password?" on the sign-in screen -> e-mailed link -> `/reset-password/` page -> new password -> signed out -> sign in in the app.
- Sign-up with confirmation shows "Check your email" with a Send again button (60 s cooldown); unconfirmed sign-in does the same; friendlier errors.
- Links open the **web** address (`NEXT_PUBLIC_WEB_URL`, default `https://training-routine-five.vercel.app`) because a mail app cannot open the iPhone app's own `capacitor://localhost` address. Implicit auth flow is used on purpose, so the link also works in a different browser than the one that asked for it.

## You need to do these in the Supabase dashboard (I cannot change Auth settings from here)
Menu names move around a little; use the dashboard search if one isn't where it says.

1. **Authentication -> URL Configuration**
   - Site URL: `https://training-routine-five.vercel.app` (or your own domain once you have one).
   - Redirect URLs: add `https://training-routine-five.vercel.app/reset-password/` and `https://training-routine-five.vercel.app/email-confirmed/`.
   - Without these, reset and confirmation links fall back to the site's home page (the app still catches a reset link there and forwards it, but set them properly).
2. **Custom SMTP (required for a public launch).** Authentication -> Emails / SMTP Settings. Supabase's built-in mailer is for testing: it is heavily rate-limited and, as I understand it, only delivers to members of your Supabase team, so password-reset and confirmation e-mails to real users would not arrive. Use a transactional provider (Resend, Postmark, Amazon SES, ...), a verified sender domain, and SPF/DKIM set up.
3. **Leaked password protection** (the one open advisor warning): Authentication -> password security / attack protection. It checks passwords against HaveIBeenPwned. I believe this needs the Pro plan; if it is greyed out, that is why. The app already shows the server's message if a password is refused.
4. **Password rules:** minimum length 8 or more (the app asks for 8+).
5. **E-mail templates:** Authentication -> Email Templates: "Confirm signup" and "Reset password". Keep the `{{ .ConfirmationURL }}` link, brand the text, keep the subject clear ("Reset your Heavy password").
6. **Rate limits** (Authentication -> Rate Limits): the defaults are fine; just don't raise them.
7. **Optional, before big public launch:** CAPTCHA on sign-up (Cloudflare Turnstile / hCaptcha). Needs a small app change to send the token; ask me when you want it.

## Order of operations to open sign-ups
1. Items 1-5 above.
2. Test with your own address: Forgot password -> mail arrives -> link opens `/reset-password/` -> set a password -> sign in in the app. Then create a throwaway account with a second address of yours and confirm the "Check your email" flow.
3. Only then: `update app_settings set value = 'true' where key = 'signups_open';` (to close again: set it to `'false'`; existing users are unaffected).
4. Re-run the advisors (Supabase dashboard -> Advisors, or ask me) and confirm the leaked-password warning is gone.
