# Training Routine

Mobile-first training log for the Team Zoher **High Volume Pro Split 1 & 2** plans.
Next.js 16 (App Router, client-side), Tailwind v4, Recharts, Supabase (Postgres + Auth + RLS).

## What it does
- **Today**: next day in the rotation (split days + rest), exercise list, one tap to start.
- **Workout logger**: weight × reps per set, prefilled from your last session, trainer tempo cues, auto rest timer (beep + vibrate), PR badge, notes. Finishing advances the rotation.
- **Progress**: per-exercise estimated 1RM, top set and volume trends; weekly sets per muscle (weeks start Saturday).
- **Body**: daily bodyweight (7-day average, weekly change, trend) and measurements.
- **Plan**: switch Split 1 / Split 2, set the next day, start any day, default rest time.

## Backend (already provisioned)
- Supabase project `training-routine` (`danzdvismbezkymgstfu`, eu-central-1).
- Schema: `supabase/schema.sql`. Plan data: `data/plans.mjs` → `supabase/seed.sql`.
- Only `mohamed@el-samman.com` can create an account (DB trigger on `auth.users`); every user table is locked to its owner by RLS.

## Deploy to Vercel (from your Mac)
```bash
cd ~/Development/"Training Routine"
npm install
npx vercel --prod      # log in, accept defaults (framework: Next.js)
```
No environment variables are required (the Supabase URL and publishable key are client-safe and have defaults in `lib/supabase.ts`). You can override them with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_KEY`.

Alternative: push this folder to a GitHub repo and import it at vercel.com/new.

## First use
1. Open the Vercel URL on your phone → "First time? Create your account" → your email + a password (8+ chars).
2. Add to Home Screen (Safari: Share → Add to Home Screen) to run it full-screen like an app.

## Local dev
```bash
npm install && npm run dev
```
