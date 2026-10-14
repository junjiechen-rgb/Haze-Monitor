# Haze Monitor

Tracks Singapore's PSI and real-time PM2.5 for the NEA reading point nearest your postal code, rates it, and gives advice on outdoor activity, air purifier and air-con use. Optional Lark alerts to your phone.

## How it decides
- **Nearest point:** the postal code is geocoded with OneMap, then the closest NEA region label point (west/east/central/south/north) is chosen by distance. NEA publishes PM2.5 and PSI per region.
- **Advice follows NEA's 1-hour PM2.5 guide exactly:** Band I Normal (0–55 µg/m³): continue normal activities. Band II Elevated (56–150): reduce prolonged or strenuous outdoor activity. Band III High (151–250): avoid prolonged or strenuous outdoor activity. Band IV Very high (≥251): minimise all outdoor activity for the next hour. Higher-risk groups (older adults, pregnant women, children, people with chronic lung or heart disease) take extra precautions from Elevated onwards. Air purifier and air-con advice use the same band.
- The 24-hour PSI is shown as context only (with a note when it is Unhealthy or worse); it never changes the band. A rising/falling trend vs the previous hour is shown.
- General guidance only, not medical advice.

## Hourly trend and best time to go outside
- **Hourly PM2.5 chart:** the last 24 hourly readings for your nearest region, coloured by NEA band, with a marker for what is usual at each hour (median of the last 7 days). Tap a bar for details.
- **Outdoor windows:** for the rest of today (6am–10pm) each hour gets an estimate = its usual value over the last 7 days, plus how far above/below usual PM2.5 is right now (that gap fades about 10% per hour, slowly on purpose, because haze persists). The cleanest third of hours within NEA Band I are "best"; contiguous runs of 2+ best hours are recommended. Hours above Band I are "avoid". During haze it says when to check again; late at night it shows tomorrow's usual best hours. Needs at least 3 days of history.
- This is a pattern from recent days, not a forecast. Heat and UV are not scored.
- Past days are cached in your browser; only today is refetched. The Lark daily summary and alerts include the best window.

## Dashboard
Static page, no build step. Needs an HTTP server because it uses ES modules:

    npm run serve   # then open http://localhost:8080
    # first visit: enter your postal code (stored only in your browser),
    # or use http://localhost:8080/?postal=XXXXXX

Auto-refreshes every 10 minutes. To host it, enable GitHub Pages with source "GitHub Actions"; `.github/workflows/pages.yml` deploys on push to `main`.

## Alerts to Lark and email
A scheduled GitHub Action (`.github/workflows/haze-alert.yml`, hourly at :10) runs `scripts/check.mjs` and sends the alert to **every** configured recipient. Recipients are kept in repo secrets (Settings → Secrets and variables → Actions → New repository secret), so webhook URLs and addresses never appear in the code.

| Secret | What to put in it |
|---|---|
| `HAZE_POSTAL` | Your postal code (required) |
| `LARK_WEBHOOK_URLS` | One Lark custom-bot webhook URL per line. For a bot with signature verification, write `url|signing-secret` on that line. |
| `ALERT_EMAILS` | One email address per line |
| `GMAIL_USER` | The Gmail address that sends the alerts |
| `GMAIL_APP_PASSWORD` | A Gmail app password for that account (not your normal password) |

The older single-bot secrets `LARK_WEBHOOK_URL` / `LARK_SIGN_SECRET` still work.

**Lark webhook:** in the Lark group (desktop app) → Settings → Bots → Add bot → Custom Bot → copy the webhook URL. Each person can create a bot in their own group and give you the URL.

**Gmail app password:** the sending Google account needs 2-Step Verification on. Go to https://myaccount.google.com/apppasswords, create one (name it "Haze Monitor"), and paste the 16-character code into `GMAIL_APP_PASSWORD`. Gmail allows about 500 emails a day, far more than this needs.

**Adding or removing someone:** edit `LARK_WEBHOOK_URLS` or `ALERT_EMAILS` (secrets can't be viewed after saving, so paste the full list again). Each recipient gets their own message; one bad address doesn't stop the others, but the run is marked failed so you notice.

**Test:** Actions → "Haze alert (Lark + email)" → Run workflow with *test* ticked. The log shows `sent` / `FAILED` per recipient (URLs and addresses are masked).

You get a message when the NEA band changes (including back to Normal), on the first run if air is already Elevated or worse, and a daily summary on the first run after 07:00 SGT. Messages include the best outdoor window and a link to the dashboard (override with the `DASHBOARD_URL` variable). Local dry run: `npm ci && HAZE_POSTAL=XXXXXX npm run check`.

## Tests
    npm test
