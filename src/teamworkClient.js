import { logger } from "./logger.js";
import { parseTeamworkError, TimeoutError, ServerError } from "./errors.js";
import { Task } from "./Task.js";

function toQueryString(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return "";
  const search = new URLSearchParams();
  for (const [k, v] of entries) {
    if (Array.isArray(v)) {
      v.forEach((item) => search.append(k, String(item)));
    } else {
      search.append(k, String(v));
    }
  }
  return `?${search.toString()}`;
}

function compactObject(obj) {
  const copy = { ...obj };
  Object.keys(copy).forEach((key) => {
    if (copy[key] === undefined || copy[key] === null || copy[key] === "") {
      delete copy[key];
    }
  });
  return copy;
}

function extractTaskLists(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.tasklists)) return payload.tasklists;
  if (Array.isArray(payload.taskLists)) return payload.taskLists;
  if (Array.isArray(payload["todo-lists"])) return payload["todo-lists"];
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

export class TeamworkClient {
  constructor(config) {
    this.config = config;
    this.requestTimeout = config.requestTimeout || 30000;
    this.maxRetries = config.maxRetries || 3;
  }

  getHeaders() {
    const common = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.config.authMode === "basic_token_x") {
      const encoded = Buffer.from(`${this.config.token}:x`).toString("base64");
      return {
        ...common,
        Authorization: `Basic ${encoded}`,
      };
    }

    return {
      ...common,
      Authorization: `Bearer ${this.config.token}`,
    };
  }

  /**
   * Check if an error is retryable based on status code
   */
  _isRetryable(status) {
    // Retryable: timeouts, rate limits, and 5xx errors
    return status === 408 || status === 429 || (status >= 500 && status < 600);
  }

  /**
   * Exponential backoff retry logic
   */
  async _retryWithBackoff(fn, attempt = 0) {
    try {
      return await fn();
    } catch (error) {
      // Check if retryable
      const isRetryable = error instanceof TimeoutError || (error.status && this._isRetryable(error.status));

      if (!isRetryable || attempt >= this.maxRetries) {
        throw error;
      }

      // Calculate backoff: 1s, 2s, 4s, 8s with jitter
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * baseDelay * 0.1; // 0-10% jitter
      const delayMs = baseDelay + jitter;

      logger.warn(`Request failed (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delayMs.toFixed(0)}ms`, {
        attempt,
        error: error.message,
      });

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return this._retryWithBackoff(fn, attempt + 1);
    }
  }

  /**
   * Make HTTP request with timeout, retries, and error handling
   */
  async request(method, path, { query, body } = {}) {
    const url = `${this.config.apiBase}${path}${toQueryString(query)}`;
    const startTime = Date.now();

    const makeRequest = async () => {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), this.requestTimeout);

      try {
        const response = await fetch(url, {
          method,
          headers: this.getHeaders(),
          body: body ? JSON.stringify(body) : undefined,
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
        logger.logRequest(method, url, { status: response.status, duration });

        if (!response.ok) {
          const error = parseTeamworkError(response, data);
          throw error;
        }

        return data;
      } catch (error) {
        const duration = Date.now() - startTime;

        // Handle AbortError from timeout
        if (error.name === "AbortError") {
          const timeoutError = new TimeoutError(`Request timeout after ${this.requestTimeout}ms: ${method} ${path}`, {
            context: { method, path, timeout: this.requestTimeout },
          });
          logger.logRequest(method, url, { duration, error: timeoutError });
          throw timeoutError;
        }

        // Re-throw already parsed errors
        if (error.code !== undefined) {
          logger.logRequest(method, url, { status: error.status, duration, error });
          throw error;
        }

        // Wrap unexpected errors
        const serverError = new ServerError(`Unexpected request error: ${error.message}`, {
          context: { method, path, error: error.message },
        });
        logger.logRequest(method, url, { duration, error: serverError });
        throw serverError;
      } finally {
        clearTimeout(timeoutHandle);
      }
    };

    return this._retryWithBackoff(makeRequest);
  }

  getLegacyApiBase() {
    return `${this.config.baseUrl}/projects/api/v1`;
  }

  getLegacyHeaders({ contentType = "application/json", accept = "application/json" } = {}) {
    const common = {
      Accept: accept,
    };

    if (contentType) {
      common["Content-Type"] = contentType;
    }

    if (this.config.authMode === "basic_token_x") {
      const encoded = Buffer.from(`${this.config.token}:x`).toString("base64");
      return {
        ...common,
        Authorization: `Basic ${encoded}`,
      };
    }

    return {
      ...common,
      Authorization: `Bearer ${this.config.token}`,
    };
  }

  async requestLegacy(method, path, { query, body, contentType = "application/json", accept = "application/json" } = {}) {
    const url = `${this.getLegacyApiBase()}${path}${toQueryString(query)}`;
    const startTime = Date.now();

    const makeRequest = async () => {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), this.requestTimeout);

      try {
        const headers = this.getLegacyHeaders({ contentType, accept });
        const response = await fetch(url, {
          method,
          headers,
          body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
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
        logger.logRequest(method, url, { status: response.status, duration });

        if (!response.ok) {
          const error = parseTeamworkError(response, data);
          throw error;
        }

        return data;
      } catch (error) {
        const duration = Date.now() - startTime;

        // Handle AbortError from timeout
        if (error.name === "AbortError") {
          const timeoutError = new TimeoutError(`Request timeout after ${this.requestTimeout}ms: ${method} ${path}`, {
            context: { method, path, timeout: this.requestTimeout },
          });
          logger.logRequest(method, url, { duration, error: timeoutError });
          throw timeoutError;
        }

        // Re-throw already parsed errors
        if (error.code !== undefined) {
          logger.logRequest(method, url, { status: error.status, duration, error });
          throw error;
        }

        // Wrap unexpected errors
        const serverError = new ServerError(`Unexpected request error: ${error.message}`, {
          context: { method, path, error: error.message },
        });
        logger.logRequest(method, url, { duration, error: serverError });
        throw serverError;
      } finally {
        clearTimeout(timeoutHandle);
      }
    };

    return this._retryWithBackoff(makeRequest);
  }

  getMyTasks({ page = 1, pageSize = 50, includeCompleted = false } = {}) {
    return this.request("GET", "/tasks.json", {
      query: {
        assignedToMe: true,
        page,
        pageSize,
        includeCompleted,
      },
    });
  }

  getProjectTasks({ projectId, page = 1, pageSize = 50, includeCompleted = true } = {}) {
    return this.request("GET", "/tasks.json", {
      query: {
        projectIds: projectId,
        page,
        pageSize,
        includeCompleted,
      },
    });
  }

  async createTask({ projectId, title, description, dueDate, assigneeUserId, taskListId, priority, notifyUserIds } = {}) {
    // Use v3 API exclusively: POST /projects/api/v3/tasklists/{tasklistId}/tasks.json
    // This endpoint properly handles name, description, assigneeIds, and dueDate fields
    // Resolve taskListId if not provided
    let resolvedTaskListId = taskListId;
    if (!resolvedTaskListId && projectId) {
      try {
        resolvedTaskListId = await this.getDefaultTaskListIdForProject({ projectId });
      } catch (error) {
        throw new Error(`Cannot create task: could not resolve task list for project ${projectId}: ${error.message}`);
      }
    }

    if (!resolvedTaskListId) {
      throw new Error("Cannot create task: taskListId is required or project must be specified to infer it");
    }

    // Note: assigneeUserIds, priority, and dueDate are not supported in v3 task creation on this account
    // These can be set via updateTask() after creation if needed
    const normalizedNotifyUserIds = Array.isArray(notifyUserIds)
      ? notifyUserIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      : undefined;

    const taskPayload = compactObject({
      name: title,
      description,
      notifyUserIds: normalizedNotifyUserIds,
    });

    try {
      return await this.request("POST", `/tasklists/${resolvedTaskListId}/tasks.json`, {
        body: {
          task: taskPayload,
        },
      });
    } catch (error) {
      throw new Error(`Create task failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getProjectTaskLists({ projectId } = {}) {
    try {
      return await this.request("GET", `/projects/${projectId}/tasklists.json`);
    } catch {
      return this.requestLegacy("GET", `/projects/${projectId}/tasklists.json`);
    }
  }

  async getDefaultTaskListIdForProject({ projectId } = {}) {
    const payload = await this.getProjectTaskLists({ projectId });
    const lists = extractTaskLists(payload);
    if (!lists.length) {
      throw new Error(`No task lists found for project ${projectId}`);
    }

    const first = lists[0];
    const id = first?.id ?? first?.ID ?? first?.tasklistId ?? first?.["tasklist-id"];
    if (!id) {
      throw new Error(`Could not infer task list id from project ${projectId} task lists payload`);
    }

    return id;
  }

  updateTask({ taskId, title, description, dueDate, assigneeUserId, priority, completed } = {}) {
    const task = {
      content: title,
      description,
      dueDate,
      priority,
      completed,
    };

    if (assigneeUserId) {
      task.assignedToUserIds = [assigneeUserId];
    }

    Object.keys(task).forEach((key) => task[key] === undefined && delete task[key]);

    return this.request("PUT", `/tasks/${taskId}.json`, {
      body: { task },
    });
  }

  getTask({ taskId } = {}) {
    return this.request("GET", `/tasks/${taskId}.json`);
  }

  async moveTask({ taskId, boardColumnId, boardLaneId, workflowId, stageId, position } = {}) {
    const targetStageId = stageId ?? boardLaneId ?? boardColumnId;
    const hasWorkflowInputs = workflowId !== undefined || targetStageId !== undefined;

    if (hasWorkflowInputs) {
      const taskBefore = await this.getTask({ taskId });
      const inferredWorkflowId = workflowId ?? taskBefore?.task?.workflowStages?.[0]?.workflowId;

      if (!inferredWorkflowId) {
        throw new Error(
          "Cannot move task by workflow stage: workflowId was not provided and could not be inferred from task.workflowStages"
        );
      }

      if (targetStageId === undefined || targetStageId === null) {
        throw new Error("Cannot move task by workflow stage: missing stageId (or boardColumnId/boardLaneId alias)");
      }

      await this.moveTaskToWorkflowStage({
        taskId,
        workflowId: inferredWorkflowId,
        stageId: targetStageId,
      });

      const taskAfter = await this.getTask({ taskId });
      const afterStageId = taskAfter?.task?.workflowStages?.[0]?.stageId;

      if (String(afterStageId) !== String(targetStageId)) {
        throw new Error(
          `Task move appears to be a no-op: expected stage ${targetStageId}, current stage is ${afterStageId}`
        );
      }

      return {
        success: true,
        mode: "workflow-stage",
        taskId,
        workflowId: inferredWorkflowId,
        stageId: targetStageId,
        stageAfter: afterStageId,
      };
    }

    const task = {
      boardColumnId,
      boardLaneId,
      position,
    };

    Object.keys(task).forEach((key) => task[key] === undefined && delete task[key]);

    return this.request("PUT", `/tasks/${taskId}.json`, {
      body: { task },
    });
  }

  async moveTaskToWorkflowStage({ taskId, workflowId, stageId } = {}) {
    const normalizedTaskId = Number(taskId);
    if (!Number.isInteger(normalizedTaskId)) {
      throw new Error(`Invalid taskId for workflow stage move: ${taskId}`);
    }

    return this.request("POST", `/workflows/${workflowId}/stages/${stageId}/tasks.json`, {
      body: {
        taskIds: [normalizedTaskId],
      },
    });
  }

  getWorkflowStages({ workflowId } = {}) {
    return this.request("GET", `/workflows/${workflowId}/stages.json`);
  }

  async getTaskComments({ taskId, page = 1, pageSize = 50 } = {}) {
    // Comments use v1 API directly
    return this.requestLegacy("GET", `/tasks/${taskId}/comments.json`, {
      query: { page, pageSize },
    });
  }

  async addTaskComment({ taskId, body } = {}) {
    // Comments use v1 API directly
    return this.requestLegacy("POST", `/tasks/${taskId}/comments.json`, {
      body: {
        comment: {
          body,
        },
      },
    });
  }

  async addTaskTimeEntry({ taskId, description = "", date, time, hours = 0, minutes = 0, isbillable = false, personId } = {}) {
    // Format date to YYYYMMDD format required by Teamwork v1 API
    let formattedDate = date;
    if (date) {
      if (date instanceof Date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        formattedDate = `${year}${month}${day}`;
      } else if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Convert from YYYY-MM-DD to YYYYMMDD
        formattedDate = date.replace(/-/g, '');
      }
    }

    // Build time entry data (Teamwork v1 API format)
    const timeEntryData = {
      "date": formattedDate,
      hours: Number(hours),
      minutes: Number(minutes),
      isbillable: Boolean(isbillable),
    };

    if (description) {
      timeEntryData.description = description;
    }

    if (time) {
      timeEntryData.time = time;
    }

    if (personId !== undefined && personId !== null) {
      timeEntryData["user-id"] = String(personId);
    }

    const body = {
      "time-entry": timeEntryData
    };

    // Use the direct task endpoint (works with v1 API)
    return await this.requestLegacy("POST", `/tasks/${taskId}/time_entries.json`, { body });
  }

  async uploadFileToTask({ taskId, filePath, categoryId = 0 } = {}) {
    const { readFile } = await import("node:fs/promises");
    const { basename } = await import("node:path");

    const fileBuffer = await readFile(filePath);
    const fileName = basename(filePath);

    const presign = await this.requestLegacy("GET", "/pendingfiles/presignedurl.json", {
      query: {
        fileName,
        fileSize: fileBuffer.length,
      },
      contentType: null,
    });

    const uploadResponse = await fetch(presign.url, {
      method: "PUT",
      headers: {
        "X-Amz-Acl": "public-read",
        "Content-Length": String(fileBuffer.length),
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const uploadText = await uploadResponse.text();
      throw new Error(`S3 upload failed ${uploadResponse.status} ${uploadResponse.statusText}: ${uploadText}`);
    }

    const attachResult = await this.requestLegacy("POST", `/tasks/${taskId}/files.json`, {
      body: {
        task: {
          pendingFileAttachments: [presign.ref],
          updateFiles: true,
          removeOtherFiles: false,
          pendingFileAttachmentsCategoryIds: String(categoryId),
        },
      },
    });

    return {
      ...attachResult,
      pendingFileRef: presign.ref,
      fileName,
      fileSize: fileBuffer.length,
    };
  }

  getNotifications({ page = 1, pageSize = 50, onlyUnread = true } = {}) {
    return this.request("GET", "/notifications.json", {
      query: {
        page,
        pageSize,
        onlyUnread,
      },
    });
  }

  // Delete Operations

  async deleteTask({ taskId } = {}) {
    if (!taskId) throw new Error("taskId is required");
    return this.request("DELETE", `/tasks/${taskId}.json`);
  }

  async deleteTaskComment({ taskId, commentId } = {}) {
    if (!taskId || !commentId) throw new Error("taskId and commentId are required");
    return this.requestLegacy("DELETE", `/tasks/${taskId}/comments/${commentId}.json`);
  }

  async deleteTimeEntry({ taskId, timeEntryId } = {}) {
    if (!taskId || !timeEntryId) throw new Error("taskId and timeEntryId are required");
    return this.requestLegacy("DELETE", `/tasks/${taskId}/time_entries/${timeEntryId}.json`);
  }

  // Update Operations

  async updateTaskComment({ taskId, commentId, body } = {}) {
    if (!taskId || !commentId || !body) throw new Error("taskId, commentId, and body are required");
    return this.requestLegacy("PUT", `/tasks/${taskId}/comments/${commentId}.json`, {
      body: {
        comment: { body },
      },
    });
  }

  async updateTimeEntry({ taskId, timeEntryId, hours = 0, minutes = 0, description, date, time } = {}) {
    if (!taskId || !timeEntryId) throw new Error("taskId and timeEntryId are required");

    const updateData = compactObject({
      hours: Number(hours),
      minutes: Number(minutes),
      description,
      "logged-date": date ? Task.formatDate(date) : undefined,
      time: time ? Task.formatTime(time) : undefined,
    });

    return this.requestLegacy("PUT", `/tasks/${taskId}/time_entries/${timeEntryId}.json`, {
      body: { "time-entry": updateData },
    });
  }

  // Retrieve Operations

  async getTaskTimeEntries({ taskId } = {}) {
    if (!taskId) throw new Error("taskId is required");
    return this.requestLegacy("GET", `/tasks/${taskId}/time_entries.json`);
  }

  async getCommentDetail({ taskId, commentId } = {}) {
    if (!taskId || !commentId) throw new Error("taskId and commentId are required");
    return this.requestLegacy("GET", `/tasks/${taskId}/comments/${commentId}.json`);
  }

  async completeTask({ taskId, completed = true } = {}) {
    if (!taskId) throw new Error("taskId is required");
    return this.request("PATCH", `/tasks/${taskId}`, {
      body: {
        task: { completed },
      },
    });
  }

  // Advanced Filtering

  async listAllTasks({ projectId, includeCompleted = true, page = 1, pageSize = 200 } = {}) {
    if (!projectId) throw new Error("projectId is required");
    const response = await this.getProjectTasks({ projectId, page, pageSize, includeCompleted });
    return response?.tasks || [];
  }

  async filterTasksByAssignee({ projectId, assigneeUserId, includeCompleted = false } = {}) {
    if (!projectId || !assigneeUserId) throw new Error("projectId and assigneeUserId are required");
    const response = await this.getProjectTasks({ projectId, includeCompleted });
    const tasks = response?.tasks || [];
    return tasks.filter((task) => {
      const assignees = task.assignees || [];
      return assignees.some((a) => String(a.id) === String(assigneeUserId));
    });
  }

  async filterTasksByPriority({ projectId, priority, includeCompleted = false } = {}) {
    if (!projectId || priority === undefined) throw new Error("projectId and priority are required");
    const response = await this.getProjectTasks({ projectId, includeCompleted });
    const tasks = response?.tasks || [];
    return tasks.filter((task) => task.priority === priority);
  }

  async filterTasksByStatus({ projectId, status, includeCompleted = false } = {}) {
    if (!projectId || !status) throw new Error("projectId and status are required");
    const response = await this.getProjectTasks({ projectId, includeCompleted });
    const tasks = response?.tasks || [];
    return tasks.filter((task) => task.status === status);
  }

  async filterTasksByDateRange({ projectId, startDate, endDate, includeCompleted = false } = {}) {
    if (!projectId || !startDate || !endDate) throw new Error("projectId, startDate, and endDate are required");
    const response = await this.getProjectTasks({ projectId, includeCompleted });
    const tasks = response?.tasks || [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    return tasks.filter((task) => {
      if (!task.dueDate) return false;
      const dueDate = new Date(task.dueDate);
      return dueDate >= start && dueDate <= end;
    });
  }

  async filterTasksWithoutDueDate({ projectId, includeCompleted = false } = {}) {
    if (!projectId) throw new Error("projectId is required");
    const response = await this.getProjectTasks({ projectId, includeCompleted });
    const tasks = response?.tasks || [];
    return tasks.filter((task) => !task.dueDate);
  }

  async filterCompletedTasks({ projectId } = {}) {
    if (!projectId) throw new Error("projectId is required");
    const response = await this.getProjectTasks({ projectId, includeCompleted: true });
    const tasks = response?.tasks || [];
    return tasks.filter((task) => task.completed);
  }

  async filterActiveTasks({ projectId } = {}) {
    if (!projectId) throw new Error("projectId is required");
    const response = await this.getProjectTasks({ projectId, includeCompleted: false });
    const tasks = response?.tasks || [];
    return tasks.filter((task) => !task.completed);
  }

  // Bulk Operations

  async bulkMoveTasksToStage({ taskIds, workflowId, stageId } = {}) {
    if (!taskIds || !taskIds.length || !workflowId || !stageId) {
      throw new Error("taskIds (array), workflowId, and stageId are required");
    }

    return this.request("POST", `/workflows/${workflowId}/stages/${stageId}/tasks.json`, {
      body: {
        taskIds: taskIds.map((id) => Number(id)),
      },
    });
  }

  async bulkDeleteTasks({ taskIds } = {}) {
    if (!taskIds || !taskIds.length) throw new Error("taskIds (non-empty array) is required");

    const results = [];
    for (const taskId of taskIds) {
      try {
        const result = await this.deleteTask({ taskId });
        results.push({ taskId, success: true, result });
      } catch (error) {
        results.push({ taskId, success: false, error: error.message });
      }
    }
    return results;
  }

  // Search & Advanced Queries

  async searchTasks({ projectId, query, includeCompleted = false } = {}) {
    if (!projectId || !query) throw new Error("projectId and query are required");
    const response = await this.getProjectTasks({ projectId, includeCompleted });
    const tasks = response?.tasks || [];

    const lowerQuery = query.toLowerCase();
    return tasks.filter((task) => {
      const name = (task.name || "").toLowerCase();
      const description = (task.description || "").toLowerCase();
      return name.includes(lowerQuery) || description.includes(lowerQuery);
    });
  }

  async getTasksByWorkflowStage({ projectId, stageId, includeCompleted = false } = {}) {
    if (!projectId || !stageId) throw new Error("projectId and stageId are required");
    const response = await this.getProjectTasks({ projectId, includeCompleted });
    const tasks = response?.tasks || [];

    return tasks.filter((task) => {
      const stages = task.workflowStages || [];
      return stages.some((s) => String(s.stageId) === String(stageId));
    });
  }
}
