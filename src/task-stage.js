import { loadConfig } from "./config.js";
import { TeamworkClient } from "./teamworkClient.js";

const EDCTP_WORKFLOW_ID = 43645;
const STAGE_ALIASES = {
  selected: 183115,
  in_progress: 183117,
  qa_ready: 183120,
};

function parseArgs(argv) {
  const args = {
    workflowId: EDCTP_WORKFLOW_ID,
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    i += 1;
  }

  return args;
}

function resolveTargetStage({ stage, stageId }) {
  if (stageId) {
    return Number(stageId);
  }

  if (!stage) {
    throw new Error("Provide --stage <selected|in_progress|qa_ready> or --stageId <id>");
  }

  const resolved = STAGE_ALIASES[stage];
  if (!resolved) {
    throw new Error(`Unknown stage alias '${stage}'. Expected one of: ${Object.keys(STAGE_ALIASES).join(", ")}`);
  }

  return resolved;
}

async function main() {
  const args = parseArgs(process.argv);
  const taskId = args.taskId;
  if (!taskId) {
    throw new Error("Missing --taskId");
  }

  const workflowId = Number(args.workflowId || EDCTP_WORKFLOW_ID);
  const targetStageId = resolveTargetStage(args);

  const client = new TeamworkClient(loadConfig());
  const result = await client.moveTask({
    taskId,
    workflowId,
    stageId: targetStageId,
  });

  const verify = await client.getTask({ taskId });
  const currentStage = verify?.task?.workflowStages?.[0]?.stageId;

  console.log(
    JSON.stringify(
      {
        success: true,
        taskId: String(taskId),
        requestedStageId: targetStageId,
        currentStageId: currentStage,
        workflowId,
        moveResult: result,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
