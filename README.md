# Heavy

Mobile-first training log: plans, set logging, progress, body tracking and profile. The codebase produces two things:

- **Web app:** static export deployed by Vercel from GitHub `main` → https://training-routine-five.vercel.app
- **iOS app:** the same build wrapped with Capacitor 8, with native lock-screen rest alerts, haptics and keep-awake.

Stack: Next.js 16 (static export), Tailwind v4, Recharts, Supabase (Postgres + Auth + RLS), Capacitor 8 (iOS, Swift Package Manager).

---

## iOS: install on your iPhone (personal use)

### One-time setup on the Mac
1. Install **Xcode** from the Mac App Store and open it once so it installs its components.
2. Install **Node.js 22 LTS** (nodejs.org) if you don't already have it.
3. Get the code:
   ```bash
   git clone https://github.com/midozy/training-routine.git
   cd training-routine
   npm install
   ```
4. Join the **Apple Developer Program** (US$99/year, developer.apple.com/programs). Approval can take a day or two. Until it arrives, a free Apple ID can install the app on your phone over a cable, but that install stops working after 7 days.

### Build and run
```bash
npm run ios        # builds the web app, copies it into the iOS project, opens Xcode
```
In Xcode:
1. Select the **App** target → **Signing & Capabilities** → tick *Automatically manage signing* → choose your **Team**.
2. Plug in your iPhone, select it in the device menu at the top, and press **Run ▶**.
3. On the iPhone the first time: **Settings → General → VPN & Device Management → trust** your developer certificate. With a free account you also need **Settings → Privacy & Security → Developer Mode → On**.
4. When the first rest timer starts, allow notifications. This is what makes the lock-screen "Rest over — GO" alert work.

### Apple Health
Heavy reads weight, body fat, lean mass, height, resting heart rate, daily steps, daily active energy and sleep, adds Apple Watch heart rate and active energy to finished sessions, and saves each finished session to Health as a strength-training workout.
- Native side: `ios/App/App/HeavyHealthPlugin.swift` (a local Capacitor plugin, registered in `MainViewController.swift`). Entitlement: `App/App.entitlements`. Permission texts: `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription` in `Info.plist`.
- JS side: `lib/health.ts`. Sync runs when the app opens and when it returns to the foreground (at most every 15 minutes), first importing a year of history, then only new data with a 3-day overlap. Manual weigh-ins always win over Health for the same day.
- Data: `health_samples` (one row per sample, per day for steps/energy, per night for sleep), `bodyweight_logs.source`, and `workout_sessions.avg_hr / max_hr / active_kcal / health_workout_id`. Migration: `supabase/migrations/20260926_apple_health_import.sql`.
- In Xcode, check **Signing & Capabilities** shows **HealthKit** for the App target (automatic signing registers it on the App ID). Turn it on in the app under Profile → Apple Health.

### TestFlight (no cable, auto-updates, needs the paid membership)
1. In **App Store Connect → Apps → +**, create the app with bundle ID `com.elsamman.heavy`. The name must be unique on the store; a working title is fine for now.
2. In Xcode, set the device to **Any iOS Device (arm64)**, then **Product → Archive → Distribute App → App Store Connect → Upload**.
3. In App Store Connect → **TestFlight**, add yourself as an **internal tester**. Internal builds don't need App Review.
4. Install the **TestFlight** app on the iPhone and accept the invite.

### Shipping an update
Web: push to `main` (Vercel redeploys). iOS: `npm run ios:sync`, bump **Build** in Xcode, then Archive → Upload again. TestFlight builds expire after 90 days.

---

## What's already publish-ready

| Requirement | Status |
|---|---|
| In-app account deletion (guideline 5.1.1(v)) | Done. Plan → Delete account (`delete_my_account()` RPC; all data cascades) |
| Public privacy policy URL | Done. `/privacy/` (reachable without signing in) |
| Health disclaimer / terms | Done. `/terms/`, linked from sign-in and Plan |
| Your plans hidden from other users | Done. `plans.owner_id` = your account; RLS only shows your own or shared (`owner_id is null`) plans |
| Sign-ups switch | Done. Closed now (allowlist only); one SQL update opens them (below) |
| Native features, not a bare web wrapper (guideline 4.2) | Done. Lock-screen rest alerts, haptics, keep-awake, native splash/icon |
| Export compliance | Done. `ITSAppUsesNonExemptEncryption = false` |
| Apple Health (guideline 5.1.3) | Done. Clear permission texts, used only for in-app trends, privacy policy updated, never stored in iCloud. Add *Health & Fitness* to the privacy labels |

## Still to do before a public App Store release

1. **Plan content.** The two original plans are private to your account. Before bundling them for other users, confirm your purchase licence allows redistribution; otherwise new users start from the plan builder.
2. **Exercise photos.** The GIFs come from free-exercise-db (Unlicense), but the photos' original source is unclear. Replace them with photos or illustrations you own or have licensed.
3. **Plans for new users.** New accounts can create plans with the built-in editor (Plan → + New). Optionally add shared starter templates (`owner_id = null`).
4. **Open sign-ups:** `update app_settings set value = 'true' where key = 'signups_open';`. Also turn on **email confirmation** in Supabase Auth settings; allowlisted accounts skip it today.
5. **Supabase Auth:** enable *Leaked password protection*, set the Site URL, and add a password-reset flow.
6. **Store listing:** app name, subtitle, screenshots (6.9″ iPhone), description, support URL, privacy "nutrition" labels (email + fitness data, not used for tracking), age rating, and a demo account for the reviewer.
7. **Payments (optional):** any subscription must use Apple In-App Purchase.
8. **Offline logging (recommended):** queue sets locally when the gym has no signal and sync them later.

---

## In-app guide
- **First-run tour** (`components/Tour.tsx`): 4 skippable cards, shown once per account per device; replay from Profile → Replay the tour.
- **Tips** (`components/Tip.tsx`): "?" buttons beside est. 1RM, weekly totals, the muscle chart, Swap and "Use set 1 for all".
- **Help page** (`app/help/page.tsx`): public `/help/`, linked from Profile and the sign-in screen. Use it as the store listing's support URL.
- **Starter plan**: shared "Starter: Push / Pull / Legs" (`slug = starter-ppl`, `owner_id` null). New accounts start with it active; users Duplicate it to edit.
- **Exercise library**: 132 shared exercises. All 132 have an instruction card in `lib/guide.json`. The original 36 have a photo (`gif`); the 96 added later are text-only (`gif: null`). Custom exercises show "No instructions yet".
- **Week start**: Profile → Settings → Week starts on (`user_settings.week_start`; default Monday). Drives the week streak and the weekly charts.

## Offline (complete: everything except account actions)
- **Reads** (`lib/offline.ts`, `lib/pgrest.ts`): the Supabase client's `fetch` is wrapped. If a request fails (no signal / 10 s timeout), or while changes are waiting to be sent, reads are answered from a copy of your data saved on the phone (IndexedDB, `lib/store.ts`).
- **Writes** (`lib/pgwrite.ts`, `lib/outbox.ts`): workouts, sets, swaps, settings, plans, days, plan exercises, custom exercises, profile, body weight, measurements and Health data are applied on the phone first (instant, works with no signal), then queued in the outbox and sent in order in the background. Nothing leaves the queue until the server confirms it. "Duplicate plan" and "Reset plan" are reproduced on the phone (they are server functions) and sent as ordinary inserts/deletes.
- **Rows created offline** (workouts, plans, days, plan exercises, custom exercises) get a temporary negative id plus a `client_id` UUID (unique column on each of those tables) and are sent as upserts on it, so a retry after a lost reply can never duplicate them. When the server answers, the real id replaces the temporary one everywhere (`heavy:idmap` event); old temporary ids keep resolving. Body weight / measurements created offline are edited or deleted later by date. Times you did things are frozen into the queued request, not stamped at sync time.
- **Delete rules** (`lib/cascade.ts`): the database's ON DELETE rules are reproduced on the phone (deleting a plan removes its days and exercises, detaches workouts and logged sets, clears the active plan).
- **Sync** (`lib/sync.ts`): downloads all 12 tables on open / return to the app / reconnect; never while changes are waiting (it would overwrite them). Different account or sign-out wipes the copy (the app warns first if changes are unsent).
- **If the server refuses a change** it stays queued, the queue pauses, and the banner offers Retry / Discard. Discard removes the refused row and what depends on it, but never your training log: a workout or logged set that pointed at a discarded plan or day is kept with that link cleared. A temporary server error (5xx/429) is just retried.
- **Sign-in offline** (`lib/session.ts`): supabase-js reports no session when the token expired and can't refresh; we fall back to the saved login.
- **Online-only:** signing in/up, password reset, deleting your account, avatar upload.
- **Safety net (Phase 4)** (`lib/nativeBackup.ts`): every unsent change is also mirrored to native iPhone storage (Capacitor Preferences), which survives iOS clearing web storage. After such a wipe, the next launch restores it (same account only, never on top of intact data) before the first download, and sends it. It is erased on sign-out. Apple Health uploads are left out (Health regenerates them) and an absurdly large queue never replaces the last good copy. The app also asks the system to keep its storage (`navigator.storage.persist`).
- **Apple Health uploads made while offline are merged** into the one waiting upload (newest values win; an upload already on the wire is never touched; other change types are never merged, so their order is preserved).
- **Release check:** `docs/OFFLINE-CHECKLIST.md` (airplane-mode run on a real iPhone).
- Tests: `node --experimental-strip-types --no-warnings scripts/test-offline.mjs` (fake cloud that enforces unique positions and delete cascades, real supabase-js client).

## Backend
Supabase project `training-routine` (ref `danzdvismbezkymgstfu`, eu-central-1).
- Schema: `supabase/schema.sql` (initial). Later migrations were applied through the Supabase migrations history.
- Plan source data: `data/plans.mjs`. Exercise instructions: `data/guide-text.json` → `lib/guide.json`.

## Local dev
```bash
npm install && npm run dev
```
