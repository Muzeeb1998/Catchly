# Chrome Web Store listing assets

Source images for the Catchly Chrome Web Store listing. Not part
of the shipped extension — these are uploaded through the Web
Store dashboard at submission time.

## Files

| File | Dimensions | Used for |
|---|---|---|
| `promo-tile-440x280.png` | 440 × 280 | Small promo tile (required) |
| `promo-tile-880x560.png` | 880 × 560 | 2× promo, kept for future hi-DPI use |
| `01-subscriptions.jpg` | 1280 × 800 | Subscription list view (default landing pane) |
| `02-alerts.jpg`        | 1280 × 800 | Alerts pane — price hikes, trial endings, shadow charges |
| `03-calendar.jpg`      | 1280 × 800 | Calendar drawer — upcoming renewals in next 30 days |
| `04-insights.jpg`      | 1280 × 800 | Insights — spend by category, recent activity, yearly recap |
| `05-settings.jpg`      | 1280 × 800 | Settings — theme, notifications, currency, privacy controls |

Upload order in the Web Store dashboard determines display order;
the leading numeric prefix on each filename keeps them sorted in
the order we want users to see them.

## Constraints

- **Small promo tile** — exactly 440×280, PNG or JPEG, under 1 MB.
- **Screenshots** — exactly 1280×800 or 640×400, PNG or JPEG, up to 5.
- **Marquee promo tile** (optional) — 1400×560. Not present.
- **Store icon** — 128×128 PNG. Reuses `icons/icon128.png` from
  the extension bundle.

Source dimensions were 4001×2500 (1.6:1, same aspect as 1280×800)
so the resize is a clean downsample with no crop.
