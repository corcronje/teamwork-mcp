/**
 * Version and capability declarations for Teamwork MCP server
 * Follows MCP spec for version management and feature declarations
 */

export const VERSION = "3.0.0";

// Negotiated by @modelcontextprotocol/sdk at connect time; informational only.
export const MCP_VERSION = "2025-06-18";

export const CAPABILITIES = {
  tools: true,
  resources: false,
  prompts: false,
  sampling: false,
  logging: true,
};

export const FEATURES = {
  // Core functionality
  taskManagement: true,
  commentManagement: true,
  timeTracking: true,
  fileUpload: true,
  workflowStages: true,

  // Resilience
  retryLogic: true,
  timeoutHandling: true,
  structuredLogging: true,

  // Configuration
  configFile: true,
  environmentVariables: true,
  flexibleAuth: true,
};

export const DEPRECATIONS = {};

/**
 * Get server metadata for MCP protocol
 */
export function getServerMetadata() {
  return {
    name: "teamwork-mcp-server",
    version: VERSION,
    mcp_version: MCP_VERSION,
    capabilities: CAPABILITIES,
    features: FEATURES,
    deprecations: DEPRECATIONS,
  };
}
