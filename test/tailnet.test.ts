import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  helpText,
  normalizeConfig,
  resolveConfig,
  runTailscale,
} from "../src/tailnet.js";
import type { FetchFn, HttpResponse, TailscaleConfig } from "../src/types.js";

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

interface Call {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function fakeFetch(calls: Call[], body: unknown = {}): FetchFn {
  return async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    return jsonResponse(body);
  };
}

const BASE = "https://api.tailscale.com/api/v2";
const CFG: TailscaleConfig = { apiKey: "tskey-test" };

describe("configuration", () => {
  it("defaults the tailnet to - and destructive off", () => {
    const c = resolveConfig({ TAILSCALE_API_KEY: "k" });
    assert.equal(c.tailnet, "-");
    assert.equal(c.allowDestructive, false);
    assert.equal(c.baseUrl, BASE);
  });

  it("reads tailnet and the destructive opt-in from the environment", () => {
    const c = resolveConfig({
      TAILSCALE_API_KEY: "k",
      TAILSCALE_TAILNET: "example.com",
      TAILSCALE_ALLOW_DESTRUCTIVE: "true",
    });
    assert.equal(c.tailnet, "example.com");
    assert.equal(c.allowDestructive, true);
  });

  it("only the exact string true enables destructive actions", () => {
    assert.equal(resolveConfig({ TAILSCALE_ALLOW_DESTRUCTIVE: "yes" }).allowDestructive, false);
    assert.equal(normalizeConfig({ allowDestructive: true }).allowDestructive, true);
  });
});

describe("action to endpoint mapping", () => {
  it("devices lists the tailnet devices with Bearer auth", async () => {
    const calls: Call[] = [];
    const out = (await runTailscale(fakeFetch(calls, { devices: [{ id: "d1" }] }), CFG, {
      action: "devices",
    })) as { devices: unknown[] };
    assert.equal(out.devices.length, 1);
    assert.equal(calls[0].url, `${BASE}/tailnet/-/devices`);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers?.Authorization, "Bearer tskey-test");
  });

  it("uses the configured tailnet in tailnet-scoped paths", async () => {
    const calls: Call[] = [];
    await runTailscale(fakeFetch(calls), { apiKey: "k", tailnet: "example.com" }, { action: "users" });
    assert.equal(calls[0].url, `${BASE}/tailnet/example.com/users`);
  });

  it("device gets one device by id", async () => {
    const calls: Call[] = [];
    await runTailscale(fakeFetch(calls), CFG, { action: "device", id: "12345" });
    assert.equal(calls[0].url, `${BASE}/device/12345`);
    assert.equal(calls[0].method, "GET");
  });

  it("device_routes gets the routes for one device", async () => {
    const calls: Call[] = [];
    await runTailscale(fakeFetch(calls), CFG, { action: "device_routes", id: "12345" });
    assert.equal(calls[0].url, `${BASE}/device/12345/routes`);
  });

  it("keys lists the tailnet keys", async () => {
    const calls: Call[] = [];
    await runTailscale(fakeFetch(calls), CFG, { action: "keys" });
    assert.equal(calls[0].url, `${BASE}/tailnet/-/keys`);
  });

  it("acl gets the tailnet policy", async () => {
    const calls: Call[] = [];
    await runTailscale(fakeFetch(calls), CFG, { action: "acl" });
    assert.equal(calls[0].url, `${BASE}/tailnet/-/acl`);
  });

  it("dns fetches nameservers and preferences and returns both", async () => {
    const calls: Call[] = [];
    const out = (await runTailscale(fakeFetch(calls, { dns: ["1.1.1.1"] }), CFG, {
      action: "dns",
    })) as { nameservers: unknown; preferences: unknown };
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, `${BASE}/tailnet/-/dns/nameservers`);
    assert.equal(calls[1].url, `${BASE}/tailnet/-/dns/preferences`);
    assert.ok(out.nameservers);
    assert.ok(out.preferences);
  });
});

describe("validation before any request", () => {
  it("missing API key errors before any request is made", async () => {
    const calls: Call[] = [];
    await assert.rejects(
      () => runTailscale(fakeFetch(calls), {}, { action: "devices" }),
      /TAILSCALE_API_KEY is not set/,
    );
    assert.equal(calls.length, 0);
  });

  it("device without an id is rejected before any request", async () => {
    const calls: Call[] = [];
    await assert.rejects(
      () => runTailscale(fakeFetch(calls), CFG, { action: "device" }),
      /id is required/,
    );
    assert.equal(calls.length, 0);
  });

  it("device_routes, authorize_device and delete_device all require an id", async () => {
    const calls: Call[] = [];
    const f = fakeFetch(calls);
    const cfg: TailscaleConfig = { apiKey: "k", allowDestructive: true };
    await assert.rejects(() => runTailscale(f, cfg, { action: "device_routes" }), /id is required/);
    await assert.rejects(() => runTailscale(f, cfg, { action: "authorize_device" }), /id is required/);
    await assert.rejects(
      () => runTailscale(f, cfg, { action: "delete_device", confirm: true }),
      /id is required/,
    );
    assert.equal(calls.length, 0);
  });

  it("an unknown action is rejected", async () => {
    const calls: Call[] = [];
    await assert.rejects(
      () =>
        runTailscale(fakeFetch(calls), CFG, {
          action: "explode" as never,
        }),
      /Unknown action/,
    );
    assert.equal(calls.length, 0);
  });
});

describe("write and destructive actions", () => {
  it("authorize_device posts authorized=true for the device", async () => {
    const calls: Call[] = [];
    await runTailscale(fakeFetch(calls), CFG, { action: "authorize_device", id: "777" });
    assert.equal(calls[0].url, `${BASE}/device/777/authorized`);
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), { authorized: true });
  });

  it("delete_device refuses without confirm=true, before any request", async () => {
    const calls: Call[] = [];
    await assert.rejects(
      () =>
        runTailscale(fakeFetch(calls), { apiKey: "k", allowDestructive: true }, {
          action: "delete_device",
          id: "777",
        }),
      /confirm=true/,
    );
    assert.equal(calls.length, 0);
  });

  it("delete_device refuses when the destructive env gate is off, before any request", async () => {
    const calls: Call[] = [];
    await assert.rejects(
      () =>
        runTailscale(fakeFetch(calls), { apiKey: "k" }, {
          action: "delete_device",
          id: "777",
          confirm: true,
        }),
      /TAILSCALE_ALLOW_DESTRUCTIVE=true/,
    );
    assert.equal(calls.length, 0);
  });

  it("delete_device deletes when both gates are satisfied", async () => {
    const calls: Call[] = [];
    await runTailscale(fakeFetch(calls), { apiKey: "k", allowDestructive: true }, {
      action: "delete_device",
      id: "777",
      confirm: true,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}/device/777`);
    assert.equal(calls[0].method, "DELETE");
  });
});

describe("help action", () => {
  it("returns local documentation and makes no fetch, even without a key", async () => {
    const calls: Call[] = [];
    const out = (await runTailscale(fakeFetch(calls), {}, { action: "help" })) as string;
    assert.equal(calls.length, 0);
    assert.match(out, /delete_device/);
    assert.equal(out, helpText());
  });
});

describe("errors", () => {
  it("HTTP 403 surfaces status and upstream message", async () => {
    const failing: FetchFn = async () => jsonResponse({ message: "forbidden" }, 403, "Forbidden");
    await assert.rejects(() => runTailscale(failing, CFG, { action: "devices" }), /HTTP 403.*forbidden/);
  });

  it("network failure is wrapped with context", async () => {
    const failing: FetchFn = async () => {
      throw new Error("socket hang up");
    };
    await assert.rejects(
      () => runTailscale(failing, CFG, { action: "devices" }),
      /Tailscale API request failed: socket hang up/,
    );
  });
});
