#!/usr/bin/env node
/**
 * CLI: move a task to a workflow stage by name or id, for any project.
 *
 *   npm run task:move-stage -- --taskId 123 --stage "in progress"
 *   npm run task:move-stage -- --taskId 123 --stage 456 [--workflowId 789]
 *
 * The workflow is inferred from the task itself and the stage name is resolved
 * against that workflow's real stages (see src/stages.js); nothing is hardcoded.
 * Respects TEAMWORK_READ_ONLY and TEAMWORK_ALLOWED_PROJECT_IDS.
 */
import { loadConfig } from "./config.js";
import { TeamworkClient } from "./teamworkClient.js";
import { guardWrite } from "./tools.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = value;
    i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.taskId) throw new Error("Missing --taskId");
  const stage = args.stage ?? args.stageId;
  if (!stage) throw new Error('Provide --stage "<name or id>"');

  const config = loadConfig();
  const client = new TeamworkClient(config);
  await guardWrite({ config, client }, { taskId: args.taskId });
  const result = await client.moveTaskToStage({ taskId: args.taskId, stage, workflowId: args.workflowId });
  console.log(JSON.stringify({ success: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error), context: error?.context }, null, 2)
  );
  process.exit(1);
});
