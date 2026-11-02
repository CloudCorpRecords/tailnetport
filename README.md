# tailnetport

tailnetport administers a Tailscale tailnet through a single
action-router tool. One call names an action — list devices, inspect
one device or its routes, read keys, the ACL policy, DNS settings or
users, authorize a device, or delete one — and the router maps it to
the Tailscale API v2. One binary serves a command-line interface and
a stdio MCP server.

An API key is required. Set `TAILSCALE_API_KEY` in the environment;
without it, every network action fails before a request is made.
`TAILSCALE_TAILNET` selects the tailnet and defaults to `-` (the
tailnet the key belongs to).

Deletion is double-gated: the `delete_device` action only runs when
the call carries `confirm: true` **and** the environment sets
`TAILSCALE_ALLOW_DESTRUCTIVE=true`. Either gate missing refuses the
delete before any request.

## Install

```bash
npx @reneturcios/tailnetport devices
```

Or run the container image:

```bash
docker run -i -e TAILSCALE_API_KEY=... ghcr.io/cloudcorprecords/tailnetport
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
tailnetport devices
tailnetport device 12345
tailnetport device-routes 12345
tailnetport keys
tailnetport acl
tailnetport dns
tailnetport users
tailnetport help
tailnetport authorize-device 12345
tailnetport delete-device 12345 --confirm   # also needs TAILSCALE_ALLOW_DESTRUCTIVE=true

tailnetport --version
```

Commands print the upstream JSON payload; `help` prints the local
action list and makes no request. Exit codes: `0` on success, `1`
when a call fails (including an upstream API error or a refused
gate), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/tailnetport mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "tailnetport": {
      "command": "npx",
      "args": ["-y", "@reneturcios/tailnetport", "mcp"],
      "env": {
        "TAILSCALE_API_KEY": "tskey-...",
        "TAILSCALE_TAILNET": "-"
      }
    }
  }
}
```

Add `TAILSCALE_ALLOW_DESTRUCTIVE: "true"` to that `env` only if you
want the server to be able to delete devices (each delete still
needs `confirm: true` in the call).

### Tool

One tool, `tailscale`, routes on its `action` argument:

| Action | Extra input | What it does |
| --- | --- | --- |
| `devices` | — | List devices in the tailnet. |
| `device` | `id` (required) | Get one device. |
| `device_routes` | `id` (required) | Get the routes advertised by one device. |
| `keys` | — | List API keys for the tailnet. |
| `acl` | — | Get the tailnet ACL policy. |
| `dns` | — | Get DNS nameservers and preferences for the tailnet. |
| `users` | — | List users in the tailnet. |
| `help` | — | Return the local action documentation; no API request. |
| `authorize_device` | `id` (required) | Authorize one device. |
| `delete_device` | `id` and `confirm: true` (both required) | Delete one device. Also requires `TAILSCALE_ALLOW_DESTRUCTIVE=true`. |

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
