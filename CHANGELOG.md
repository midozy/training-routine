# Changelog

Versions follow `MAJOR.MINOR.PATCH`. Each release is a git tag (`vX.Y.Z`) on `main`.
The same number is used for `package.json` and the iOS/Watch `MARKETING_VERSION`;
the Xcode build number (`CURRENT_PROJECT_VERSION`) goes up by one for every build uploaded.

## 1.1.0 - 2026-10-11 (build 2)
### Added
- Apple Watch companion app: rest timer, current set list, quick set logging.
- Live Activity layout for the Apple Watch Smart Stack; Watch app icon.
- Stale-workout cleanup: a workout with no set logged for 4+ hours is closed at its last set
  (deleted if it has no sets) when the app opens or returns to the foreground.
### Fixed
- A workout left open for days was saved to Apple Health as one huge session (811 min).
  The end time is now the last logged set + 5 minutes whenever Finish is tapped 90+ minutes
  after the last set, in both History and Apple Health.

## 1.0.0 - 2026-10-01
- First complete release: plans and workout logging, progression suggestions, PRs, plate calculator,
  supersets, training calendar, offline-first sync, Apple Health import/export, home-screen and
  Lock Screen widgets, Live Activity, password reset and email confirmation.
