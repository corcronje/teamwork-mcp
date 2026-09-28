import { logger } from "./logger.js";
import {
  parseTeamworkError,
  TimeoutError,
  ServerError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from "./errors.js";
import { resolveStage } from "./stages.js";

/*
 * Teamwork REST client.
 *
 * Every endpoint and field name below was verified against a live Teamwork site
 * (see CHANGELOG 3.0.0 for the evidence). Teamwork SILENTLY IGNORES unknown query
 * parameters and unknown body fields, so a wrong name does not error - it just
 * returns everything / changes nothing. Notable traps:
 *
 *   GET /tasks.json      assignee filter  = responsiblePartyIds   (assignedToMe, assignedToUserIds,
 *                                                                  assigneeUserIds are ignored)
 *                        completed tasks  = includeCompletedTasks (includeCompleted is ignored)
 *                        workflowStageIds is ignored -> use /workflows/{wf}/stages/{stage}/tasks.json
 *   GET /time.json       user filter      = assignedToUserIds     (userId, userIds are ignored)
 *   PATCH /tasks/{id}    write fields     = name, priority ("low"|"medium"|"high"|null), dueAt,
 *                                           startAt, estimatedMinutes, assignees.userIds
 *                                           (content, dueDate, startDate, estimateMinutes are ignored)
 *   POST /time.json      405 - every time entry must belong to a project (and optionally a task)
 *   notifications        cursor paging (limit, cursor); page/pageSize are ignored
 *
 * API bases:
 *   v3 = {baseUrl}/projects/api/v3  - primary
 *   v1 = {baseUrl}/projects/api/v1  - only where v3 has no working equivalent:
 *          POST   /tasks/{id}/comments.json         create comment (+ attachments)
 *          PUT    /comments/{id}.json               edit comment (+ add attachments)
 *          DELETE /comments/{id}.json               delete comment
 *          PUT    /tasks/{id}/complete.json | uncomplete.json
 *          GET    /pendingfiles/presignedurl.json   upload step 1 (does NOT exist at the site root: 400)
 *          POST   /tasks/{id}/files.json            attach uploaded files to a task
 *          DELETE /files/{id}.json                  delete a file
 *   The nested forms /tasks/{taskId}/comments/{id}.json and /tasks/{taskId}/time_entries/{id}.json
 *   used by earlier versions of this client do not exist (400).
 *
 * No project, workflow, stage or user IDs are hardcoded anywhere in this file.
 */

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "PATCH", "OPTIONS"]);
const STAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PAGE_SIZE = 250;
const MAX_PAGES = 200; // hard stop for runaway pagination (200 x 250 = 50k records)

function toQueryString(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.append(k, Array.isArray(v) ? v.map(String).join(",") : String(v));
  return `?${search.toString()}`;
}

/** Drop undefined keys only (null is meaningful: it clears a field). */
function compactObject(obj) {
  const copy = { ...obj };
  for (const key of Object.keys(copy)) if (copy[key] === undefined) delete copy[key];
  return copy;
}

function toId(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${label} must be a positive integer id, received: ${value}`);
  return n;
}

function toIdList(values, label) {
  if (values === undefined) return undefined;
  if (values === null) return [];
  return (Array.isArray(values) ? values : [values]).map((v) => toId(v, label));
}

/** YYYY-MM-DD | YYYYMMDD | Date -> YYYY-MM-DD. null/"" -> null (clear). undefined -> undefined. */
export function normalizeDate(value, label = "date") {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const m = String(value).trim().match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!m) throw new ValidationError(`${label} must be YYYY-MM-DD or YYYYMMDD, received: ${value}`);
  const [, y, mo, d] = m;
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() + 1 !== Number(mo) || date.getUTCDate() !== Number(d)) {
    throw new ValidationError(`${label} is not a real calendar date: ${value}`);
  }
  return `${y}-${mo}-${d}`;
}

/** HH:MM | HH:MM:SS (24h) -> HH:MM:SS, the only form v3 time logging accepts. */
export function normalizeTime(value, label = "time") {
  if (value === undefined || value === null || value === "") return undefined;
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] ?? 0) > 59) {
    throw new ValidationError(`${label} must be HH:MM or HH:MM:SS (24-hour), received: ${value}`);
  }
  return `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
}

/** "low" | "medium" | "high" -> same; "none" | null | "" -> null (clear). */
export function normalizePriority(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "" || String(value).toLowerCase() === "none") return null;
  const p = String(value).toLowerCase();
  if (!["low", "medium", "high"].includes(p)) {
    throw new ValidationError(`priority must be one of none, low, medium, high; received: ${value}`);
  }
  return p;
}

function userName(user) {
  if (!user) return undefined;
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || undefined;
}

function projectIdOfTask(task) {
  return task?.tasklist?.meta?.projectId ?? task?.projectId;
}

export class TeamworkClient {
  /**
   * @param {object} config output of loadConfig()
   * @param {{fetchImpl?: Function}} [options] fetch is injectable for tests
   */
  constructor(config, { fetchImpl } = {}) {
    this.config = config;
    this.requestTimeout = config.requestTimeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 3;
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this._mePromise = null;
    this._stageCache = new Map(); // workflowId -> { at, stages }
  }

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------

  getHeaders({ contentType = "application/json" } = {}) {
    const headers = { Accept: "application/json" };
    if (contentType) headers["Content-Type"] = contentType;
    headers.Authorization =
      this.config.authMode === "basic_token_x"
        ? `Basic ${Buffer.from(`${this.config.token}:x`).toString("base64")}`
        : `Bearer ${this.config.token}`;
    return headers;
  }

  getLegacyApiBase() {
    return `${this.config.baseUrl}/projects/api/v1`;
  }

  /**
   * Retry policy. 429 means "not processed", so any verb may retry. For 5xx,
   * 408 and timeouts only idempotent verbs retry: the server may already have
   * applied a POST, and retrying it would duplicate comments / time entries.
   */
  _isRetryable(error, method) {
    if (error?.status === 429) return true;
    if (!IDEMPOTENT_METHODS.has(method)) return false;
    if (error instanceof TimeoutError) return true;
    const status = error?.status;
    return status === 408 || (status >= 500 && status < 600);
  }

  async _retryWithBackoff(fn, method, attempt = 0) {
    try {
      return await fn();
    } catch (error) {
      if (!this._isRetryable(error, method) || attempt >= this.maxRetries) throw error;
      const baseDelay =
        error?.status === 429 && error.retryAfterMs ? Math.min(error.retryAfterMs, 60000) : 2 ** attempt * 1000;
      const delayMs = baseDelay + Math.random() * baseDelay * 0.1;
      logger.warn(`Request failed (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delayMs.toFixed(0)}ms`, {
        attempt,
        method,
        error: error.message,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return this._retryWithBackoff(fn, method, attempt + 1);
    }
  }

  async _send(method, url, { body } = {}) {
    const makeRequest = async () => {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), this.requestTimeout);
      try {
        const response = await this.fetch(url, {
          method,
          headers: this.getHeaders({ contentType: body === undefined ? null : "application/json" }),
          body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await response.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { raw: text };
        }
        const duration = Date.now() - startTime;
        if (!response.ok) {
          const error = parseTeamworkError(response, data, { method });
          logger.logRequest(method, url, { status: response.status, duration, error });
          throw error;
        }
        logger.logRequest(method, url, { status: response.status, duration });
        return data;
      } catch (error) {
        if (error?.name === "AbortError") {
          const timeoutError = new TimeoutError(`Request timeout after ${this.requestTimeout}ms: ${method} ${url}`, {
            context: { method, url, timeout: this.requestTimeout },
          });
          logger.logRequest(method, url, { duration: this.requestTimeout, error: timeoutError });
          throw timeoutError;
        }
        if (error?.code !== undefined && error?.status !== undefined) throw error; // already an MCPError
        const serverError = new ServerError(`Unexpected request error: ${error?.message ?? error}`, {
          context: { method, url },
        });
        logger.logRequest(method, url, { error: serverError });
        throw serverError;
      } finally {
        clearTimeout(timeoutHandle);
      }
    };
    return this._retryWithBackoff(makeRequest, method);
  }

  /** v3 request (path relative to {baseUrl}/projects/api/v3). */
  request(method, path, { query, body } = {}) {
    return this._send(method, `${this.config.apiBase}${path}${toQueryString(query)}`, { body });
  }

  /** v1 request (path relative to {baseUrl}/projects/api/v1). */
  requestLegacy(method, path, { query, body } = {}) {
    return this._send(method, `${this.getLegacyApiBase()}${path}${toQueryString(query)}`, { body });
  }

  /** Fetch every page of a v3 list endpoint. */
  async _paginate(path, { query = {}, key, pageSize = MAX_PAGE_SIZE } = {}) {
    const items = [];
    const included = {};
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.request("GET", path, { query: { ...query, page, pageSize } });
      items.push(...(res?.[key] || []));
      for (const [k, v] of Object.entries(res?.included || {})) {
        if (v && typeof v === "object") included[k] = { ...(included[k] || {}), ...v };
      }
      if (!res?.meta?.page?.hasMore) return { items, included, truncated: false };
    }
    logger.warn("Pagination stopped at MAX_PAGES", { path, maxPages: MAX_PAGES });
    return { items, included, truncated: true };
  }

  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /** The user the configured API token belongs to (GET /me.json). Cached per process. */
  async getMe() {
    if (!this._mePromise) {
      this._mePromise = this.request("GET", "/me.json")
        .then((res) => {
          const p = res?.person;
          if (!p?.id) throw new ServerError("GET /me.json returned no person id");
          return {
            id: p.id,
            name: userName(p),
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            companyId: p.companyId,
            isAdmin: p.isAdmin,
            isClientUser: p.isClientUser,
          };
        })
        .catch((error) => {
          this._mePromise = null; // never cache a failure
          throw error;
        });
    }
    return this._mePromise;
  }

  // ---------------------------------------------------------------------------
  // Compact shapes returned by list tools (full payloads are ~3 KB per task)
  // ---------------------------------------------------------------------------

  taskUrl(taskId) {
    return `${this.config.baseUrl}/app/tasks/${taskId}`;
  }

  async _stageNameMap(workflowIds) {
    const map = new Map();
    for (const wf of new Set(workflowIds.filter(Boolean))) {
      try {
        for (const s of await this.getWorkflowStagesCached(wf)) map.set(`${wf}:${s.id}`, s.name);
      } catch (error) {
        logger.debug("Could not load stages for workflow", { workflowId: wf, error: error.message });
      }
    }
    return map;
  }

  async summarizeTasks(tasks, included = {}) {
    const users = included?.users || {};
    const projects = included?.projects || {};
    const stageNames = await this._stageNameMap(tasks.flatMap((t) => (t.workflowStages || []).map((w) => w.workflowId)));
    return tasks.map((t) => {
      const projectId = projectIdOfTask(t);
      return {
        id: t.id,
        name: t.name,
        status: t.status,
        priority: t.priority ?? null,
        progress: t.progress,
        startDate: t.startDate ?? null,
        dueDate: t.dueDate ?? null,
        estimateMinutes: t.estimateMinutes,
        projectId,
        projectName: projects[projectId]?.name,
        tasklistId: t.tasklistId ?? t.tasklist?.id,
        tasklistName: t.tasklist?.meta?.name,
        parentTaskId: t.parentTaskId || undefined,
        assignees: (t.assigneeUserIds || []).map((id) => ({ id, name: userName(users[id]) })),
        workflowStages: (t.workflowStages || []).map((w) => ({
          workflowId: w.workflowId,
          stageId: w.stageId,
          stageName: w.stageId ? stageNames.get(`${w.workflowId}:${w.stageId}`) : "(backlog - not in a stage)",
        })),
        updatedAt: t.updatedAt,
        url: this.taskUrl(t.id),
      };
    });
  }

  summarizeComment(c, included = {}) {
    const users = included?.users || {};
    const files = included?.files || {};
    return {
      id: c.id,
      body: c.body,
      contentType: c.contentType,
      taskId: c.objectType === "task" ? c.objectId : undefined,
      objectType: c.objectType,
      objectId: c.objectId,
      projectId: c.projectId,
      postedBy: { id: c.postedByUserId, name: userName(users[c.postedByUserId]) },
      postedAt: c.postedDateTime,
      lastEditedAt: c.dateLastEdited,
      files: (c.fileIds || []).map((id) =>
        compactObject({ id, name: files[id]?.displayName ?? files[id]?.originalName, size: files[id]?.size })
      ),
    };
  }

  summarizeTimelog(t, included = {}) {
    const users = included?.users || {};
    const tasks = included?.tasks || {};
    const projects = included?.projects || {};
    return {
      id: t.id,
      timeLogged: t.timeLogged,
      minutes: t.minutes,
      hours: Math.round(((t.minutes || 0) / 60) * 100) / 100,
      description: t.description,
      isBillable: t.isBillable,
      userId: t.userId,
      userName: userName(users[t.userId]),
      taskId: t.taskId || null,
      taskName: tasks[t.taskId]?.name,
      projectId: t.projectId,
      projectName: projects[t.projectId]?.name,
      createdAt: t.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  /**
   * Projects visible to the token's user (for non-admins: projects they belong to).
   * status: "active" (default) | "archived" | "all"
   */
  async listProjects({ status = "active", searchTerm } = {}) {
    const query = { searchTerm, include: "companies" };
    if (status === "archived") query.projectStatuses = "archived";
    else if (status === "all") query.includeArchivedProjects = true;
    const { items, included, truncated } = await this._paginate("/projects.json", { key: "projects", query });
    const companies = included.companies || {};
    return {
      count: items.length,
      truncated: truncated || undefined,
      projects: items.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || undefined,
        status: p.status,
        subStatus: p.subStatus,
        companyId: p.companyId ?? p.company?.id,
        companyName: companies[p.companyId ?? p.company?.id]?.name,
        workflowIds: p.workflowIds || [],
        timelogRequiresTask: p.timelogRequiresTask,
        startDate: p.startDate ?? null,
        endDate: p.endDate ?? null,
      })),
    };
  }

  async getProjectTaskLists({ projectId } = {}) {
    const { items } = await this._paginate(`/projects/${toId(projectId, "projectId")}/tasklists.json`, { key: "tasklists" });
    return {
      projectId: Number(projectId),
      tasklists: items.map((l) => ({ id: l.id, name: l.name, status: l.status, projectId: l.projectId ?? l.project?.id })),
    };
  }

  async getDefaultTaskListIdForProject({ projectId } = {}) {
    const { tasklists } = await this.getProjectTaskLists({ projectId });
    if (!tasklists.length) throw new NotFoundError(`No task lists found for project ${projectId}`);
    return tasklists[0].id;
  }

  // ---------------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------------

  /**
   * Tasks directly assigned (as a user) to the token's user, across all projects
   * or within one. Server-side filter `responsiblePartyIds=<me>` keeps the result
   * small; every task's own `assigneeUserIds` is then re-checked client-side, so
   * the result stays correct even if Teamwork ever ignores the parameter (the
   * pagination below then simply walks every task). Team/company-only
   * assignments are not included.
   */
  async getMyTasks({ projectId, includeCompleted = false, page = 1, pageSize = 100, detail = "summary" } = {}) {
    const me = await this.getMe();
    const path = projectId ? `/projects/${toId(projectId, "projectId")}/tasks.json` : "/tasks.json";
    const { items, included, truncated } = await this._paginate(path, {
      key: "tasks",
      query: {
        responsiblePartyIds: me.id,
        includeCompletedTasks: includeCompleted ? true : undefined,
        include: "projects,users",
      },
    });
    const mine = items.filter((t) => (t.assigneeUserIds || []).map(Number).includes(Number(me.id)));
    if (mine.length !== items.length) {
      logger.warn("responsiblePartyIds returned tasks not assigned to the user; filtered client-side", {
        returned: items.length,
        kept: mine.length,
      });
    }
    const start = (page - 1) * pageSize;
    const slice = mine.slice(start, start + pageSize);
    return {
      user: { id: me.id, name: me.name },
      meta: { total: mine.length, page, pageSize, hasMore: start + pageSize < mine.length, truncated: truncated || undefined },
      tasks: detail === "full" ? slice : await this.summarizeTasks(slice, included),
    };
  }

  async getProjectTasks({
    projectId,
    page = 1,
    pageSize = 50,
    includeCompleted = false,
    searchTerm,
    assigneeUserId,
    detail = "summary",
  } = {}) {
    const assignee = assigneeUserId !== undefined ? toId(assigneeUserId, "assigneeUserId") : undefined;
    const res = await this.request("GET", `/projects/${toId(projectId, "projectId")}/tasks.json`, {
      query: {
        page,
        pageSize,
        includeCompletedTasks: includeCompleted ? true : undefined,
        searchTerm,
        responsiblePartyIds: assignee,
        include: "projects,users",
      },
    });
    let tasks = res?.tasks || [];
    if (assignee !== undefined) tasks = tasks.filter((t) => (t.assigneeUserIds || []).map(Number).includes(assignee));
    return {
      projectId: Number(projectId),
      meta: res?.meta?.page,
      tasks: detail === "full" ? tasks : await this.summarizeTasks(tasks, res?.included),
    };
  }

  getTask({ taskId } = {}) {
    return this.request("GET", `/tasks/${toId(taskId, "taskId")}.json`, { query: { include: "projects,users" } });
  }

  async getTaskProjectId(taskId) {
    const res = await this.request("GET", `/tasks/${toId(taskId, "taskId")}.json`);
    const projectId = projectIdOfTask(res?.task);
    if (projectId) return projectId;
    const tasklistId = res?.task?.tasklistId ?? res?.task?.tasklist?.id;
    return tasklistId ? this.getTasklistProjectId(tasklistId) : undefined;
  }

  async getTasklistProjectId(tasklistId) {
    const res = await this.request("GET", `/tasklists/${toId(tasklistId, "taskListId")}.json`);
    return res?.tasklist?.projectId ?? res?.tasklist?.project?.id;
  }

  /** Map friendly args onto the v3 task WRITE field names (see header). */
  _taskWriteFields({ title, description, priority, dueDate, startDate, estimatedMinutes, assigneeUserIds, progress, taskListId }) {
    const assignees = toIdList(assigneeUserIds, "assigneeUserIds");
    return compactObject({
      name: title,
      description,
      priority: normalizePriority(priority),
      dueAt: normalizeDate(dueDate, "dueDate"),
      startAt: normalizeDate(startDate, "startDate"),
      estimatedMinutes,
      assignees: assignees !== undefined ? { userIds: assignees } : undefined,
      progress,
      tasklistId: taskListId !== undefined ? toId(taskListId, "taskListId") : undefined,
    });
  }

  async createTask({ projectId, taskListId, stage, workflowId, ...fields } = {}) {
    if (!fields.title) throw new ValidationError("title is required");
    const listId = taskListId ? toId(taskListId, "taskListId") : await this.getDefaultTaskListIdForProject({ projectId });
    const task = this._taskWriteFields(fields);
    const res = await this.request("POST", `/tasklists/${listId}/tasks.json`, { body: { task } });
    const created = res?.task;
    const result = {
      taskId: created?.id,
      url: created?.id ? this.taskUrl(created.id) : undefined,
      task: created ? (await this.summarizeTasks([created]))[0] : res,
    };
    if (created?.id && stage !== undefined && stage !== null && stage !== "") {
      result.stageMove = await this.moveTaskToStage({ taskId: created.id, stage, workflowId });
    }
    return result;
  }

  async updateTask({ taskId, completed, ...fields } = {}) {
    const id = toId(taskId, "taskId");
    const task = this._taskWriteFields(fields);
    if (!Object.keys(task).length && completed === undefined) throw new ValidationError("No fields to update were provided");
    const result = { taskId: id };
    if (Object.keys(task).length) {
      await this.request("PATCH", `/tasks/${id}.json`, { body: { task } });
      result.updatedFields = Object.keys(task);
    }
    if (completed !== undefined) result.completion = await this.completeTask({ taskId: id, completed });
    const after = await this.request("GET", `/tasks/${id}.json`, { query: { include: "projects,users" } });
    result.task = (await this.summarizeTasks([after.task], after.included))[0];
    return result;
  }

  /** v3 PATCH {completed} is a silent no-op; the v1 complete/uncomplete endpoints work. */
  async completeTask({ taskId, completed = true } = {}) {
    const id = toId(taskId, "taskId");
    await this.requestLegacy("PUT", `/tasks/${id}/${completed ? "complete" : "uncomplete"}.json`);
    const after = await this.request("GET", `/tasks/${id}.json`);
    return { taskId: id, completed, status: after?.task?.status };
  }

  async deleteTask({ taskId } = {}) {
    const id = toId(taskId, "taskId");
    await this.request("DELETE", `/tasks/${id}.json`);
    return { taskId: id, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Workflows ("board") and stages ("lanes")
  // ---------------------------------------------------------------------------

  async getProjectWorkflows({ projectId } = {}) {
    const res = await this.request("GET", `/projects/${toId(projectId, "projectId")}/workflows.json`);
    return (res?.workflows || []).map((w) => ({ id: w.id, name: w.name, status: w.status, projectSpecific: w.projectSpecific }));
  }

  async getWorkflowStagesCached(workflowId) {
    const key = String(workflowId);
    const hit = this._stageCache.get(key);
    if (hit && Date.now() - hit.at < STAGE_CACHE_TTL_MS) return hit.stages;
    const res = await this.request("GET", `/workflows/${toId(workflowId, "workflowId")}/stages.json`);
    const stages = (res?.stages || [])
      .map((s) => ({ id: s.id, name: s.name, color: s.color, displayOrder: s.displayOrder }))
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    this._stageCache.set(key, { at: Date.now(), stages });
    return stages;
  }

  async getWorkflowStages({ workflowId } = {}) {
    return { workflowId: toId(workflowId, "workflowId"), stages: await this.getWorkflowStagesCached(workflowId) };
  }

  /** A project's board: its workflow(s) with their stages (lanes) in board order. */
  async getProjectBoard({ projectId } = {}) {
    const workflows = await this.getProjectWorkflows({ projectId });
    const out = [];
    for (const w of workflows) out.push({ ...w, stages: await this.getWorkflowStagesCached(w.id) });
    return { projectId: toId(projectId, "projectId"), workflows: out };
  }

  async _projectWorkflowId(projectId) {
    const workflows = await this.getProjectWorkflows({ projectId });
    if (workflows.length === 1) return workflows[0].id;
    if (!workflows.length) throw new NotFoundError(`Project ${projectId} has no workflow (board) configured`, { context: { projectId } });
    throw new ValidationError(
      `Project ${projectId} has ${workflows.length} workflows (${workflows.map((w) => `"${w.name}" (${w.id})`).join(", ")}); pass workflowId`,
      { context: { projectId, workflows } }
    );
  }

  /** Which workflow a task is on (from its own workflowStages, else its project's single workflow). */
  async _taskWorkflow(taskId, workflowId) {
    const res = await this.request("GET", `/tasks/${toId(taskId, "taskId")}.json`);
    const ws = res?.task?.workflowStages || [];
    if (workflowId) {
      const wf = toId(workflowId, "workflowId");
      return { workflowId: wf, currentStageId: ws.find((w) => Number(w.workflowId) === wf)?.stageId };
    }
    if (ws.length === 1) return { workflowId: ws[0].workflowId, currentStageId: ws[0].stageId };
    if (ws.length > 1) {
      throw new ValidationError(`Task ${taskId} is on ${ws.length} workflows; pass workflowId`, { context: { taskId, workflowStages: ws } });
    }
    const projectId = projectIdOfTask(res?.task) ?? (await this.getTaskProjectId(taskId));
    return { workflowId: await this._projectWorkflowId(projectId), currentStageId: undefined };
  }

  /** Resolve a stage name/alias/id to a concrete stage, via a task, a project, or a workflow id. */
  async resolveStage({ stage, taskId, projectId, workflowId } = {}) {
    let wf;
    if (taskId) wf = (await this._taskWorkflow(taskId, workflowId)).workflowId;
    else if (workflowId) wf = toId(workflowId, "workflowId");
    else if (projectId) wf = await this._projectWorkflowId(projectId);
    else throw new ValidationError("Provide taskId, projectId or workflowId to resolve a stage");
    const stages = await this.getWorkflowStagesCached(wf);
    const { stage: match, matchType } = resolveStage(stages, stage, { workflowId: wf });
    return { workflowId: wf, stageId: match.id, stageName: match.name, matchType };
  }

  /**
   * Move a task to a stage given by name ("In Progress", "in_progress", "qa ready"...)
   * or id. The workflow is inferred from the task. The move is verified by re-reading.
   */
  async moveTaskToStage({ taskId, stage, workflowId } = {}) {
    const id = toId(taskId, "taskId");
    const { workflowId: wf, currentStageId } = await this._taskWorkflow(id, workflowId);
    const stages = await this.getWorkflowStagesCached(wf);
    const { stage: target, matchType } = resolveStage(stages, stage, { workflowId: wf });

    await this.request("POST", `/workflows/${wf}/stages/${target.id}/tasks.json`, { body: { taskIds: [id] } });

    const after = await this.request("GET", `/tasks/${id}.json`);
    const now = (after?.task?.workflowStages || []).find((w) => String(w.workflowId) === String(wf));
    if (String(now?.stageId) !== String(target.id)) {
      throw new ServerError(`Stage move did not take effect: expected stage ${target.id}, task is in ${now?.stageId}`, {
        context: { taskId: id, workflowId: wf, expected: target.id, actual: now?.stageId },
      });
    }
    const from = stages.find((s) => String(s.id) === String(currentStageId));
    return {
      taskId: id,
      workflowId: wf,
      from: { id: currentStageId ?? 0, name: from?.name ?? "(backlog - not in a stage)" },
      to: { id: target.id, name: target.name },
      matchType,
      verified: true,
    };
  }

  /** Tasks in one stage (lane) of a board, paginated server-side. */
  async getStageTasks({ projectId, workflowId, stage, page = 1, pageSize = 50, includeCompleted = false, detail = "summary" } = {}) {
    const resolved = await this.resolveStage({ stage, projectId: workflowId ? undefined : projectId, workflowId });
    const res = await this.request("GET", `/workflows/${resolved.workflowId}/stages/${resolved.stageId}/tasks.json`, {
      query: { page, pageSize, includeCompletedTasks: includeCompleted ? true : undefined, include: "projects,users" },
    });
    let tasks = res?.tasks || [];
    // Shared workflows can span projects; keep only the requested project's tasks.
    if (projectId) tasks = tasks.filter((t) => String(projectIdOfTask(t)) === String(projectId));
    return {
      workflowId: resolved.workflowId,
      stage: { id: resolved.stageId, name: resolved.stageName, matchType: resolved.matchType },
      meta: res?.meta?.page,
      tasks: detail === "full" ? tasks : await this.summarizeTasks(tasks, res?.included),
    };
  }

  // ---------------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------------

  async _readUploadFile(filePath) {
    const { readFile, stat, realpath } = await import("node:fs/promises");
    const { basename, resolve, sep } = await import("node:path");
    const absolute = resolve(filePath);
    let info;
    try {
      info = await stat(absolute);
    } catch {
      throw new ValidationError(`File not found: ${filePath}`);
    }
    if (!info.isFile()) throw new ValidationError(`Not a regular file: ${filePath}`);
    const roots = this.config.uploadRoots || [];
    if (roots.length) {
      const real = await realpath(absolute);
      const allowed = roots.some((r) => real === r || real.startsWith(r.endsWith(sep) ? r : r + sep));
      if (!allowed) {
        throw new AuthorizationError(`Upload blocked: ${filePath} is outside TEAMWORK_UPLOAD_ROOTS`, {
          context: { uploadRoots: roots },
        });
      }
    }
    return { buffer: await readFile(absolute), fileName: basename(absolute) };
  }

  /**
   * Upload a local file to Teamwork's pending-file store (presigned S3 PUT) and
   * return its ref, which can then be attached to a task or a comment.
   * The presign endpoint only exists under /projects/api/v1 (the site root returns 400).
   */
  async uploadPendingFile(filePath) {
    const { buffer, fileName } = await this._readUploadFile(filePath);
    const presign = await this.requestLegacy("GET", "/pendingfiles/presignedurl.json", {
      query: { fileName, fileSize: buffer.length },
    });
    if (!presign?.url || !presign?.ref) throw new ServerError("Teamwork did not return a presigned upload URL");
    const upload = await this.fetch(presign.url, {
      method: "PUT",
      headers: { "X-Amz-Acl": "public-read", "Content-Length": String(buffer.length) },
      body: buffer,
    });
    if (!upload.ok) {
      throw new ServerError(`File storage upload failed (${upload.status} ${upload.statusText})`, {
        context: { fileName, status: upload.status },
      });
    }
    return { ref: presign.ref, fileName, fileSize: buffer.length };
  }

  async _uploadAll(filePaths) {
    const uploads = [];
    for (const p of filePaths || []) uploads.push(await this.uploadPendingFile(p));
    return uploads;
  }

  async uploadFilesToTask({ taskId, filePaths, categoryId = 0 } = {}) {
    const id = toId(taskId, "taskId");
    if (!filePaths?.length) throw new ValidationError("At least one file path is required");
    const uploads = await this._uploadAll(filePaths);
    const res = await this.requestLegacy("POST", `/tasks/${id}/files.json`, {
      body: {
        task: {
          pendingFileAttachments: uploads.map((u) => u.ref),
          updateFiles: true,
          removeOtherFiles: false,
          pendingFileAttachmentsCategoryIds: String(categoryId),
        },
      },
    });
    const fileIds = String(res?.assignedFileIds || "").split(",").filter(Boolean).map(Number);
    return { taskId: id, fileIds, files: uploads.map((u) => ({ fileName: u.fileName, fileSize: u.fileSize })) };
  }

  /** Backwards-compatible single-file variant. */
  uploadFileToTask({ taskId, filePath, categoryId } = {}) {
    return this.uploadFilesToTask({ taskId, filePaths: [filePath], categoryId });
  }

  /** v3 file lookup: 404 once deleted (v1 keeps returning trashed files), and carries projectId. */
  async getFile({ fileId } = {}) {
    const res = await this.request("GET", `/files/${toId(fileId, "fileId")}.json`);
    const f = res?.file;
    if (!f) throw new NotFoundError(`File ${fileId} not found`);
    return { id: f.id, name: f.displayName ?? f.originalName, size: f.size, status: f.status, projectId: f.projectId };
  }

  async deleteFile({ fileId } = {}) {
    const id = toId(fileId, "fileId");
    await this.requestLegacy("DELETE", `/files/${id}.json`);
    return { fileId: id, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------------------

  /** v1 GET /projects/api/v1/tasks/{id}/comments.json is a 404; v3 is the working read path. */
  async getTaskComments({ taskId, page = 1, pageSize = 50, detail = "summary" } = {}) {
    const res = await this.request("GET", `/tasks/${toId(taskId, "taskId")}/comments.json`, {
      query: { page, pageSize, include: "users,files" },
    });
    const comments = res?.comments || [];
    return {
      taskId: Number(taskId),
      meta: res?.meta?.page,
      comments: detail === "full" ? comments : comments.map((c) => this.summarizeComment(c, res?.included)),
    };
  }

  async getComment({ commentId } = {}) {
    const res = await this.request("GET", `/comments/${toId(commentId, "commentId")}.json`, { query: { include: "users,files" } });
    const comment = res?.comments ?? res?.comment; // v3 returns the single object under "comments"
    if (!comment) throw new NotFoundError(`Comment ${commentId} not found`);
    return this.summarizeComment(comment, res?.included);
  }

  async addTaskComment({ taskId, body, filePaths = [] } = {}) {
    const id = toId(taskId, "taskId");
    if (!body) throw new ValidationError("body is required");
    const uploads = await this._uploadAll(filePaths);
    const res = await this.requestLegacy("POST", `/tasks/${id}/comments.json`, {
      body: {
        comment: compactObject({
          body,
          pendingFileAttachments: uploads.length ? uploads.map((u) => u.ref).join(",") : undefined,
        }),
      },
    });
    const commentId = Number(res?.commentId ?? res?.id);
    return { taskId: id, commentId, comment: await this.getComment({ commentId }) };
  }

  async updateComment({ commentId, body } = {}) {
    const id = toId(commentId, "commentId");
    if (!body) throw new ValidationError("body is required");
    await this.requestLegacy("PUT", `/comments/${id}.json`, { body: { comment: { body } } });
    return this.getComment({ commentId: id });
  }

  async deleteComment({ commentId } = {}) {
    const id = toId(commentId, "commentId");
    await this.requestLegacy("DELETE", `/comments/${id}.json`);
    return { commentId: id, deleted: true };
  }

  /**
   * Attach files to an existing comment; its existing attachments are kept.
   * The v1 edit endpoint rejects a request without `body` ("Field 'body' is
   * required"), so the current body is re-sent unchanged.
   */
  async attachFilesToComment({ commentId, filePaths } = {}) {
    const id = toId(commentId, "commentId");
    if (!filePaths?.length) throw new ValidationError("At least one file path is required");
    const current = await this.getComment({ commentId: id });
    const uploads = await this._uploadAll(filePaths);
    await this.requestLegacy("PUT", `/comments/${id}.json`, {
      body: { comment: { body: current.body, pendingFileAttachments: uploads.map((u) => u.ref).join(",") } },
    });
    return this.getComment({ commentId: id });
  }

  // ---------------------------------------------------------------------------
  // Time tracking (v3)
  // ---------------------------------------------------------------------------

  async getTaskTimeEntries({ taskId, page = 1, pageSize = 100 } = {}) {
    const res = await this.request("GET", `/tasks/${toId(taskId, "taskId")}/time.json`, {
      query: { page, pageSize, include: "users,tasks,projects" },
    });
    const entries = (res?.timelogs || []).map((t) => this.summarizeTimelog(t, res?.included));
    return {
      taskId: Number(taskId),
      meta: res?.meta?.page,
      totalMinutes: entries.reduce((sum, e) => sum + (e.minutes || 0), 0),
      timeEntries: entries,
    };
  }

  /** The token user's own time log across all projects and tasks (newest first). */
  async getMyTimeEntries({ startDate, endDate, projectId, page = 1, pageSize = 100 } = {}) {
    const me = await this.getMe();
    const range = { startDate: normalizeDate(startDate, "startDate") ?? null, endDate: normalizeDate(endDate, "endDate") ?? null };
    const res = await this.request("GET", "/time.json", {
      query: {
        assignedToUserIds: me.id,
        startDate: range.startDate,
        endDate: range.endDate,
        projectIds: projectId !== undefined ? toId(projectId, "projectId") : undefined,
        orderBy: "date",
        orderMode: "desc",
        page,
        pageSize,
        include: "users,tasks,projects",
      },
    });
    const all = res?.timelogs || [];
    const mine = all.filter((t) => Number(t.userId) === Number(me.id)); // defensive re-check
    if (mine.length !== all.length) {
      logger.warn("time.json assignedToUserIds returned other users' entries; filtered client-side", {
        returned: all.length,
        kept: mine.length,
      });
    }
    const entries = mine.map((t) => this.summarizeTimelog(t, res?.included));
    return {
      user: { id: me.id, name: me.name },
      range,
      meta: res?.meta?.page,
      totalMinutesThisPage: entries.reduce((sum, e) => sum + (e.minutes || 0), 0),
      timeEntries: entries,
    };
  }

  async getTimeEntry({ timeEntryId } = {}) {
    const res = await this.request("GET", `/time/${toId(timeEntryId, "timeEntryId")}.json`);
    if (!res?.timelog) throw new NotFoundError(`Time entry ${timeEntryId} not found`);
    return res.timelog;
  }

  /**
   * Log time against a task, or against a project with no task.
   * Teamwork requires a project for every entry (POST /time.json is 405).
   * userId defaults to the token's user.
   */
  async addTimeEntry({ taskId, projectId, date, time, hours = 0, minutes = 0, description, isBillable, userId } = {}) {
    const total = Number(hours) * 60 + Number(minutes);
    if (!Number.isFinite(total) || total <= 0) throw new ValidationError("hours/minutes must add up to more than 0");
    if (!taskId && !projectId) throw new ValidationError("Provide taskId, or projectId for project-level time");
    const who = userId !== undefined ? toId(userId, "userId") : (await this.getMe()).id;
    const timelog = compactObject({
      date: normalizeDate(date, "date"),
      time: normalizeTime(time, "time"),
      hours: Math.floor(total / 60),
      minutes: total % 60,
      description,
      isBillable: Boolean(isBillable),
      userId: who,
    });
    if (!timelog.date) throw new ValidationError("date is required (YYYY-MM-DD)");
    if (!timelog.time) throw new ValidationError("time is required (HH:MM start time of the work)");
    const path = taskId ? `/tasks/${toId(taskId, "taskId")}/time.json` : `/projects/${toId(projectId, "projectId")}/time.json`;
    const res = await this.request("POST", path, { body: { timelog } });
    return this.summarizeTimelog(res?.timelog || {});
  }

  async updateTimeEntry({ timeEntryId, date, time, hours, minutes, description, isBillable } = {}) {
    const id = toId(timeEntryId, "timeEntryId");
    const timelog = compactObject({
      date: date !== undefined ? normalizeDate(date, "date") : undefined,
      time: normalizeTime(time, "time"),
      description,
      isBillable,
    });
    if (hours !== undefined || minutes !== undefined) {
      const current = hours === undefined || minutes === undefined ? await this.getTimeEntry({ timeEntryId: id }) : null;
      const total = (hours ?? Math.floor(current.minutes / 60)) * 60 + (minutes ?? current.minutes % 60);
      if (total <= 0) throw new ValidationError("hours/minutes must add up to more than 0");
      timelog.hours = Math.floor(total / 60);
      timelog.minutes = total % 60;
    }
    if (!Object.keys(timelog).length) throw new ValidationError("No fields to update were provided");
    const res = await this.request("PATCH", `/time/${id}.json`, { body: { timelog } });
    return this.summarizeTimelog(res?.timelog || {});
  }

  async deleteTimeEntry({ timeEntryId } = {}) {
    const id = toId(timeEntryId, "timeEntryId");
    await this.request("DELETE", `/time/${id}.json`);
    return { timeEntryId: id, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Notifications (v3 cursor paging)
  // ---------------------------------------------------------------------------

  async getNotifications({ limit = 20, cursor, onlyUnread = true } = {}) {
    const res = await this.request("GET", "/notifications.json", { query: { limit, cursor, onlyUnread } });
    return {
      notifications: res?.notifications || [],
      nextCursor: res?.meta?.nextCursor || null,
      totalUnread: res?.meta?.totalUnreadNotifications,
    };
  }
}
