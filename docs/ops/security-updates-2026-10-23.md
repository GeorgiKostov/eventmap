# Security dependency update — 2026-10-23

Scope: local app dependencies from the portfolio security review. Committed and pushed 2026-11-12; not deployed.

- Next.js 15.5.20 → 15.5.28; manifest minimum raised to `^15.5.28`.
- DOMPurify 3.4.12 → 3.4.17 in the lockfile through PostHog's existing compatible range;
  no direct dependency or override added. This patches GHSA-cg2g-xh64-v4q7.
- MCP SDK 1.29.0 → 1.32.2 within the existing v1 API; manifest minimum raised to `^1.32.2`.
- sharp 0.34.5 → 0.35.5; added explicit `^0.35.5` dependency because Next's optional
  `^0.34.3 || ^0.35.5` range otherwise retained the vulnerable lockfile resolution.
  Next resolves the same patched sharp instance. Its platform/libvips lock entries update together.

Primary sources: [Next October 14 security bulletin](https://nextjs.org/blog/nextjs-security-update-october-14-2026),
[MCP v1 security release](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/1.32.0),
[DOMPurify sanitizer advisory](https://github.com/advisories/GHSA-cg2g-xh64-v4q7),
[MCP HTTP validation advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453).
Registry versions were checked on 2026-10-23. The existing MCP server uses stdio, not HTTP;
no HTTP transport, authentication or optional input limits were added.

## Verification

- `npm run build`: passed, including lint/type validity checks and all 111 generated pages.
- 42 existing targeted tests passed (including analytics-consent property sanitization): security-headers, request-security, account-security,
  admin-auth, account-flow, read-scaling, public-url, egress-bounds, event-jsonld and return-path.
- Actual stdio MCP client/server: initialization, listing all three tools and rejecting invalid
  `get_event` input passed without querying the database.
- sharp 0.35.5 / libvips 8.18.7: PNG encode/decode and dimension checks passed.
- `npm ls next @modelcontextprotocol/sdk sharp` and `git diff --check` passed.
- Baseline tracked tree was clean at main `10d9a90`; existing untracked `tmp/` artifacts preserved.

## Separate audit follow-up

`npm audit --omit=dev` still reports 14 package findings (2 critical, 7 high, 5 moderate).
These are residual dependency advisories, not proof of reachable app exposure or compromise.
The audited package names are `@hono/node-server`, `fast-uri`, `fflate`, `hono`,
`ip-address`, `maplibre-gl`, `nanoid`, `next`, `nodemailer`, `postcss`, `proxy-addr`, `qs`,
`source-map-js`, and `zod`. DOMPurify no longer appears in the audit. Zod's
GHSA-mrhx-c7xc-m3w5 (`<4.6.6`) appeared in the refreshed audit feed and is a separate follow-up.
Next's remaining audit entry inherits its pinned PostCSS dependency;
the October Next/sharp findings above are patched.

MapLibre's audit fix requires moving from v5 to v6; Nodemailer's complete fix requires moving
from v9 to v10. Review those migrations and affected call paths separately, then apply compatible
transitive fixes and rerun the relevant map/newsletter flows. No blanket audit fix or additional
major upgrade was applied. The production deployment still needs a separate release to receive
these local patches; global Node/system software was outside this app-only request.
