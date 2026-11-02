/**
 * tailnetport MCP server. One tool: tailscale (action router).
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, while zod
 * still validates every tools/call argument set.
 *
 * Configuration is read from the environment at call time:
 * TAILSCALE_API_KEY (required), TAILSCALE_TAILNET (default "-"),
 * TAILSCALE_ALLOW_DESTRUCTIVE ("true" enables delete_device).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ACTIONS, formatPayload, resolveConfig, runTailscale, VERSION } from "./tailnet.js";
import type { FetchFn, TailscaleAction } from "./types.js";

const TailscaleArgs = z.object({
  action: z.enum(ACTIONS as unknown as [TailscaleAction, ...TailscaleAction[]]),
  id: z.string().optional(),
  confirm: z.boolean().optional(),
});

const TOOLS = [
  {
    name: "tailscale",
    description:
      "Run one Tailscale tailnet action: devices, device, device_routes, keys, acl, dns, users, help, authorize_device, or delete_device.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: [
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
          ],
          description: "Action to run: devices, device, device_routes, keys, acl, dns, users, help, authorize_device, or delete_device.",
        },
        id: { type: "string", description: "Device ID, required for the device, device_routes, authorize_device, and delete_device actions." },
        confirm: { type: "boolean", description: "Confirmation flag, must be true to allow the delete_device action." },
      },
      required: ["action"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "tailnetport", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = resolveConfig(process.env);
  try {
    if (name !== "tailscale") {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    const parsed = TailscaleArgs.parse(args ?? {});
    const out = await runTailscale(fetchFn, config, parsed);
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
