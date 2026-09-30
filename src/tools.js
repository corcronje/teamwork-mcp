/**
 * MCP tool table for the Teamwork server.
 *
 * Each tool is defined exactly once here: name, description, zod input shape,
 * whether it writes, and a handler. src/server.js registers them with the MCP
 * SDK; tests can call the handlers directly.
 *
 * Every tool is project- and user-agnostic: project, workflow and stage ids are
 * always inputs or resolved at runtime, and "me" is always the user that owns
 * the configured API token (GET /me.json).
 */
import { z } from "zod";
import { AuthorizationError, ValidationError } from "./errors.js";

// ---------------------------------------------------------------------------
// Shared schema fragments
// ---------------------------------------------------------------------------

const id = (what) =>
  z.union([z.number().int().positive(), z.string().regex(/^\d+$/, `${what} must be a numeric id`)]).describe(`${what} (numeric id)`);
const date = (what) =>
  z.string().regex(/^(\d{4}-\d{2}-\d{2}|\d{8})$/, "expected YYYY-MM-DD or YYYYMMDD").describe(`${what}, YYYY-MM-DD (YYYYMMDD also accepted)`);
const clearableDate = (what) =>
  z.union([date(what), z.null()]).describe(`${what}, YYYY-MM-DD; null clears it`);
const time = z
  .string()
  .regex(/^\d{1,2}:\d{2}(:\d{2})?$/, "expected HH:MM (24h)")
  .describe("Start time of the work, HH:MM 24-hour, in the user's Teamwork timezone");
const priority = z.enum(["none", "low", "medium", "high"]).describe('"low", "medium", "high", or "none" to clear');
const stage = z
  .string()
  .min(1)
  .describe(
    'Stage (board lane) name, alias or id, matched against the task\'s/project\'s own workflow: e.g. "In Progress", "in_progress", "peer review", "done". Ambiguous names return an error listing the real stage names.'
  );
const detail = z
  .enum(["summary", "full"])
  .optional()
  .describe('"summary" (default, compact) or "full" (raw Teamwork payloads)');
const includeCompleted = z.boolean().optional().describe("Include completed tasks (default false)");
const page = z.number().int().positive().optional().describe("Page number, 1-based");
const pageSize = (max, def) => z.number().int().positive().max(max).optional().describe(`Page size (default ${def}, max ${max})`);
const filePaths = z.array(z.string().min(1)).min(1).describe("Absolute paths of local files to upload");

// ---------------------------------------------------------------------------
// Write guard: TEAMWORK_READ_ONLY + TEAMWORK_ALLOWED_PROJECT_IDS
// ---------------------------------------------------------------------------

/**
 * Resolve which project(s) a write touches and check them against config.
 * When an allowlist is configured, the owning project is looked up from
 * whatever id the tool received; if it cannot be resolved the write is refused
 * (fail closed). With no allowlist, no lookups are made.
 *
 * @param {{config:object, client:object}} ctx
 * @param {{projectId?, taskId?, taskListId?, commentId?, timeEntryId?, fileId?}} target
 */
export async function guardWrite({ config, client }, target = {}) {
  if (config.readOnly) {
    throw new AuthorizationError("Write blocked: TEAMWORK_READ_ONLY=true. Set TEAMWORK_READ_ONLY=false to enable write tools.");
  }
  const allowed = config.allowedProjectIds || [];
  if (!allowed.length) return;

  const projects = new Set();
  try {
    if (target.projectId) projects.add(String(target.projectId));
    if (target.taskId) projects.add(String(await client.getTaskProjectId(target.taskId)));
    if (target.taskListId) projects.add(String(await client.getTasklistProjectId(target.taskListId)));
    if (target.commentId) projects.add(String((await client.getComment({ commentId: target.commentId })).projectId));
    if (target.timeEntryId) projects.add(String((await client.getTimeEntry({ timeEntryId: target.timeEntryId })).projectId));
    if (target.fileId) projects.add(String((await client.getFile({ fileId: target.fileId })).projectId));
  } catch (error) {
    throw new AuthorizationError(`Write blocked: could not resolve the owning project (${error.message})`, { context: { target } });
  }
  projects.delete("undefined");
  projects.delete("null");
  if (!projects.size) {
    throw new AuthorizationError("Write blocked: could not resolve the owning project for the allowlist check", { context: { target } });
  }
  for (const p of projects) {
    if (!allowed.includes(p)) {
      throw new AuthorizationError(`Write blocked: project ${p} is not in TEAMWORK_ALLOWED_PROJECT_IDS`, {
        context: { projectId: p, allowedProjectIds: allowed },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Tool table
// ---------------------------------------------------------------------------

const READ = { readOnlyHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

/**
 * @param {{client: import('./teamworkClient.js').TeamworkClient, config: object}} ctx
 */
export function buildTools(ctx) {
  const { client } = ctx;
  const guard = (target) => guardWrite(ctx, target);

  const tools = [
    // ----- identity & projects ---------------------------------------------
    {
      name: "teamwork_get_current_user",
      title: "Who am I",
      description: "The Teamwork user that owns the configured API token. All 'my ...' tools act as this user.",
      inputSchema: {},
      annotations: READ,
      handler: () => client.getMe(),
    },
    {
      name: "teamwork_list_projects",
      title: "List my projects",
      description:
        "List projects visible to the token owner (for non-admin users: the projects they belong to), with each project's workflow (board) ids.",
      inputSchema: {
        status: z.enum(["active", "archived", "all"]).optional().describe('"active" (default), "archived", or "all"'),
        searchTerm: z.string().optional().describe("Filter by project name"),
      },
      annotations: READ,
      handler: (args) => client.listProjects(args),
    },
    {
      name: "teamwork_get_project_task_lists",
      title: "List task lists",
      description: "List the task lists in a project (to choose where a new task goes).",
      inputSchema: { projectId: id("projectId") },
      annotations: READ,
      handler: (args) => client.getProjectTaskLists(args),
    },

    // ----- task reads ------------------------------------------------------
    {
      name: "teamwork_get_my_tasks",
      title: "List my tasks",
      description:
        "List tasks directly assigned to the token owner, across all projects or within one. Open tasks only unless includeCompleted. Tasks assigned only through a team or company are not included.",
      inputSchema: {
        projectId: id("projectId").optional().describe("Only tasks in this project"),
        includeCompleted,
        page,
        pageSize: pageSize(500, 100),
        detail,
      },
      annotations: READ,
      handler: (args) => client.getMyTasks(args),
    },
    {
      name: "teamwork_get_project_tasks",
      title: "List project tasks",
      description: "List tasks in a project, optionally filtered by text or assignee. Open tasks only unless includeCompleted.",
      inputSchema: {
        projectId: id("projectId"),
        searchTerm: z.string().optional().describe("Text search on task name/description"),
        assigneeUserId: id("assigneeUserId").optional().describe("Only tasks assigned to this user"),
        includeCompleted,
        page,
        pageSize: pageSize(250, 50),
        detail,
      },
      annotations: READ,
      handler: (args) => client.getProjectTasks(args),
    },
    {
      name: "teamwork_get_task_detail",
      title: "Task detail",
      description: "Full Teamwork payload for one task (description, assignees, workflow stage, attachments...).",
      inputSchema: { taskId: id("taskId") },
      annotations: READ,
      handler: (args) => client.getTask(args),
    },

    // ----- boards / lanes --------------------------------------------------
    {
      name: "teamwork_get_project_board",
      title: "List board lanes",
      description: "The workflow(s) (board) attached to a project and their stages (lanes), in board order.",
      inputSchema: { projectId: id("projectId") },
      annotations: READ,
      handler: (args) => client.getProjectBoard(args),
    },
    {
      name: "teamwork_get_workflow_stages",
      title: "List workflow stages",
      description: "Stages of a workflow by workflow id. Use teamwork_get_project_board if you only know the project.",
      inputSchema: { workflowId: id("workflowId") },
      annotations: READ,
      handler: (args) => client.getWorkflowStages(args),
    },
    {
      name: "teamwork_get_stage_tasks",
      title: "List tasks in a lane",
      description:
        "List the tasks currently in one board lane. Give projectId + stage name (resolved against that project's workflow), or workflowId + stage.",
      inputSchema: {
        projectId: id("projectId").optional(),
        workflowId: id("workflowId").optional().describe("Needed only if the project has several workflows, or no projectId is given"),
        stage,
        includeCompleted,
        page,
        pageSize: pageSize(250, 50),
        detail,
      },
      annotations: READ,
      handler: (args) => {
        if (!args.projectId && !args.workflowId) throw new ValidationError("Provide projectId or workflowId");
        return client.getStageTasks(args);
      },
    },

    // ----- task writes -----------------------------------------------------
    {
      name: "teamwork_create_task",
      title: "Create task",
      description:
        "Create a task in a project (in its first task list unless taskListId is given). Optionally assign it, set priority/dates/estimate, and place it in a board lane by stage name.",
      inputSchema: {
        projectId: id("projectId"),
        title: z.string().min(1),
        description: z.string().optional(),
        taskListId: id("taskListId").optional(),
        assignToMe: z.boolean().optional().describe("Assign the task to the token owner"),
        assigneeUserIds: z.array(id("userId")).optional(),
        priority: priority.optional(),
        dueDate: date("Due date").optional(),
        startDate: date("Start date").optional(),
        estimatedMinutes: z.number().int().min(0).optional(),
        stage: stage.optional(),
        workflowId: id("workflowId").optional(),
      },
      annotations: WRITE,
      write: true,
      handler: async ({ assignToMe, ...args }) => {
        await guard({ projectId: args.projectId, taskListId: args.taskListId });
        if (assignToMe) args.assigneeUserIds = [...(args.assigneeUserIds || []), (await client.getMe()).id];
        return client.createTask(args);
      },
    },
    {
      name: "teamwork_update_task",
      title: "Edit task",
      description:
        "Edit a task; only the fields you pass change. assigneeUserIds replaces the assignees ([] unassigns everyone). dueDate/startDate null clears them. completed true/false completes or reopens.",
      inputSchema: {
        taskId: id("taskId"),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        priority: priority.optional(),
        dueDate: clearableDate("Due date").optional(),
        startDate: clearableDate("Start date").optional(),
        estimatedMinutes: z.number().int().min(0).optional(),
        progress: z.number().int().min(0).max(100).optional(),
        assigneeUserIds: z.array(id("userId")).optional(),
        assigneeUserId: id("userId").optional().describe("Deprecated: use assigneeUserIds"),
        taskListId: id("taskListId").optional().describe("Move the task to another task list"),
        completed: z.boolean().optional(),
      },
      annotations: WRITE,
      write: true,
      handler: async ({ assigneeUserId, ...args }) => {
        await guard({ taskId: args.taskId, taskListId: args.taskListId });
        if (assigneeUserId !== undefined && args.assigneeUserIds === undefined) args.assigneeUserIds = [assigneeUserId];
        return client.updateTask(args);
      },
    },
    {
      name: "teamwork_complete_task",
      title: "Complete or reopen task",
      description: "Mark a task complete (default) or reopen it with completed=false.",
      inputSchema: { taskId: id("taskId"), completed: z.boolean().optional() },
      annotations: WRITE,
      write: true,
      handler: async (args) => {
        await guard({ taskId: args.taskId });
        return client.completeTask(args);
      },
    },
    {
      name: "teamwork_delete_task",
      title: "Delete task",
      description: "Delete a task (it goes to Teamwork's trash).",
      inputSchema: { taskId: id("taskId") },
      annotations: DESTRUCTIVE,
      write: true,
      handler: async (args) => {
        await guard({ taskId: args.taskId });
        return client.deleteTask(args);
      },
    },
    {
      name: "teamwork_move_task_stage",
      title: "Move task to lane",
      description:
        "Move a task to a board lane by stage name/alias/id. The workflow is inferred from the task itself; the move is verified by re-reading the task.",
      inputSchema: {
        taskId: id("taskId"),
        stage: stage.optional(),
        stageId: id("stageId").optional().describe("Alternative to stage"),
        workflowId: id("workflowId").optional().describe("Only needed if the task is on several workflows"),
      },
      annotations: WRITE,
      write: true,
      handler: async ({ taskId, stage: s, stageId, workflowId }) => {
        if (s === undefined && stageId === undefined) throw new ValidationError("Provide stage or stageId");
        await guard({ taskId });
        return client.moveTaskToStage({ taskId, stage: s ?? String(stageId), workflowId });
      },
    },
    {
      name: "teamwork_move_task",
      title: "Move task (deprecated)",
      description: "Deprecated alias of teamwork_move_task_stage. boardColumnId/boardLaneId are treated as stage ids (Teamwork replaced boards with workflows).",
      inputSchema: {
        taskId: id("taskId"),
        stage: stage.optional(),
        stageId: id("stageId").optional(),
        workflowId: id("workflowId").optional(),
        boardColumnId: id("boardColumnId").optional(),
        boardLaneId: id("boardLaneId").optional(),
      },
      annotations: WRITE,
      write: true,
      handler: async ({ taskId, stage: s, stageId, boardColumnId, boardLaneId, workflowId }) => {
        const target = s ?? stageId ?? boardLaneId ?? boardColumnId;
        if (target === undefined) throw new ValidationError("Provide stage or stageId");
        await guard({ taskId });
        return client.moveTaskToStage({ taskId, stage: String(target), workflowId });
      },
    },

    // ----- comments --------------------------------------------------------
    {
      name: "teamwork_get_task_comments",
      title: "Read comments",
      description: "List comments on a task, with author and attachments.",
      inputSchema: { taskId: id("taskId"), page, pageSize: pageSize(250, 50), detail },
      annotations: READ,
      handler: (args) => client.getTaskComments(args),
    },
    {
      name: "teamwork_add_task_comment",
      title: "Post comment",
      description: "Post a comment on a task, optionally with file attachments (filePaths). Nobody is notified by email.",
      inputSchema: { taskId: id("taskId"), body: z.string().min(1), filePaths: filePaths.optional() },
      annotations: WRITE,
      write: true,
      handler: async (args) => {
        await guard({ taskId: args.taskId });
        return client.addTaskComment(args);
      },
    },
    {
      name: "teamwork_update_task_comment",
      title: "Edit comment",
      description: "Replace the body of an existing comment (attachments are kept).",
      inputSchema: {
        commentId: id("commentId"),
        body: z.string().min(1),
        taskId: id("taskId").optional().describe("Ignored; accepted for backwards compatibility"),
      },
      annotations: WRITE,
      write: true,
      handler: async ({ commentId, body }) => {
        await guard({ commentId });
        return client.updateComment({ commentId, body });
      },
    },
    {
      name: "teamwork_delete_task_comment",
      title: "Remove comment",
      description: "Delete a comment. Its attached files stay in the project's Files (remove them with teamwork_delete_file).",
      inputSchema: {
        commentId: id("commentId"),
        taskId: id("taskId").optional().describe("Ignored; accepted for backwards compatibility"),
      },
      annotations: DESTRUCTIVE,
      write: true,
      handler: async ({ commentId }) => {
        await guard({ commentId });
        return client.deleteComment({ commentId });
      },
    },
    {
      name: "teamwork_attach_files_to_comment",
      title: "Attach files to comment",
      description: "Upload local files and attach them to an existing comment. Existing attachments and the comment text are kept.",
      inputSchema: { commentId: id("commentId"), filePaths },
      annotations: WRITE,
      write: true,
      handler: async (args) => {
        await guard({ commentId: args.commentId });
        return client.attachFilesToComment(args);
      },
    },

    // ----- files -----------------------------------------------------------
    {
      name: "teamwork_upload_file_to_task",
      title: "Attach files to task",
      description: "Upload one or more local files and attach them to a task.",
      inputSchema: {
        taskId: id("taskId"),
        filePath: z.string().min(1).optional().describe("Absolute path of one local file"),
        filePaths: filePaths.optional(),
        categoryId: z.number().int().min(0).optional().describe("File category id (default 0 = none)"),
      },
      annotations: WRITE,
      write: true,
      handler: async ({ taskId, filePath, filePaths: paths, categoryId }) => {
        const all = [...(paths || []), ...(filePath ? [filePath] : [])];
        if (!all.length) throw new ValidationError("Provide filePath or filePaths");
        await guard({ taskId });
        return client.uploadFilesToTask({ taskId, filePaths: all, categoryId });
      },
    },
    {
      name: "teamwork_delete_file",
      title: "Delete file",
      description: "Delete a project file (e.g. a task or comment attachment) by file id.",
      inputSchema: { fileId: id("fileId") },
      annotations: DESTRUCTIVE,
      write: true,
      handler: async (args) => {
        await guard({ fileId: args.fileId });
        return client.deleteFile(args);
      },
    },

    // ----- time ------------------------------------------------------------
    {
      name: "teamwork_get_task_time_entries",
      title: "List task time entries",
      description: "List time entries logged against a task (all users), with total minutes.",
      inputSchema: { taskId: id("taskId"), page, pageSize: pageSize(250, 100) },
      annotations: READ,
      handler: (args) => client.getTaskTimeEntries(args),
    },
    {
      name: "teamwork_add_task_time_entry",
      title: "Add time entry to task",
      description: "Log time against a task. Logged for the token owner unless userId is given (requires permission).",
      inputSchema: {
        taskId: id("taskId"),
        date: date("Date worked"),
        time,
        hours: z.number().int().min(0).optional(),
        minutes: z.number().int().min(0).optional(),
        description: z.string().optional(),
        isBillable: z.boolean().optional(),
        isbillable: z.boolean().optional().describe("Deprecated spelling of isBillable"),
        userId: id("userId").optional().describe("Log for another user; defaults to you"),
        personId: id("personId").optional().describe("Deprecated: use userId"),
      },
      annotations: WRITE,
      write: true,
      handler: async ({ isbillable, personId, ...args }) => {
        await guard({ taskId: args.taskId });
        return client.addTimeEntry({ ...args, isBillable: args.isBillable ?? isbillable, userId: args.userId ?? personId });
      },
    },
    {
      name: "teamwork_update_time_entry",
      title: "Edit time entry",
      description: "Edit a time entry; only the fields you pass change.",
      inputSchema: {
        timeEntryId: id("timeEntryId"),
        date: date("Date worked").optional(),
        time: time.optional(),
        hours: z.number().int().min(0).optional(),
        minutes: z.number().int().min(0).optional(),
        description: z.string().optional(),
        isBillable: z.boolean().optional(),
      },
      annotations: WRITE,
      write: true,
      handler: async (args) => {
        await guard({ timeEntryId: args.timeEntryId });
        return client.updateTimeEntry(args);
      },
    },
    {
      name: "teamwork_delete_time_entry",
      title: "Remove time entry",
      description: "Delete a time entry by id.",
      inputSchema: {
        timeEntryId: id("timeEntryId"),
        taskId: id("taskId").optional().describe("Ignored; accepted for backwards compatibility"),
      },
      annotations: DESTRUCTIVE,
      write: true,
      handler: async ({ timeEntryId }) => {
        await guard({ timeEntryId });
        return client.deleteTimeEntry({ timeEntryId });
      },
    },
    {
      name: "teamwork_get_my_time_entries",
      title: "Read my time log",
      description:
        "The token owner's time log across all projects and tasks, newest first, optionally limited to a date range and/or one project.",
      inputSchema: {
        startDate: date("Range start (inclusive)").optional(),
        endDate: date("Range end (inclusive)").optional(),
        projectId: id("projectId").optional(),
        page,
        pageSize: pageSize(250, 100),
      },
      annotations: READ,
      handler: (args) => client.getMyTimeEntries(args),
    },
    {
      name: "teamwork_log_my_time",
      title: "Add to my time log",
      description:
        "Add a time entry for the token owner: against a task (taskId), or against a project with no task (projectId only; fails if the project requires a task). Teamwork does not support time entries without a project.",
      inputSchema: {
        taskId: id("taskId").optional(),
        projectId: id("projectId").optional(),
        date: date("Date worked"),
        time,
        hours: z.number().int().min(0).optional(),
        minutes: z.number().int().min(0).optional(),
        description: z.string().optional(),
        isBillable: z.boolean().optional(),
      },
      annotations: WRITE,
      write: true,
      handler: async (args) => {
        if (!args.taskId && !args.projectId) throw new ValidationError("Provide taskId, or projectId for project-level time");
        await guard(args.taskId ? { taskId: args.taskId } : { projectId: args.projectId });
        return client.addTimeEntry({ ...args, projectId: args.taskId ? undefined : args.projectId });
      },
    },

    // ----- notifications ---------------------------------------------------
    {
      name: "teamwork_get_notifications",
      title: "Notifications",
      description: "The token owner's notifications. Paged by cursor: pass nextCursor from a previous call as cursor.",
      inputSchema: {
        limit: z.number().int().positive().max(100).optional().describe("Max notifications (default 20)"),
        cursor: z.string().optional(),
        onlyUnread: z.boolean().optional().describe("Default true"),
      },
      annotations: READ,
      handler: (args) => client.getNotifications(args),
    },
  ];

  return tools.map((tool) => ({ write: false, ...tool }));
}
