# Fragment Mailer

Preview and author MJML-based emails driven by AEM Content Fragments, with a half-automated handoff to Adobe Journey Optimizer.

## What this is

Fragment Mailer is a POC tool that sits between AEM (content source) and AJO (sending platform). It lets marketing authors see exactly how their Content Fragment edits will render in a final email — before the AJO team ever sees it.

**Problems it solves:**
- Authors edit CFs with no visibility into how content renders in the email
- AJO's editor exposes raw CF reference syntax to authors (`{{fragment id='aem:...'}}`)
- Plain-text CF fields accumulate raw HTML markup that gets escaped in proof emails
- No way to preview offer variations without setting up multiple AJO campaigns

**What it does:**
- Fetches CFs from AEM Publish via the CF Delivery OpenAPI
- Renders MJML templates with CF content resolved + profile tokens preserved
- Serves a preview iframe (Universal Editor can attach for inline editing)
- Validates CF content for common authoring mistakes
- Previews multiple offer CF variants against the same template
- Exports final HTML + manifest JSON for the AJO team to import

**What it is not:** a replacement for AJO. It does not send emails, manage journeys, or store profiles.

---

## Running locally

### Prerequisites

- Node.js 18+
- `npm` or `pnpm`

### Setup

```bash
# Install dependencies
npm install

# Copy env template (mock mode is on by default)
cp .env.example .dev.vars

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

With `MOCK_MODE=true` (the default in `.dev.vars`), the app uses fixtures from `tests/fixtures/` and does not call AEM or AJO. Any contributor can run it without Adobe credentials.

**Preview a campaign:**
```
http://localhost:5173/preview/mock-campaign-1
```

**Open the editor:**
```
http://localhost:5173/editor/mock-campaign-1
```

### Running tests

```bash
npm test
```

Tests cover the resolver (token substitution, conditionals) and the validator (HTML-as-text, unresolved tokens, empty tags).

---

## Deploying to Cloudflare

```bash
# Build and deploy
npm run deploy

# Set secrets (do not commit these)
wrangler secret put AEM_API_KEY
wrangler secret put IMS_CLIENT_SECRET
```

Set env vars via `wrangler.jsonc` or the Cloudflare dashboard. See `.env.example` for the full list.

---

## Project structure

```
src/
  lib/
    aem/          # AEM CF Delivery API client + types
    ajo/          # AJO Content Templates API client (stub for v0)
    auth/         # Adobe IMS service token handler
    render/
      resolve.ts  # Three-namespace token resolver
      mjml.ts     # MJML compilation wrapper (uses mjml-browser)
      inject-ue.ts # Universal Editor attribute injector
      validate.ts  # Content validation rules
    templates/
      registry.ts  # Template loader
      files/       # .mjml templates + .template.json sidecars
    personas/     # Sample personas for preview rendering
    manifest/     # AJO handoff manifest builder
  routes/
    /             # Campaign picker landing page
    editor/[id]/  # Three-panel editor UI
    preview/[id]/ # Preview HTML endpoint (iframe source)
    api/
      campaigns/[id]/ # GET campaign + CF data
      render/         # POST → rendered HTML
      validate/       # POST CF fields → validation warnings
      export/         # GET → { html, manifest } for AJO handoff
tests/
  render.test.ts
  validate.test.ts
  fixtures/       # Mock CF and campaign data
```

---

## Token namespaces

MJML templates use a simple three-namespace token system:

| Token | Example | Resolved by |
|---|---|---|
| `cf.*` | `{{cf.heroHeadline}}` | Primary CF fields |
| `cf.ref.*` | `{{cf.featuredOffer.headline}}` | Referenced CF (one level deep) |
| `profile.*` | `{{profile.person.name.firstName}}` | Sample persona (preview) / AJO send-time (export) |
| `static.*` | `{{static.year}}` | Build-time constants |

Conditional blocks: `{{#if cf.fieldName}}...{{else}}...{{/if}}`

---

## Adding a template

1. Create `src/lib/templates/files/your-template.mjml`
2. Create `src/lib/templates/files/your-template.template.json` (follow `promo.template.json`)
3. Add an import entry in `src/lib/templates/registry.ts`

Templates are bundled with the Worker at build time via Vite's `?raw` import — no file system access needed at runtime.

---

## Universal Editor preview (Author-tier CF integration)

### How it works

The `/ue/:fragmentId` route renders a live Content Fragment from AEM Author inside a
Universal Editor iframe. It uses the **CF Management OpenAPI** (`/adobe/sites/cf`) with
the IMS bearer token forwarded by UE — not service credentials, not GraphQL.

### Query params consumed on first open

| Param | Source | Description |
|---|---|---|
| `login-token` | UE | IMS bearer token for the logged-in author |
| `author` | UE | Full Author host URL, e.g. `https://author-p12345-e67890.adobeaemcloud.com` |
| `publish` | UE | Publish host (stored but not used for API calls) |
| `env` | UE | Environment hint (informational) |

On first open, the server reads these params, stores the token in an **httpOnly cookie**
(`aem_token`), and redirects to the clean URL. Subsequent loads use the cookie. The token
never appears in rendered HTML.

### Required UE configuration

In your UE config JSON (`/universal-editor-configuration.json` or the AEM page component):

```json
{
  "connections": [
    { "name": "aemconnection", "protocol": "aem", "uri": "https://author-pXXXX-eXXXX.adobeaemcloud.com" }
  ]
}
```

Point UE at `https://<this-app-origin>/ue/<fragmentId>` as the preview URL.

### Local dev story

1. Run `npm run dev` (Vite dev server at `http://localhost:5173`)
2. Open the route directly with mock params:
   ```
   http://localhost:5173/ue/<fragment-uuid>?login-token=<your-IMS-token>&author=https://author-pXXXX-eXXXX.adobeaemcloud.com
   ```
3. The server sets an httpOnly cookie and redirects to `/ue/<fragment-uuid>`.
4. For real editing, attach the Universal Editor desktop app or open from the AEM Author Sites console.

### CORS / X-Frame-Options notes (verify before production)

- **AEM Author CORS**: The CF Management OpenAPI has its own CORS policy on Author, separate
  from GraphQL or dispatcher CORS. All AEM calls here are **server-to-server** (SvelteKit →
  Author), so browser-level CORS does not apply. No allowlist changes needed for API calls.
- **X-Frame-Options on Author**: AEM Author sets `X-Frame-Options: SAMEORIGIN` by default.
  The UE service (`universal-editor-service.adobe.io`) is exempt, but if you embed any
  Author-hosted asset directly in the iframe you may hit this. Confirm with the AEM ops team.
- **Session cookie `SameSite`**: The `aem_token` cookie is set with `SameSite=None; Secure`
  when the app is served over HTTPS. On `http://localhost` it falls back to `SameSite=Lax`
  (HTTPS not required in local dev). UE production deployments must be HTTPS.

---

## Open spikes (blocking for production)

### 1. AJO Content Templates API — CF reference preservation

**Question:** Does the AJO Content Templates API preserve `{{fragment id='aem:UUID' result='cfN'}}{{cfN.fieldName}}` syntax when importing HTML? Or does it strip/escape it?

**Current best guess:** Based on observed AJO editor behavior, CF reference syntax is `{{fragment id='aem:UUID' result='cfN'}}{{cfN.fieldName}}`. The UUIDs must be actual AEM CF UUIDs, not DAM paths.

**Why it matters:** If AJO strips the syntax, the export strategy shifts to "baked-content-only" — CF values are baked in at export time and AJO only injects profile tokens at send time. This degrades real-time CF updates.

**How to resolve:** Test against a real AJO sandbox with a known CF UUID. File: `src/lib/ajo/client.ts`.

### 2. AEM CF Delivery API latency

**Question:** Is the CF Delivery OpenAPI fast enough for sub-500ms preview renders on every keypress (500ms debounce)?

**Why it matters:** If the CF fetch takes >300ms consistently, the preview UX degrades. May need a KV-backed cache layer (TTL: 5s for preview, bypass for export).

**How to resolve:** Measure P50/P99 for the CF Delivery endpoint against the target AEM environment.

### 3. Universal Editor overlay on Worker-served HTML

**Question:** Can the UE overlay attach to preview HTML served by a Cloudflare Worker, or does it require AEM-hosted content?

**Current assumption:** The preview HTML includes the UE init script and a `<meta name="urn:adobe:aue:system:aemconnection">` tag pointing at AEM Publish. UE writes back directly to AEM via the AEMaaCS Universal Editor service. The Worker acts as a rendering proxy only.

**Why it matters:** If UE can't attach, inline editing in the preview doesn't work. The tool still works for read-only preview and export.

**How to resolve:** Prototype UE init in a Worker-served iframe against a real AEM environment.

### 4. MJML on Cloudflare Workers — partially resolved

**Dev environment**: Uses standard `mjml` v5 (async API — `compileMJML` is `async`). Works fine locally and in Vite SSR.

**Workers environment**: `mjml-browser` v5.2.2 was tested and found to return empty objects (broken release). Standard `mjml` v5 is async and does not call `fs` at compile time, so it _should_ work with `nodejs_compat` on Workers. **This needs a smoke test in a real Workers environment before production** — add a `wrangler dev` test that hits `/preview/mock-campaign-1` on a deployed Worker.

Files: `src/lib/render/mjml.ts`, `package.json`.
