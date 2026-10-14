# Haze Monitor

Tracks Singapore's PSI and real-time PM2.5 for the NEA reading point nearest your postal code, rates it, and gives advice on outdoor activity, air purifier and air-con use. Optional Lark alerts to your phone.

## How it decides
- **Nearest point:** the postal code is geocoded with OneMap, then the closest NEA region label point (west/east/central/south/north) is chosen by distance. NEA publishes PM2.5 and PSI per region.
- **Advice is driven by 1-hour PM2.5** (NEA's guide for the next few hours): Normal ≤55, Elevated 56–150, High 151–250, Very High ≥251 µg/m³. The 24-hour PSI is shown as context; if it is Unhealthy+ and worse than the PM2.5 band, advice goes one step more cautious, unless PM2.5 is clearly falling. A rising/falling trend vs the previous hour is shown.
- General guidance only, not medical advice.

## Dashboard
Static page, no build step. Needs an HTTP server because it uses ES modules:

    npm run serve   # then open http://localhost:8080
    # first visit: enter your postal code (stored only in your browser),
    # or use http://localhost:8080/?postal=XXXXXX

Auto-refreshes every 10 minutes. To host it, enable GitHub Pages with source "GitHub Actions"; `.github/workflows/pages.yml` deploys on push to `main`.

## Lark phone alerts
A scheduled GitHub Action (`.github/workflows/haze-alert.yml`, hourly at :10) runs `scripts/check.mjs` and posts a card to a Lark custom bot.

1. In the Lark group you read on your phone: Settings → Bots → Add bot → Custom Bot. Copy the webhook URL. If you enable "signature verification", copy the secret too.
2. Repo → Settings → Secrets and variables → Actions: add secret `LARK_WEBHOOK_URL` (and `LARK_SIGN_SECRET` if used). Add a repository **variable** (not secret) `HAZE_POSTAL` with your postal code, so it never appears in the code.
3. Actions → "Haze alert (Lark)" → Run workflow with *test* ticked to confirm delivery.

You get a message when the level changes (including back to Good), on the first run if air is already Moderate or worse, and a daily summary on the first run after 07:00 SGT. The last level is kept in the Actions cache. Local test: `LARK_WEBHOOK_URL=... node scripts/check.mjs --test`, or `npm run check` to print the card without sending.

## Tests
    npm test
