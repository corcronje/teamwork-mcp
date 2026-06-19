import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { TeamworkClient } from "./teamworkClient.js";
import { logger } from "./logger.js";
import { MCPError, ValidationError, formatValidationError, AuthorizationError } from "./errors.js";

const config = loadConfig();
const client = new TeamworkClient(config);

const EDCTP_WORKFLOW_ID = 43645;
const EDCTP_STAGE_ALIASES = {
  selected: 183115,
  in_progress: 183117,
  qa_ready: 183120,
};

const server = new Server(
  {
    name: "teamwork-mcp-server",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

logger.info("Teamwork MCP server initialized", {
  version: "2.0.0",
  readOnly: config.readOnly,
  allowedProjectIds: config.allowedProjectIds.length || "none",
});

const schemas = {
  getMyTasks: z.object({
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(200).optional(),
    includeCompleted: z.boolean().optional(),
  }),
  getProjectTasks: z.object({
    projectId: z.union([z.number().int().positive(), z.string().min(1)]),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(200).optional(),
    includeCompleted: z.boolean().optional(),
  }),
  getTaskDetail: z.object({
    taskId: z.union([z.number().int().positive(), z.string().min(1)]),
  }),
  createTask: z.object({
    projectId: z.union([z.number().int().positive(), z.string().min(1)]),
    title: z.string().min(1),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    assigneeUserId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    taskListId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    priority: z.number().int().optional(),
    notifyUserIds: z.array(z.union([z.number().int().positive(), z.string().min(1)])).optional(),
    workflowId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    stageId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  }),
  updateTask: z.object({
    taskId: z.union([z.number().int().positive(), z.string().min(1)]),
    title: z.string().optional(),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    assigneeUserId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    priority: z.number().int().optional(),
    completed: z.boolean().optional(),
  }),
  moveTask: z.object({
    taskId: z.union([z.number().int().positive(), z.string().min(1)]),
    boardColumnId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    boardLaneId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    workflowId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    stageId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    position: z.number().int().optional(),
  }),
  moveTaskEasy: z.object({
    taskId: z.union([z.number().int().positive(), z.string().min(1)]),
    stage: z.enum(["selected", "in_progress", "qa_ready"]).optional(),
    workflowId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    stageId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  }),
  getWorkflowStages: z.object({
    workflowId: z.union([z.number().int().positive(), z.string().min(1)]),
  }),
  getTaskComments: z.object({
    taskId: z.union([z.number().int().positive(), z.string().min(1)]),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(200).optional(),
  }),
  addTaskComment: z.object({
    taskId: z.union([z.number().int().positive(), z.string().min(1)]),
    body: z.string().min(1),
  }),
  getNotifications: z.object({
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(200).optional(),
    onlyUnread: z.boolean().optional(),
  }),
  addTaskTimeEntry: z.object({
    taskId: z.union([z.number().int().positive(), z.string().min(1)]),
    description: z.string().optional(),
    date: z.string().min(8),
    time: z.string().min(4),
    hours: z.number().int().min(0).optional(),
    minutes: z.number().int().min(0).max(59).optional(),
    isbillable: z.boolean().optional(),
    personId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  }),
  uploadFileToTask: z.object({
    taskId: z.union([z.number().int().positive(), z.string().min(1)]),
    filePath: z.string().min(1),
    categoryId: z.number().int().min(0).optional(),
  }),
};

const tools = [
  {
    name: "teamwork_get_my_tasks",
    description: "List tasks assigned to the authenticated Teamwork user.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        includeCompleted: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_get_project_tasks",
    description: "List tasks for a specific Teamwork project.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { anyOf: [{ type: "number" }, { type: "string" }] },
        page: { type: "number" },
        pageSize: { type: "number" },
        includeCompleted: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_get_task_detail",
    description: "Get the full detail payload for a specific Teamwork task, including title and description.",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { anyOf: [{ type: "number" }, { type: "string" }] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_create_task",
    description: "Create a task in Teamwork.",
    inputSchema: {
      type: "object",
      required: ["projectId", "title"],
      properties: {
        projectId: { anyOf: [{ type: "number" }, { type: "string" }] },
        title: { type: "string" },
        description: { type: "string" },
        dueDate: { type: "string" },
        assigneeUserId: { anyOf: [{ type: "number" }, { type: "string" }] },
        taskListId: { anyOf: [{ type: "number" }, { type: "string" }] },
        priority: { type: "number" },
        notifyUserIds: {
          type: "array",
          items: { anyOf: [{ type: "number" }, { type: "string" }] },
        },
        workflowId: { anyOf: [{ type: "number" }, { type: "string" }] },
        stageId: { anyOf: [{ type: "number" }, { type: "string" }] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_update_task",
    description: "Update an existing Teamwork task.",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { anyOf: [{ type: "number" }, { type: "string" }] },
        title: { type: "string" },
        description: { type: "string" },
        dueDate: { type: "string" },
        assigneeUserId: { anyOf: [{ type: "number" }, { type: "string" }] },
        priority: { type: "number" },
        completed: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_move_task",
    description: "Move a task to another workflow stage (preferred) or legacy board column/lane.",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { anyOf: [{ type: "number" }, { type: "string" }] },
        boardColumnId: { anyOf: [{ type: "number" }, { type: "string" }] },
        boardLaneId: { anyOf: [{ type: "number" }, { type: "string" }] },
        workflowId: { anyOf: [{ type: "number" }, { type: "string" }] },
        stageId: { anyOf: [{ type: "number" }, { type: "string" }] },
        position: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_move_task_stage",
    description:
      "Move a task to a workflow stage quickly using a friendly stage alias (selected, in_progress, qa_ready) or explicit stageId/workflowId.",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { anyOf: [{ type: "number" }, { type: "string" }] },
        stage: {
          type: "string",
          enum: ["selected", "in_progress", "qa_ready"],
          description: "EDCTP shorthand alias for the destination stage",
        },
        workflowId: { anyOf: [{ type: "number" }, { type: "string" }] },
        stageId: { anyOf: [{ type: "number" }, { type: "string" }] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_get_workflow_stages",
    description: "List stages for a workflow board.",
    inputSchema: {
      type: "object",
      required: ["workflowId"],
      properties: {
        workflowId: { anyOf: [{ type: "number" }, { type: "string" }] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_get_task_comments",
    description: "Get comments for a specific task.",
    inputSchema: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { anyOf: [{ type: "number" }, { type: "string" }] },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_add_task_comment",
    description: "Add a comment to a task.",
    inputSchema: {
      type: "object",
      required: ["taskId", "body"],
      properties: {
        taskId: { anyOf: [{ type: "number" }, { type: "string" }] },
        body: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_get_notifications",
    description: "List Teamwork notifications for the authenticated user.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        onlyUnread: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_add_task_time_entry",
    description: "Add a time entry to a Teamwork task.",
    inputSchema: {
      type: "object",
      required: ["taskId", "date", "time"],
      properties: {
        taskId: { anyOf: [{ type: "number" }, { type: "string" }] },
        description: { type: "string" },
        date: { type: "string", description: "YYYYMMDD" },
        time: { type: "string", description: "HH:MM" },
        hours: { type: "number" },
        minutes: { type: "number" },
        isbillable: { type: "boolean" },
        personId: { anyOf: [{ type: "number" }, { type: "string" }] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "teamwork_upload_file_to_task",
    description: "Upload a local file and attach it to a Teamwork task.",
    inputSchema: {
      type: "object",
      required: ["taskId", "filePath"],
      properties: {
        taskId: { anyOf: [{ type: "number" }, { type: "string" }] },
        filePath: { type: "string" },
        categoryId: { type: "number" },
      },
      additionalProperties: false,
    },
  },
];

function textResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

/**
 * Format error for MCP response
 */
function formatMCPError(error) {
  // If already an MCPError, use its MCP format
  if (error instanceof MCPError) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(error.toMCPError(), null, 2),
        },
      ],
      isError: true,
    };
  }

  // Handle Zod validation errors
  if (error?.issues) {
    const validationError = new ValidationError(formatValidationError(error));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validationError.toMCPError(), null, 2),
        },
      ],
      isError: true,
    };
  }

  // Generic error handling
  const message = error instanceof Error ? error.message : String(error);
  const serverError = new MCPError(message, {
    code: "INTERNAL_ERROR",
    status: 500,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(serverError.toMCPError(), null, 2),
      },
    ],
    isError: true,
  };
}

function getCreatedTaskId(payload) {
  return (
    payload?.id ??
    payload?.task?.id ??
    payload?.TASKID ??
    payload?.taskId ??
    payload?.["todo-item"]?.id ??
    payload?.todoItem?.id
  );
}

function resolveStageMoveTarget({ stage, workflowId, stageId }) {
  const resolvedWorkflowId = workflowId ?? EDCTP_WORKFLOW_ID;
  const resolvedStageId = stageId ?? (stage ? EDCTP_STAGE_ALIASES[stage] : undefined);

  if (resolvedStageId === undefined || resolvedStageId === null) {
    throw new ValidationError("Missing destination stage: provide stageId or stage alias (selected, in_progress, qa_ready)", {
      context: { provided: { stage, workflowId, stageId } },
    });
  }

  return {
    workflowId: resolvedWorkflowId,
    stageId: resolvedStageId,
  };
}

function ensureWriteAllowed(projectId) {
  if (config.readOnly) {
    throw new AuthorizationError("Write action blocked: TEAMWORK_READ_ONLY=true");
  }

  if (!config.allowedProjectIds.length) {
    return;
  }

  if (!projectId) {
    return;
  }

  if (!config.allowedProjectIds.includes(String(projectId))) {
    throw new AuthorizationError(`Write action blocked: project ${projectId} is not in TEAMWORK_ALLOWED_PROJECT_IDS`, {
      context: { projectId, allowedProjects: config.allowedProjectIds },
    });
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments || {};
  const startTime = Date.now();

  try {
    switch (name) {
      case "teamwork_get_my_tasks": {
        const parsed = schemas.getMyTasks.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        const data = await client.getMyTasks(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_get_project_tasks": {
        const parsed = schemas.getProjectTasks.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        const data = await client.getProjectTasks(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_get_task_detail": {
        const parsed = schemas.getTaskDetail.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        const data = await client.getTask(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_create_task": {
        const parsed = schemas.createTask.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        ensureWriteAllowed(parsed.data.projectId);
        const data = await client.createTask(parsed.data);

        if (parsed.data.workflowId && parsed.data.stageId) {
          const createdTaskId = getCreatedTaskId(data);
          if (!createdTaskId) {
            throw new ValidationError("Task was created but could not infer task ID for workflow stage move");
          }

          await client.moveTaskToWorkflowStage({
            taskId: createdTaskId,
            workflowId: parsed.data.workflowId,
            stageId: parsed.data.stageId,
          });

          const verifyTask = await client.getTask({ taskId: createdTaskId });
          const result = {
            createResult: data,
            stageMove: {
              workflowId: parsed.data.workflowId,
              stageId: parsed.data.stageId,
              currentStageId: verifyTask?.task?.workflowStages?.[0]?.stageId,
            },
          };
          logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
          return textResult(result);
        }

        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_update_task": {
        const parsed = schemas.updateTask.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        ensureWriteAllowed();
        const data = await client.updateTask(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_move_task": {
        const parsed = schemas.moveTask.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        ensureWriteAllowed();
        const data = await client.moveTask(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_move_task_stage": {
        const parsed = schemas.moveTaskEasy.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        ensureWriteAllowed();
        const target = resolveStageMoveTarget(parsed.data);
        const data = await client.moveTask({
          taskId: parsed.data.taskId,
          workflowId: target.workflowId,
          stageId: target.stageId,
        });
        const result = {
          ...data,
          requestedStageAlias: parsed.data.stage,
        };
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(result);
      }

      case "teamwork_get_workflow_stages": {
        const parsed = schemas.getWorkflowStages.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        const data = await client.getWorkflowStages(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_get_task_comments": {
        const parsed = schemas.getTaskComments.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        const data = await client.getTaskComments(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_add_task_comment": {
        const parsed = schemas.addTaskComment.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        ensureWriteAllowed();
        const data = await client.addTaskComment(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_get_notifications": {
        const parsed = schemas.getNotifications.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        const data = await client.getNotifications(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_add_task_time_entry": {
        const parsed = schemas.addTaskTimeEntry.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        ensureWriteAllowed();
        const data = await client.addTaskTimeEntry(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      case "teamwork_upload_file_to_task": {
        const parsed = schemas.uploadFileToTask.safeParse(args);
        if (!parsed.success) throw new ValidationError(formatValidationError(parsed.error));
        ensureWriteAllowed();
        const data = await client.uploadFileToTask(parsed.data);
        logger.logToolCall(name, args, { status: "success", duration: Date.now() - startTime });
        return textResult(data);
      }

      default:
        throw new ValidationError(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.logToolCall(name, args, { status: "error", duration: Date.now() - startTime, error });
    return formatMCPError(error);
  }
});

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Teamwork MCP server connected to stdio transport");
} catch (error) {
  logger.error("Failed to start Teamwork MCP server", {
    error,
  });
  process.exit(1);
}
