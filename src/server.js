#!/usr/bin/env node
/**
 * Teamwork MCP server (stdio transport).
 *
 * Works with any MCP client that can launch a stdio server:
 *   command: node   args: ["/absolute/path/to/teamwork-mcp/src/server.js"]
 * Configuration comes from environment variables (see README "Configuration").
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { TeamworkClient } from "./teamworkClient.js";
import { logger } from "./logger.js";
import { MCPError, ValidationError, formatValidationError } from "./errors.js";
import { buildTools } from "./tools.js";
import { VERSION } from "./version.js";

function textResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload ?? null, null, 2) }] };
}

export function formatMCPError(error) {
  let payload;
  if (error instanceof MCPError) payload = error.toMCPError();
  else if (error?.issues) payload = new ValidationError(formatValidationError(error)).toMCPError();
  else payload = new MCPError(error instanceof Error ? error.message : String(error), { code: "INTERNAL_ERROR", status: 500 }).toMCPError();
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: true };
}

/** Build an McpServer with every Teamwork tool registered (exported for tests). */
export function createServer({ config, client }) {
  const server = new McpServer({ name: "teamwork-mcp-server", version: VERSION });
  for (const tool of buildTools({ config, client })) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.write && config.readOnly ? `${tool.description} [Disabled: TEAMWORK_READ_ONLY=true]` : tool.description,
        inputSchema: tool.inputSchema,
        annotations: { title: tool.title, ...tool.annotations },
      },
      async (args) => {
        const startTime = Date.now();
        try {
          const result = await tool.handler(args ?? {});
          logger.logToolCall(tool.name, args ?? {}, { status: "success", duration: Date.now() - startTime });
          return textResult(result);
        } catch (error) {
          logger.logToolCall(tool.name, args ?? {}, { status: "error", duration: Date.now() - startTime, error });
          return formatMCPError(error);
        }
      }
    );
  }
  return server;
}

async function main() {
  const config = loadConfig();
  const client = new TeamworkClient(config);
  const server = createServer({ config, client });
  logger.info("Teamwork MCP server initialized", {
    version: VERSION,
    baseUrl: config.baseUrl,
    readOnly: config.readOnly,
    allowedProjectIds: config.allowedProjectIds.length ? config.allowedProjectIds : "all",
  });
  await server.connect(new StdioServerTransport());
  logger.info("Teamwork MCP server connected to stdio transport");
}

function isDirectRun() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().catch((error) => {
    logger.error("Failed to start Teamwork MCP server", { error });
    process.exit(1);
  });
}
