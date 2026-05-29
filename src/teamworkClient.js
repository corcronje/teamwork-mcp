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

  async request(method, path, { query, body } = {}) {
    const url = `${this.config.apiBase}${path}${toQueryString(query)}`;

    const response = await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      throw new Error(`Teamwork API ${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
    }

    return data;
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
    const headers = this.getLegacyHeaders({ contentType, accept });

    const response = await fetch(url, {
      method,
      headers,
      body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      throw new Error(`Teamwork legacy API ${response.status} ${response.statusText}: ${JSON.stringify(data)}`);
    }

    return data;
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
    const assignedToUserIds = assigneeUserId ? [Number(assigneeUserId)] : undefined;
    const normalizedNotifyUserIds = Array.isArray(notifyUserIds)
      ? notifyUserIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      : undefined;

    const attempts = [];

    const v3Task = compactObject({
      content: title,
      description,
      dueDate,
      tasklistId: taskListId,
      projectId,
      priority,
      assignedToUserIds,
      notifyUserIds: normalizedNotifyUserIds,
    });

    try {
      return await this.request("POST", "/tasks", {
        body: { task: v3Task },
      });
    } catch (error) {
      attempts.push(`POST /tasks failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      return await this.request("POST", "/tasks.json", {
        body: { task: v3Task },
      });
    } catch (error) {
      attempts.push(`POST /tasks.json failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const legacyTodoItem = compactObject({
      content: title,
      description,
      dueDate,
      priority,
      "tasklist-id": taskListId,
      "project-id": projectId,
      "responsible-party-ids": assignedToUserIds?.join(","),
      "notify-user-ids": normalizedNotifyUserIds?.join(","),
    });

    try {
      return await this.requestLegacy("POST", "/tasks.json", {
        body: {
          "todo-item": legacyTodoItem,
        },
      });
    } catch (error) {
      attempts.push(`POST /projects/api/v1/tasks.json failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    let resolvedTaskListId = taskListId;
    if (!resolvedTaskListId && projectId) {
      try {
        resolvedTaskListId = await this.getDefaultTaskListIdForProject({ projectId });
      } catch (error) {
        attempts.push(
          `Could not infer default task list for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (resolvedTaskListId) {
      try {
        return await this.requestLegacy("POST", `/tasklists/${resolvedTaskListId}/tasks.json`, {
          body: {
            "todo-item": compactObject({
              content: title,
              description,
              dueDate,
              priority,
              "responsible-party-ids": assignedToUserIds?.join(","),
              "notify-user-ids": normalizedNotifyUserIds?.join(","),
            }),
          },
        });
      } catch (error) {
        attempts.push(
          `POST /projects/api/v1/tasklists/${resolvedTaskListId}/tasks.json failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    throw new Error(`Create task failed after endpoint fallbacks. ${attempts.join(" | ")}`);
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
    try {
      return await this.request("GET", `/tasks/${taskId}/comments.json`, {
        query: { page, pageSize },
      });
    } catch {
      return this.requestLegacy("GET", `/tasks/${taskId}/comments.json`, {
        query: { page, pageSize },
      });
    }
  }

  async addTaskComment({ taskId, body } = {}) {
    try {
      return await this.request("POST", `/tasks/${taskId}/comments.json`, {
        body: {
          comment: {
            body,
          },
        },
      });
    } catch {
      return this.requestLegacy("POST", `/tasks/${taskId}/comments.json`, {
        body: {
          comment: {
            body,
          },
        },
      });
    }
  }

  addTaskTimeEntry({ taskId, description = "", date, time, hours = 0, minutes = 0, isbillable = false, personId } = {}) {
    const timeEntry = {
      description,
      date,
      time,
      hours,
      minutes,
      isbillable,
    };

    if (personId !== undefined && personId !== null) {
      timeEntry["person-id"] = personId;
    }

    return this.requestLegacy("POST", `/tasks/${taskId}/time_entries.json`, {
      body: {
        "time-entry": timeEntry,
      },
    });
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
}
