# TaskQueue helper (`src/TaskQueue.js`)

Client-side sorting and grouping for task lists returned by the client or the MCP list
tools. It accepts both the compact summaries (default) and raw v3 task objects
(`detail: "full"`). It makes no API calls.

```javascript
import { TaskQueue } from "./src/TaskQueue.js";

const { tasks } = await client.getMyTasks();            // or getProjectTasks / getStageTasks

TaskQueue.sortByPriority(tasks);         // high > medium > low > none, then nearest due date
TaskQueue.groupByStage(tasks);           // { "In Progress": [...], "Done": [...], backlog: [...] }
TaskQueue.filterByAssignee(tasks, 123);  // by user id
TaskQueue.filterByStatus(tasks, "new");
TaskQueue.filterByDueDate(tasks, 7);     // due within the next 7 days
TaskQueue.filterWithoutDueDate(tasks);

const q = TaskQueue.buildPriorityQueue(tasks);
// q.urgent    high priority or overdue
// q.dueSoon   due within 7 days
// q.undue     due later
// q.noDueDate no due date

console.log(TaskQueue.summarize(tasks, 10));
// Total: 42 tasks (showing first 10)
//   1. [H] [123] Fix login (due: 2026-10-01)
```

`groupByStage` keys by stage name when the summary carries it, otherwise by stage id.
Tasks that are on the board but not in any stage are grouped as `backlog`.

For server-side filtering, prefer the tools: `teamwork_get_my_tasks`,
`teamwork_get_project_tasks` (`searchTerm`, `assigneeUserId`) and `teamwork_get_stage_tasks`.
