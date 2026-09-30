# Task helper (`src/Task.js`)

An optional helper for scripts that use `TeamworkClient` directly as a library. MCP
clients do not need it; the tools take the same fields directly.

Every id below is a placeholder. Find real ones with the tools or client methods:
projects via `listProjects()`, task lists via `getProjectTaskLists()`, lanes via
`getProjectBoard()`, and your own user id via `getMe()`.

```javascript
import { Task, TaskPriority } from "./src/Task.js";
import { TeamworkClient } from "./src/teamworkClient.js";
import { loadConfig } from "./src/config.js";

const client = new TeamworkClient(loadConfig());
const me = await client.getMe();

const task = new Task(12345);                 // projectId
task.title = "Implement export";
task.description = "Details in **markdown**";
task.assigneeUserId = me.id;                  // becomes assigneeUserIds: [me.id]
task.priority = TaskPriority.HIGH;            // "high" | "medium" | "low" | "none"
task.dueDate = "2026-10-30";                  // YYYY-MM-DD or a Date
task.stageId = "In Progress";                 // a stage NAME or id; resolved on the project's board
task.validate();

const { taskId } = await client.createTask(task.toParams());
task.id = taskId;

task.addTimeEntry({ date: "2026-10-01", time: "09:30", hours: 1, minutes: 15, description: "Implementation" });
for (const entry of task.getTimeEntryParams()) {
  await client.addTimeEntry(entry);           // logged as the token owner unless userId is set
}
```

## Fields

| Property | Notes |
|---|---|
| `projectId` (constructor) | required |
| `title` | required |
| `description` | optional |
| `assigneeUserId` | optional, one user id |
| `priority` | `TaskPriority.HIGH` / `MEDIUM` (`NORMAL`) / `LOW` / `NONE`. Teamwork v3 has three levels; the old 0-4 numbers were rejected by the API. |
| `dueDate` | `YYYY-MM-DD` string or `Date` |
| `stageId` | stage name or id; `createTask` moves the new task there and verifies the move |
| `workflowId` | only if the project has several workflows |
| `taskListId` | defaults to the project's first task list |

## Time entries

`addTimeEntry({ date, time, hours, minutes, description, billable, userId })`:

- `date`: `YYYY-MM-DD` or a `Date`.
- `time`: the start time, `HH:MM` 24-hour. The client requires it (Teamwork's v3 API needs a start time).
- `hours` + `minutes` must be more than 0.
- `userId` is optional (defaults to the token owner). `personId` is accepted as an alias.

`Task.formatDate()` and `Task.formatTime()` are available as static helpers.

## Comments

`task.addComment(body)` queues comment bodies; post them after creation with
`client.addTaskComment({ taskId: task.id, body, filePaths })`.

See also [TASK_QUEUE.md](TASK_QUEUE.md) and [TIME_ENTRY_IMPLEMENTATION.md](TIME_ENTRY_IMPLEMENTATION.md).
