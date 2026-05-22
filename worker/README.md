# Catchly — waitlist worker

A single Cloudflare Worker that accepts early-access email signups and writes them to Workers KV. No backend to maintain, no database to run, no IPs stored.

## What it does

| Route             | Method | Behaviour                                                                 |
| ----------------- | ------ | ------------------------------------------------------------------------- |
| `/signup`         | POST   | Validates the JSON body, writes one KV entry, returns `{ ok: true }`.     |
| `/signup`         | OPTIONS| Returns 204 with CORS preflight headers.                                  |
| anything else     | any    | Returns 404 `{ ok: false, error: "not_found" }`.                          |

Request body shape:

```json
{ "email": "you@example.com", "source": "welcome", "version": "0.1.0", "dismissedCount": 0 }
```

KV entry:

- Key: `signup:<timestamp>:<random8>` (sorts chronologically by default)
- Value: `{"email":"you@example.com","source":"welcome","version":"0.1.0","dismissedCount":0,"ts":1714531200000}`

## Deploy in five steps

The whole flow takes about three minutes the first time, ten seconds every time after.

### 1. Install Wrangler

```bash
npm install -g wrangler
```

Wrangler is Cloudflare's deploy CLI. It uses the Cloudflare API; you authenticate it once.

### 2. Authenticate

```bash
wrangler login
```

This opens a browser tab. Approve the OAuth grant for your Cloudflare account. If you don't have a Cloudflare account, create one first — it's free for Workers.

### 3. Create the KV namespace

From inside this `worker/` directory:

```bash
wrangler kv:namespace create WAITLIST
```

Wrangler prints something like:

```
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "WAITLIST", id = "9f8e7d6c5b4a3210ffeedcba98765432" }
```

Copy the `id` value.

### 4. Paste the id into `wrangler.toml`

Open `wrangler.toml` and replace `REPLACE_WITH_NAMESPACE_ID` with the id you just copied. The block should now look like:

```toml
[[kv_namespaces]]
binding = "WAITLIST"
id = "9f8e7d6c5b4a3210ffeedcba98765432"
```

### 5. Deploy

```bash
wrangler deploy
```

Wrangler prints the live URL, something like:

```
Published subscription-sentry-waitlist (1.23 sec)
  https://subscription-sentry-waitlist.<your-subdomain>.workers.dev
```

Copy that URL.

## Wire the extension to the worker

Open `lib/waitlist.js` in the extension and set:

```js
export const WAITLIST_ENDPOINT = 'https://subscription-sentry-waitlist.<your-subdomain>.workers.dev/signup';
```

That single change flips the extension from local-only mode to real submissions. Reload the extension in `chrome://extensions/` and submit a test email from the welcome card.

## Read collected emails

List the last 1000 keys (KV's list cap per call):

```bash
wrangler kv:key list --binding WAITLIST
```

Read one entry:

```bash
wrangler kv:key get --binding WAITLIST "signup:1714531200000:9f8e7d6c"
```

Dump everything to a file in one shot (jq required):

```bash
wrangler kv:key list --binding WAITLIST | \
  jq -r '.[].name' | \
  while read k; do
    wrangler kv:key get --binding WAITLIST "$k"
    echo
  done > emails.jsonl
```

Each line in `emails.jsonl` is one signup record.

## Hardening (optional, do after first signups)

1. **Tighten CORS.** In `waitlist-worker.js`, change `ALLOWED_ORIGIN = '*'` to your packed extension id, e.g. `'chrome-extension://abcdefghijklmnop'`. Redeploy with `wrangler deploy`.
2. **Add a custom domain.** Uncomment the `[routes]` block in `wrangler.toml`, point a DNS record at the worker, and redeploy.
3. **Add a per-IP rate limit.** Out of scope for v1; Cloudflare Rules can do it without code changes if abuse appears.
4. **Add `host_permissions`.** Not required — the extension fetches the worker from popup/options pages, which are not subject to MV3 host-permission gating. If the call ever moves into a content script, add `"https://*.workers.dev/*"` (or your custom domain) to `manifest.json` `host_permissions`.

## Cost

Cloudflare's free tier covers 100k worker requests per day and 100k KV writes per day. A v1 waitlist will not approach either limit.

## Rotating or deleting all signups

Delete the KV namespace:

```bash
wrangler kv:namespace delete --binding WAITLIST
```

Then re-run step 3 + 4 + 5 above to create a fresh one. The extension keeps any locally-stored `waitlist_state.email` until the user clicks "Change email" or wipes the extension.
