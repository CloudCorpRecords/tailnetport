/**
 * tailnetport core: one action router over the Tailscale API v2.
 *
 * Action -> endpoint mapping (base https://api.tailscale.com/api/v2;
 * this mapping is a documented reconstruction from the public
 * Tailscale API reference):
 *
 *   devices           GET    /tailnet/{tailnet}/devices
 *   device            GET    /device/{id}
 *   device_routes     GET    /device/{id}/routes
 *   keys              GET    /tailnet/{tailnet}/keys
 *   acl               GET    /tailnet/{tailnet}/acl
 *   dns               GET    /tailnet/{tailnet}/dns/nameservers
 *                     GET    /tailnet/{tailnet}/dns/preferences
 *                     (both payloads returned together)
 *   users             GET    /tailnet/{tailnet}/users
 *   help              no HTTP; returns local action documentation
 *   authorize_device  POST   /device/{id}/authorized  {"authorized":true}
 *   delete_device     DELETE /device/{id}
 *
 * Configuration comes from the environment: TAILSCALE_API_KEY is
 * required for every network action and its absence is an error
 * raised before any request is attempted; TAILSCALE_TAILNET picks
 * the tailnet and defaults to "-"; TAILSCALE_ALLOW_DESTRUCTIVE must
 * be exactly "true" before delete_device can run, and the call must
 * also carry confirm: true — both gates are required, either one
 * missing refuses the delete before any request.
 *
 * All HTTP goes through an injected FetchFn carrying a Bearer
 * Authorization header, so tests run entirely on fixtures.
 */
import type {
  FetchFn,
  TailscaleAction,
  TailscaleCallOptions,
  TailscaleConfig,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://api.tailscale.com/api/v2";

export const API_KEY_ENV = "TAILSCALE_API_KEY";
export const TAILNET_ENV = "TAILSCALE_TAILNET";
export const ALLOW_DESTRUCTIVE_ENV = "TAILSCALE_ALLOW_DESTRUCTIVE";

export const ACTIONS: readonly TailscaleAction[] = [
  "devices",
  "device",
  "device_routes",
  "keys",
  "acl",
  "dns",
  "users",
  "help",
  "authorize_device",
  "delete_device",
];

const ID_ACTIONS: ReadonlySet<TailscaleAction> = new Set([
  "device",
  "device_routes",
  "authorize_device",
  "delete_device",
]);

/** Resolve runtime configuration from an environment-like record. */
export function resolveConfig(env: Record<string, string | undefined>): Required<TailscaleConfig> {
  const tailnet = typeof env[TAILNET_ENV] === "string" ? env[TAILNET_ENV]!.trim() : "";
  return {
    apiKey: typeof env[API_KEY_ENV] === "string" ? env[API_KEY_ENV]!.trim() : "",
    tailnet: tailnet ? tailnet : "-",
    allowDestructive: env[ALLOW_DESTRUCTIVE_ENV] === "true",
    baseUrl: DEFAULT_BASE_URL,
  };
}

/** Merge explicit config over defaults; tailnet falls back to "-". */
export function normalizeConfig(config: TailscaleConfig = {}): Required<TailscaleConfig> {
  const tailnet = typeof config.tailnet === "string" ? config.tailnet.trim() : "";
  const base = typeof config.baseUrl === "string" ? config.baseUrl.trim() : "";
  return {
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : "",
    tailnet: tailnet ? tailnet : "-",
    allowDestructive: config.allowDestructive === true,
    baseUrl: (base ? base : DEFAULT_BASE_URL).replace(/\/+$/, ""),
  };
}

function requireApiKey(config: Required<TailscaleConfig>): string {
  if (!config.apiKey) {
    throw new Error(
      `${API_KEY_ENV} is not set: an API key is required before any Tailscale request`,
    );
  }
  return config.apiKey;
}

function requireId(options: TailscaleCallOptions): string {
  const id = typeof options.id === "string" ? options.id.trim() : "";
  if (!id) throw new Error(`id is required for action "${options.action}"`);
  return id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Local documentation for the router, returned by the help action. */
export function helpText(): string {
  return [
    "tailscale action router — available actions:",
    "  devices            List devices in the tailnet.",
    "  device             Get one device. Requires id.",
    "  device_routes      Get the routes for one device. Requires id.",
    "  keys               List API keys for the tailnet.",
    "  acl                Get the tailnet ACL policy.",
    "  dns                Get DNS nameservers and preferences for the tailnet.",
    "  users              List users in the tailnet.",
    "  help               Show this text. Makes no API request.",
    "  authorize_device   Authorize one device. Requires id.",
    "  delete_device      Delete one device. Requires id and confirm=true,",
    `                     and ${ALLOW_DESTRUCTIVE_ENV}=true in the environment.`,
    `Configuration: ${API_KEY_ENV} (required), ${TAILNET_ENV} (default "-").`,
  ].join("\n");
}

async function callApi(
  fetchFn: FetchFn,
  config: Required<TailscaleConfig>,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const apiKey = requireApiKey(config);
  const url = `${config.baseUrl}${path}`;
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetchFn(url, init);
  } catch (err) {
    throw new Error(
      `Tailscale API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload)) {
        if (typeof payload.message === "string" && payload.message) {
          detail = `: ${payload.message}`;
        } else if (typeof payload.error === "string" && payload.error) {
          detail = `: ${payload.error}`;
        }
      }
    } catch {
      // A non-JSON error body still reports its HTTP status below.
    }
    throw new Error(
      `Tailscale API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  if (response.status === 204) return { ok: true, status: 204 };
  try {
    return await response.json();
  } catch {
    return { ok: true, status: response.status };
  }
}

/** Run one router action. This is the single entry point behind the tool. */
export async function runTailscale(
  fetchFn: FetchFn,
  config: TailscaleConfig,
  options: TailscaleCallOptions,
): Promise<unknown> {
  const action = options.action;
  if (!ACTIONS.includes(action)) {
    throw new Error(`Unknown action: ${String(action)}`);
  }
  if (action === "help") return helpText();

  const cfg = normalizeConfig(config);
  // The key check happens here, before any request is built.
  requireApiKey(cfg);

  const tailnet = encodeURIComponent(cfg.tailnet);
  switch (action) {
    case "devices":
      return callApi(fetchFn, cfg, "GET", `/tailnet/${tailnet}/devices`);
    case "device": {
      const id = encodeURIComponent(requireId(options));
      return callApi(fetchFn, cfg, "GET", `/device/${id}`);
    }
    case "device_routes": {
      const id = encodeURIComponent(requireId(options));
      return callApi(fetchFn, cfg, "GET", `/device/${id}/routes`);
    }
    case "keys":
      return callApi(fetchFn, cfg, "GET", `/tailnet/${tailnet}/keys`);
    case "acl":
      return callApi(fetchFn, cfg, "GET", `/tailnet/${tailnet}/acl`);
    case "dns": {
      const nameservers = await callApi(
        fetchFn,
        cfg,
        "GET",
        `/tailnet/${tailnet}/dns/nameservers`,
      );
      const preferences = await callApi(
        fetchFn,
        cfg,
        "GET",
        `/tailnet/${tailnet}/dns/preferences`,
      );
      return { nameservers, preferences };
    }
    case "users":
      return callApi(fetchFn, cfg, "GET", `/tailnet/${tailnet}/users`);
    case "authorize_device": {
      const id = encodeURIComponent(requireId(options));
      return callApi(fetchFn, cfg, "POST", `/device/${id}/authorized`, {
        authorized: true,
      });
    }
    case "delete_device": {
      const id = requireId(options);
      if (options.confirm !== true) {
        throw new Error(
          "delete_device requires confirm=true: pass confirm to acknowledge the deletion",
        );
      }
      if (!cfg.allowDestructive) {
        throw new Error(
          `delete_device is disabled: set ${ALLOW_DESTRUCTIVE_ENV}=true to allow destructive actions`,
        );
      }
      return callApi(fetchFn, cfg, "DELETE", `/device/${encodeURIComponent(id)}`);
    }
  }
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
