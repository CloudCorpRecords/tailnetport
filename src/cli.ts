#!/usr/bin/env node
/**
 * tailnetport CLI.
 *
 *   tailnetport devices
 *   tailnetport device <id>
 *   tailnetport device-routes <id>
 *   tailnetport keys
 *   tailnetport acl
 *   tailnetport dns
 *   tailnetport users
 *   tailnetport help
 *   tailnetport authorize-device <id>
 *   tailnetport delete-device <id> --confirm
 *   tailnetport mcp
 *
 * Configuration from the environment: TAILSCALE_API_KEY (required),
 * TAILSCALE_TAILNET (default "-"), TAILSCALE_ALLOW_DESTRUCTIVE
 * ("true" enables delete-device, which also needs --confirm).
 * Exit codes: 0 success, 1 API error, 2 usage error.
 */
import { formatPayload, resolveConfig, runTailscale, VERSION } from "./tailnet.js";
import type { FetchFn, TailscaleAction } from "./types.js";

function usage(): never {
  console.error(`Usage:
  tailnetport devices
  tailnetport device <id>
  tailnetport device-routes <id>
  tailnetport keys
  tailnetport acl
  tailnetport dns
  tailnetport users
  tailnetport help
  tailnetport authorize-device <id>
  tailnetport delete-device <id> --confirm
  tailnetport mcp
  tailnetport --version`);
  process.exit(2);
}

const COMMANDS: Record<string, { action: TailscaleAction; needsId: boolean }> = {
  devices: { action: "devices", needsId: false },
  device: { action: "device", needsId: true },
  "device-routes": { action: "device_routes", needsId: true },
  keys: { action: "keys", needsId: false },
  acl: { action: "acl", needsId: false },
  dns: { action: "dns", needsId: false },
  users: { action: "users", needsId: false },
  help: { action: "help", needsId: false },
  "authorize-device": { action: "authorize_device", needsId: true },
  "delete-device": { action: "delete_device", needsId: true },
};

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const spec = COMMANDS[cmd];
  if (!spec) usage();
  const id = spec.needsId ? rest.find((a) => !a.startsWith("--")) : undefined;
  if (spec.needsId && !id) usage();
  const confirm = rest.includes("--confirm");
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = resolveConfig(process.env);
  try {
    const out = await runTailscale(fetchFn, config, {
      action: spec.action,
      id,
      confirm: spec.action === "delete_device" ? confirm : undefined,
    });
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
