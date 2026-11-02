/**
 * tailnetport types.
 *
 * The server exposes a single action-router tool, so the input
 * surface is one options object: an action name plus the optional
 * device id and confirmation flag a few actions need. Runtime
 * configuration (API key, tailnet, destructive opt-in) is kept
 * separate from per-call arguments. HTTP access is described by a
 * minimal response surface so tests can inject a fake fetch and
 * never touch the network.
 */

/** The ten actions the router understands. */
export type TailscaleAction =
  | "devices"
  | "device"
  | "device_routes"
  | "keys"
  | "acl"
  | "dns"
  | "users"
  | "help"
  | "authorize_device"
  | "delete_device";

export interface TailscaleCallOptions {
  action: TailscaleAction;
  id?: string;
  confirm?: boolean;
}

/** Runtime configuration, normally resolved from the environment. */
export interface TailscaleConfig {
  apiKey?: string;
  tailnet?: string;
  allowDestructive?: boolean;
  baseUrl?: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
