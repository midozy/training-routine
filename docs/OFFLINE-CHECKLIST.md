# Offline test checklist (run on a real iPhone before each release)

Automated tests cover the logic (`node --experimental-strip-types --no-warnings scripts/test-offline.mjs`).
This checklist covers what only a phone can show. Use the iOS app (not the web version).

## A. Reading with no signal
1. With signal, open the app for a minute so your data downloads.
2. Airplane mode ON. Force-close the app and reopen it.
3. You stay signed in. The "Offline" banner shows. Today, Plan, History, Progress and Profile all open with your data.

## B. A workout
4. Start a workout. Log 3 sets, edit one, undo one, swap an exercise, finish.
5. Banner reads "Offline · N saved". Force-close and reopen (still offline): the workout is still there.
6. Inside a workout, "‹ Close" and "Overview" respond while the banner is showing. Tap the banner's ✕: it disappears and stays away.

## C. Plans and exercises
7. Create a plan, add a day and two exercises (one a brand-new custom exercise), reorder the days and the exercises, make it active.
8. Start a workout from that plan and log a set with the custom exercise.
9. Duplicate the starter plan, rename a day, delete a day, then Reset the copy.
10. Try creating a custom exercise with a name you already have: it is refused immediately.

## D. Body and profile
11. Log a body weight, log another for the same day (it replaces), edit and delete an entry. Edit your profile name and height.

## E. Safety nets
12. While offline with changes waiting, tap Sign out: you get a warning. Cancel.
13. With changes waiting, force-close the app, turn airplane mode OFF, reopen: the changes still send.

## F. Back online
14. Airplane mode OFF. The banner changes to "Syncing…" and disappears within about half a minute.
15. In the web app (or Supabase) confirm: one workout with the right times, one copy of each plan, one custom exercise, one body weight per day, no duplicates, and your active plan is the one you made.

## G. If something is refused by the server
16. The banner shows "one couldn't be saved" with Retry and Discard. Retry sends it again. Discard removes the refused change and what depends on it, but never your workouts or logged sets.

## Notes
- Online-only: signing in/up, password reset, deleting the account, avatar photo upload.
- Unsent changes are also kept in a native copy (Capacitor Preferences) that survives iOS clearing web storage. It is restored on the next launch (same account only) and erased on sign-out.
- After adding or updating a Capacitor plugin run `npm run ios:sync`, then Run in Xcode.
