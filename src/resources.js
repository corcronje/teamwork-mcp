/**
 * MCP Resource definitions for Teamwork entities
 * Enables introspection and structured access to Tasks, Projects, and Workflows
 *
 * Resource URIs:
 * - task://<taskId> - Returns full task details
 * - project://<projectId> - Returns project details with task lists
 * - workflow://<workflowId> - Returns workflow with all stages
 *
 * TODO: Currently planned for v2.1
 * This module is a placeholder for future resource support
 */

export const RESOURCES = [];

/**
 * List all available resources
 * @returns {Array<{uri: string, name: string, description: string}>}
 */
export function listResources() {
  return RESOURCES;
}

/**
 * Read a specific resource by URI
 * @param {string} uri - Resource URI (e.g., task://123)
 * @param {TeamworkClient} client - Client instance for fetching data
 * @returns {Promise<{uri: string, contents: Array}>}
 */
export async function readResource(uri, client) {
  // TODO: Implement in v2.1
  throw new Error("Resources are not yet implemented. Planned for v2.1.");
}
