# NinjaOne proxy — Netlify Functions

Same job as the Azure version: holds the NinjaOne OAuth2 credentials,
exchanges them for a bearer token, and forwards ticketing calls. The
browser never sees the NinjaOne client secret.

One difference from Azure: Netlify doesn't have a built-in per-function
key. Instead, this function checks a shared secret you choose yourself
(`PROXY_SHARED_KEY`), sent as an `x-proxy-key` header on every call.

## Local setup

1. Install the CLI: `npm install -g netlify-cli`
2. `netlify login`, then from this folder run `netlify init` (to create a
   new site) or `netlify link` (to connect an existing one).
3. Copy `.env.example` to `.env` and fill in real values, including a
   long random string for `PROXY_SHARED_KEY`. `netlify dev` loads `.env`
   automatically for local runs — never commit it.
4. `netlify dev` starts a local server (default `http://localhost:8888`).

## Test locally

```
curl "http://localhost:8888/.netlify/functions/ninja?path=/v2/ticketing/ticket" \
  -H "x-proxy-key: <your PROXY_SHARED_KEY>"
```

You should get a JSON ticket list back, or a clear error if your NinjaOne
credentials are wrong — fix that before deploying.

## Set production environment variables

`.env` is local only. In the Netlify UI, go to **Site configuration >
Environment variables** and add the same five values (`NINJA_CLIENT_ID`,
`NINJA_CLIENT_SECRET`, `NINJA_INSTANCE`, `ALLOWED_ORIGIN`,
`PROXY_SHARED_KEY`) there too.

## User-context login (needed for posting comments)

Reads (tickets, boards, comments list) work fine under the app's client
credentials. Writes — specifically posting a comment — require a token
tied to an actual logged-in NinjaOne user instead, and each person's
comments post under *their own* identity, not a shared one. This uses
Netlify Blobs to store each person's refresh token, keyed by their email —
no manual copy-pasting into environment variables.

**One-time environment setup:**

1. On the NinjaOne app you registered, add **Authorization Code** as an
   additional allowed grant type (keep Client Credentials too — both can
   be enabled on the same app). Set the redirect URI to your deployed
   proxy's callback: `https://<your-site>.netlify.app/.netlify/functions/oauth-callback`.
2. Add `NINJA_REDIRECT_URI` to your environment variables (both `.env`
   locally and the Netlify UI for production) with that same URL.
3. Deploy the proxy so `ninja-login` and `oauth-callback` are live.

**What each person does (built into the web part):**

The first time someone tries to post a comment without having connected
their account, the ticket detail view shows a "Connect your account" link
instead of the comment box. Clicking it opens NinjaOne's login in a new
tab; after they sign in and approve access, their refresh token is stored
automatically and they can go back and post normally — this only needs to
happen once per person, unless NinjaOne later revokes their access.

Netlify Blobs works automatically in both `netlify dev` and production —
no separate account or setup needed beyond having the `@netlify/blobs`
dependency installed (`npm install` picks it up from `package.json`).

## Deploy

```
netlify deploy --prod --no-build
```

`--no-build` skips Netlify's default build step, which is correct here —
there's nothing to compile or bundle, just the functions to upload.

Or connect this folder to a Git repo in the Netlify UI for automatic
deploys on every push.

## Calling it once deployed

```
GET  https://<your-site>.netlify.app/.netlify/functions/ninja?path=/v2/ticketing/ticket
POST https://<your-site>.netlify.app/.netlify/functions/ninja?path=/v2/ticketing/ticket   (JSON body)
PATCH https://<your-site>.netlify.app/.netlify/functions/ninja?path=/v2/ticketing/ticket/123
```

Every call needs the `x-proxy-key` header. The SPFx web part is already
set up to send it — just put the site URL + `/.netlify/functions/ninja`
in the web part's "Proxy base URL" property and your `PROXY_SHARED_KEY`
value in "Proxy shared key".

## Locking it down further

- `ALLOWED_PATH_PREFIXES` in `ninja.js` restricts this proxy to ticketing
  endpoints only — widen deliberately, don't remove the check.
- Rotate `PROXY_SHARED_KEY` any time by changing the environment variable
  and updating the web part's property to match.
- The `ALLOWED_ORIGIN` check in code is a second layer — Netlify doesn't
  have a separate CORS allowlist setting the way Azure does.
- If someone's NinjaOne access is revoked, their stored refresh token will
  start failing — they'll see the "Connect your account" prompt again
  automatically and can redo the one-time login.
