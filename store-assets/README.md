# Chrome Web Store listing assets

Source images for the Catchly Chrome Web Store listing. Not part
of the shipped extension — these are uploaded through the Web
Store dashboard at submission time.

## Files

| File | Dimensions | Used for |
|---|---|---|
| `promo-tile-440x280.png` | 440 × 280 | Small promo tile (required) |
| `promo-tile-880x560.png` | 880 × 560 | 2× promo, kept for future hi-DPI use |
| `screenshot-1.jpg` … `screenshot-5.jpg` | 1280 × 800 | Listing screenshots (Web Store requires exactly 1280×800 or 640×400) |

## Constraints

- **Small promo tile** — exactly 440×280, PNG or JPEG, under 1 MB.
- **Screenshots** — exactly 1280×800 or 640×400, PNG or JPEG, up to 5.
- **Marquee promo tile** (optional) — 1400×560. Not present.
- **Store icon** — 128×128 PNG. Reuses `icons/icon128.png` from
  the extension bundle.

Source dimensions were 4001×2500 (1.6:1, same aspect as 1280×800)
so the resize is a clean downsample with no crop.
