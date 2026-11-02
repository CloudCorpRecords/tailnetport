# tailnetport — Build Report

MCP Rebuild 1000, Tranche Batch 4. Clean-room rebuild of
dinglebear-ai/rtailscale (candidate ai.dinglebear/rtailscale,
rank 127, 5 stars, tier B), built from the public README spec
captured in `harness/fixtures/rtailscale-tools-original.json`.
That fixture is docs-derived: the single router tool and its
10-action catalogue come from the README's MCP Tool Reference,
and the action-to-endpoint mapping is a documented reconstruction
from the public Tailscale API v2 — no original server was probed.
Parity proves the rebuild matches this program's defined spec,
labelled docs-derived. Local build only — nothing pushed or
published.

Identity: repo `tailnetport`, npm `@reneturcios/tailnetport`,
MCP name `io.github.CloudCorpRecords/tailnetport`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `tailnetport: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Tailscale tailnet admin via one
  router tool: devices, keys, ACL, DNS, and users." = **80 chars**
  (≤100 ✓); npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/tailnetport:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/tailnetport"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (per-action subcommands `devices`,
  `device`, `device-routes`, `keys`, `acl`, `dns`, `users`, `help`,
  `authorize-device`, `delete-device`, plus `mcp`, `--version`;
  exit 2 usage / 1 API error), `src/mcp.ts`, `src/types.ts`,
  `src/tailnet.ts` (core logic, `VERSION = "0.1.0"`)
- `test/tailnet.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to tailnetport)

## Tool implemented (1)

`tailscale` — a single action router. inputSchema:
`{action: string enum of the 10 actions (required), id: string,
confirm: boolean}`, required `[action]`.

Actions: `devices`, `device` (id req), `device_routes` (id req),
`keys`, `acl`, `dns`, `users`, `help` (no params), plus write
`authorize_device` (id req) and destructive `delete_device`
(id req, confirm=true req).

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an explicit
  inputSchema literal, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the defined spec
  and break exact schema parity. Zod still validates every
  `tools/call`.
- Endpoint mapping under the base URL
  `https://api.tailscale.com/api/v2` (documented reconstruction
  from the public Tailscale API; tailnet and id are URL-encoded):
  `devices` → `GET /tailnet/{tailnet}/devices`;
  `device` → `GET /device/{id}`;
  `device_routes` → `GET /device/{id}/routes`;
  `keys` → `GET /tailnet/{tailnet}/keys`;
  `acl` → `GET /tailnet/{tailnet}/acl`;
  `dns` → `GET /tailnet/{tailnet}/dns/nameservers` **and**
  `GET /tailnet/{tailnet}/dns/preferences`, both payloads returned
  together as `{nameservers, preferences}` (the spec groups the two
  DNS reads under one action; the combined shape is a documented
  local choice);
  `users` → `GET /tailnet/{tailnet}/users`;
  `authorize_device` → `POST /device/{id}/authorized` with body
  `{"authorized": true}`;
  `delete_device` → `DELETE /device/{id}`.
- Configuration: `TAILSCALE_API_KEY` is required — its absence
  throws before any request is built. `TAILSCALE_TAILNET` defaults
  to `-`. All requests carry `Authorization: Bearer <key>`.
- Destructive gate (part of the spec, both halves implemented):
  `delete_device` refuses unless the call carries
  `confirm === true` **and** the resolved config has
  `allowDestructive` set (from env `TAILSCALE_ALLOW_DESTRUCTIVE`
  being exactly `"true"`). Either gate missing refuses before any
  request; both checks are unit-tested separately and together.
- `help` performs no HTTP and needs no API key: it returns the
  local action documentation string.
- Actions that need an id reject a missing/blank id before any
  request; unknown actions are rejected the same way.
- HTTP failures surface the status plus the upstream `message` or
  `error` string when present; a 204 response maps to
  `{ok: true, status: 204}`.
- All HTTP flows through an injectable `FetchFn` (types.ts). The
  test suite uses a fake fetch returning hand-written fixtures;
  no live call is made in tests.

## Verification (foreground, exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced, including `dist/cli.js`.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 21
ℹ pass 21
ℹ fail 0
```
Covers: config defaults (tailnet `-`, destructive off), env
reading, exact-`true` destructive opt-in; action→endpoint mapping
for devices (incl. Bearer header), custom tailnet, device,
device_routes, keys, acl, dns (two calls, both payloads returned),
users; missing-key error before any request (zero fetch calls);
id-required rejection for device / device_routes /
authorize_device / delete_device; unknown action rejection;
authorize POST path, method and `{"authorized":true}` body;
delete refused without confirm, delete refused with the env gate
off (both with zero fetch calls), delete succeeding with both
gates satisfied (DELETE to `/device/{id}`); help returning local
docs with no fetch and no key; HTTP 403 surfacing the upstream
message; network failure wrapping.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command exits 2 with
Usage; `help` printed the local action list (exit 0, no key set);
`devices` with no key exited 1 with
`error: TAILSCALE_API_KEY is not set: ...`. MCP `initialize` over
stdio is exercised by the parity run below, which connected to
`node dist/cli.js mcp` and listed tools successfully. No live
Tailscale call was made in smoke.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/rtailscale-tools-original.json \
    --rebuild "stdio:node .../builds/tailnetport/dist/cli.js mcp" \
    --out .../builds/tailnetport/parity-out
verdict=PASS parity_pct=100.0 original_tools=1 rebuild_tools=1 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 1/1.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
(`/tmp/tailnetport-lock/`) holding only `package.json` (no
`node_modules`), offline
`npm install --package-lock-only --ignore-scripts`, verified after
generation — parses as JSON, top-level `name` is
`@reneturcios/tailnetport`, version `0.1.0`, `lockfileVersion` 3,
128 package entries — then only the lockfile was copied back.
Local `node_modules` is a sibling copy (fxrates) used only for the
local build/test; it is not part of the lockfile generation.

## Gaps / honest notes

- Docs-derived spec: the tool/argument schema comes from the
  public README MCP Tool Reference, and the endpoint mapping is a
  documented reconstruction from the public Tailscale API v2 — no
  original rtailscale server was probed, so parity proves the
  rebuild matches this program's defined spec, not a hand-probed
  original.
- The `dns` action's combined `{nameservers, preferences}` result
  shape is a local choice: the spec groups both DNS reads under
  one action but does not publish an exact result layout.
- No live call was made: every endpoint is fake-fetch tested only,
  so live payload/response-shape drift against api.tailscale.com
  is unverified until the publish wave.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
