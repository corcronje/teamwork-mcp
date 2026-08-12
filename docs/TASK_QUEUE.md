# TaskQueue - Task Prioritization & Lane Management

The `TaskQueue` class provides helpers for organizing, prioritizing, and managing task workflows across different lanes (workflow stages).

## Overview

TaskQueue helps you:
- **Prioritize tasks** by urgency (priority level + due date)
- **Organize by lanes** (workflow stages like "Selected", "In Progress", "QA Ready")
- **Build work queues** showing what to work on next
- **Filter and group** tasks by various criteria

## Installation

```javascript
import { TaskQueue } from './src/TaskQueue.js';
```

## Core Methods

### sortByPriority(tasks)

Sort tasks by priority level and due date.

```javascript
const tasks = await client.getMyTasks();
const sorted = TaskQueue.sortByPriority(tasks);

// Highest priority first, closest due date first
sorted.forEach((task, i) => {
  console.log(`${i + 1}. [P${task.priority}] ${task.name}`);
});
```

**Priority Levels:**
- `4` = HIGHEST (critical)
- `3` = HIGH (important)
- `2` = NORMAL (standard)
- `1` = LOW (background)
- `0` = LOWEST (nice-to-have)

### groupByStage(tasks)

Group tasks by workflow stage (lane).

```javascript
const tasks = await client.getProjectTasks({projectId: '938241'});
const lanes = TaskQueue.groupByStage(tasks);

// lanes = {
//   'selected': [...],
//   'in_progress': [...],
//   'qa_ready': [...]
// }

Object.entries(lanes).forEach(([stage, tasks]) => {
  console.log(`[${stage}]: ${tasks.length} tasks`);
  tasks.forEach(task => {
    console.log(`  - ${task.name}`);
  });
});
```

### filterByAssignee(tasks, userId)

Get tasks assigned to a specific user.

```javascript
const allTasks = await client.getProjectTasks({projectId: '938241'});
const myTasks = TaskQueue.filterByAssignee(allTasks, 108693);

console.log(`You have ${myTasks.length} tasks assigned`);
```

### filterByStatus(tasks, status)

Filter tasks by status.

```javascript
const newTasks = TaskQueue.filterByStatus(tasks, 'new');
const inProgress = TaskQueue.filterByStatus(tasks, 'in-progress');
const completed = TaskQueue.filterByStatus(tasks, 'completed');
```

### filterByDueDate(tasks, daysFromNow)

Get tasks due within N days.

```javascript
// Tasks due within 7 days (default)
const dueSoon = TaskQueue.filterByDueDate(tasks);

// Tasks due within 30 days
const dueMonth = TaskQueue.filterByDueDate(tasks, 30);

// Tasks due within 1 day (urgent)
const overdue = TaskQueue.filterByDueDate(tasks, 1);
```

### filterWithoutDueDate(tasks)

Get tasks that don't have a due date set.

```javascript
const noDueDate = TaskQueue.filterWithoutDueDate(tasks);
console.log(`${noDueDate.length} tasks missing due dates`);
```

## Priority Queue - What to Work On

### buildPriorityQueue(tasks)

Organize tasks into a priority queue by urgency.

```javascript
const myTasks = await client.getMyTasks({ pageSize: 100 });
const queue = TaskQueue.buildPriorityQueue(myTasks);

// queue = {
//   urgent: [...],      // High priority OR overdue
//   dueSoon: [...],     // Due within 7 days
//   undue: [...],       // Low priority, not due soon
//   noDueDate: [...]    // No due date set
// }
```

**Work Queue Structure:**

```
🔴 URGENT         → What needs your immediate attention
  - Critical or high-priority tasks
  - Overdue tasks
  - Must be done now

🟠 DUE SOON       → What's next on your radar
  - Medium priority
  - Due within 7 days
  - Coming up soon

🟡 NOT URGENT     → What you can tackle when time permits
  - Low priority
  - Not due for a while
  - Background work

⬜ NO DUE DATE    → What needs planning
  - No deadline set
  - Should be prioritized/scheduled
  - Requires attention to deadline
```

**Complete Example:**

```javascript
const myTasks = await client.getMyTasks({ pageSize: 200 });
const queue = TaskQueue.buildPriorityQueue(myTasks);

console.log(`\n📋 My Work Queue`);
console.log(`\n🔴 URGENT (${queue.urgent.length} tasks)`);
queue.urgent.forEach((task, i) => {
  const priority = '⭐'.repeat(task.priority || 3);
  const due = task['due-date'] ? ` (due: ${task['due-date']})` : '';
  console.log(`  ${i + 1}. ${priority} ${task.name}${due}`);
});

console.log(`\n🟠 DUE SOON (${queue.dueSoon.length} tasks)`);
queue.dueSoon.slice(0, 5).forEach((task, i) => {
  console.log(`  ${i + 1}. ${task.name} (due: ${task['due-date']})`);
});

console.log(`\n🟡 NOT URGENT (${queue.undue.length} tasks)`);
console.log(`\n⬜ NO DUE DATE (${queue.noDueDate.length} tasks)`);
```

## Summarize Tasks

### summarize(tasks, limit)

Get a formatted summary of tasks.

```javascript
const summary = TaskQueue.summarize(tasks, 10);
console.log(summary);

// Output:
// Total: 23 tasks (showing first 10)
//
//   1. 🔴 [48691685] Clinical Trials Data Sync (due: 2026-08-31)
//   2. 🟡 [48591234] Update documentation (due: 2026-08-20)
//   3. ⬜ [48591235] Research API changes
//   4. ...
```

## Complete Workflow Example

```javascript
import { TaskQueue } from './src/TaskQueue.js';
import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

async function getMyWorkQueue() {
  const config = loadConfig();
  const client = new TeamworkClient(config);

  // Get all my tasks
  const myTasks = await client.getMyTasks({ pageSize: 200 });
  console.log(`Loaded ${myTasks.length} tasks\n`);

  // Build priority queue
  const queue = TaskQueue.buildPriorityQueue(myTasks);

  // Show what to work on
  console.log('=== MY WORK QUEUE ===\n');

  if (queue.urgent.length > 0) {
    console.log(`🔴 URGENT (${queue.urgent.length})`);
    queue.urgent.slice(0, 5).forEach((task, i) => {
      console.log(`  ${i + 1}. [${task.id}] ${task.name}`);
      if (task['due-date']) {
        console.log(`     Due: ${task['due-date']}`);
      }
    });
  }

  if (queue.dueSoon.length > 0) {
    console.log(`\n🟠 DUE SOON (${queue.dueSoon.length})`);
    queue.dueSoon.slice(0, 5).forEach((task, i) => {
      console.log(`  ${i + 1}. [${task.id}] ${task.name}`);
    });
  }

  console.log(`\n🟡 NOT URGENT (${queue.undue.length})`);
  console.log(`⬜ NO DUE DATE (${queue.noDueDate.length})`);

  // Group by stage (lanes)
  const lanes = TaskQueue.groupByStage(myTasks);
  console.log('\n=== BY WORKFLOW STAGE ===\n');
  Object.entries(lanes).forEach(([stage, tasks]) => {
    console.log(`[${stage}]: ${tasks.length} tasks`);
  });

  return {
    queue,
    lanes,
    totalTasks: myTasks.length
  };
}

// Run it
getMyWorkQueue();
```

## Priority Emoji Legend

- 🔴 **URGENT** - Work on this NOW
- 🟠 **DUE SOON** - Plan for this soon
- 🟡 **NOT URGENT** - Background work
- ⬜ **NO DUE DATE** - Schedule this

## Sorting Behavior

### By Priority

Within `buildPriorityQueue()`, each queue level is automatically sorted:
1. By priority level (descending)
2. By due date (ascending - closest first)
3. By ID (for stability)

```javascript
// Urgent tasks with highest priority and earliest due date first
queue.urgent[0]  // Highest priority OR most overdue
queue.urgent[1]  // Next highest priority
```

## Use Cases

### "What should I work on next?"

```javascript
const queue = TaskQueue.buildPriorityQueue(myTasks);
const nextTask = queue.urgent[0] || queue.dueSoon[0];
console.log(`Next task: ${nextTask.name}`);
```

### "What's blocked in my pipeline?"

```javascript
const lanes = TaskQueue.groupByStage(myTasks);
Object.entries(lanes).forEach(([stage, tasks]) => {
  console.log(`${stage}: ${tasks.length} tasks`);
});
```

### "Show me overdue items"

```javascript
const overdue = tasks.filter(t => {
  if (!t['due-date']) return false;
  return new Date(t['due-date']) < new Date();
});
const sorted = TaskQueue.sortByPriority(overdue);
```

### "Find tasks missing due dates"

```javascript
const noDueDate = TaskQueue.filterWithoutDueDate(tasks);
console.log(`${noDueDate.length} tasks need deadlines`);
```

## See Also

- [TASK_CLASS.md](./TASK_CLASS.md) - Task creation and management
- [TIME_ENTRY_IMPLEMENTATION.md](./TIME_ENTRY_IMPLEMENTATION.md) - Time tracking
- [README.md](../README.md) - MCP overview
