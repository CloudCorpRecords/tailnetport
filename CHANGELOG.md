# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `tailnetport devices|device|device-routes|keys|acl|dns|users|help|authorize-device|delete-device`
  and `tailnetport mcp`.
- MCP server (`tailnetport mcp`, stdio) with one router tool,
  `tailscale`, covering ten actions: `devices`, `device`,
  `device_routes`, `keys`, `acl`, `dns`, `users`, `help`,
  `authorize_device`, and `delete_device`.
- Calls go to the Tailscale API v2 at
  `https://api.tailscale.com/api/v2` with Bearer authentication from
  `TAILSCALE_API_KEY` (required; its absence errors before any
  request). `TAILSCALE_TAILNET` defaults to `-`.
- `delete_device` is double-gated: the call must carry
  `confirm: true` and the environment must set
  `TAILSCALE_ALLOW_DESTRUCTIVE=true`.
- The `help` action returns local documentation and makes no request.
- All HTTP goes through an injectable fetch function, so the test
  suite runs entirely on hand-written fixtures with no network access.
