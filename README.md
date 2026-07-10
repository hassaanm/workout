# The Dunk Project

A mobile-first, local-first workout player for a year of 20-minute sessions: safety check-in, clearance-aware substitutions, a timer that respects hard boundaries, fast logging, progress, PT overrides, and JSON backup.

## Run locally

```sh
npm install
npm run dev
```

Run checks with `npm test` and `npm run build`.

## Data and safety

Workout data stays in the browser on the device. Use Settings to export a JSON backup; a static GitHub Pages site does not provide cross-device sync. No workout logs are committed to this repository.

The calendar is never clinical clearance. Configure clearances and PT-prescribed lower-body slots in Settings, and use the app’s stop/regression paths for symptoms.
