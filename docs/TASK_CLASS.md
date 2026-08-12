# Task Class - Teamwork MCP Helper

The `Task` class provides a clean, object-oriented interface for creating and managing Teamwork tasks programmatically. It handles parameter formatting, validation, and time entry management.

## Overview

The Task class simplifies task creation by:
- Automatically handling date/time formatting to Teamwork API standards
- Validating required fields before creation
- Supporting time entry creation and management
- Providing chainable methods for fluent task building

## Quick Reference (Copy-Paste Ready)

**CTC Africa Project:**
- Project ID: `938241`
- Workflow ID: `43608`

**Assignee (Cor Cronje):**
- User ID: `108693`

**Common Stage IDs:**
- `182968` - Selected
- `182969` - In Progress
- `182970` - QA Ready

**One-liner to create a task:**
```javascript
const task = new Task('938241');
task.title = "Your task title here";
task.description = "Description";
task.assigneeUserId = 108693;
task.priority = TaskPriority.HIGH;
task.dueDate = '2026-08-15';
task.stageId = 182969;
const params = task.toParams();
const result = await client.createTask(params);
console.log(result.task.id); // Use this ID for time entries
```

## Basic Usage

### Creating a Task

```javascript
import { Task, TaskPriority } from './src/Task.js';

// Create a task object
const task = new Task('938241'); // Project ID

// Set properties
task.title = "My Task Title";
task.description = "Task description in markdown";
task.assigneeUserId = 108693; // User ID
task.priority = TaskPriority.HIGH; // or TaskPriority.HIGH = 3
task.dueDate = new Date('2026-08-31'); // Date object or 'YYYY-MM-DD'
task.stageId = 182969; // In Progress stage
task.workflowId = 43608; // Workflow ID

// Validate
task.validate();

// Get MCP parameters
const params = task.toParams();
```

### Using with TeamworkClient

```javascript
import { Task, TaskPriority } from './src/Task.js';
import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

const config = loadConfig();
const client = new TeamworkClient(config);

const task = new Task('938241');
task.title = "Implementation Work";
task.description = "Complete the feature implementation";
task.assigneeUserId = 108693;
task.priority = TaskPriority.HIGH;
task.dueDate = new Date('2026-08-31');

task.validate();
const params = task.toParams();
const result = await client.createTask(params);

// Store task ID for time entries
task.id = result.task.id;
```

## Properties

### Required

- **projectId** `string|number` - Teamwork project ID
- **title** `string` - Task title (required for validation)

### Optional

- **description** `string` - Task description (supports markdown)
- **assigneeUserId** `string|number` - User ID to assign task to
- **priority** `number` - Priority level (see TaskPriority constants)
- **dueDate** `Date|string` - Due date (auto-formatted to YYYY-MM-DD)
- **stageId** `string|number` - Workflow stage ID
- **workflowId** `string|number` - Workflow ID
- **taskListId** `string|number` - Task list/inbox ID
- **notifyUserIds** `array<string|number>` - User IDs to notify

## Date Handling

The Task class automatically handles date formatting. You can use either Date objects or strings:

```javascript
// Using Date objects (recommended)
task.dueDate = new Date('2026-08-31');

// Using YYYY-MM-DD strings
task.dueDate = '2026-08-31';

// Internally converts to YYYY-MM-DD format
const params = task.toParams();
console.log(params.dueDate); // "2026-08-31"
```

### Date Format

All dates must be in ISO 8601 format: **YYYY-MM-DD**

```javascript
// Valid formats
task.dueDate = new Date('2026-08-31');
task.dueDate = '2026-08-31';

// Invalid formats (will throw error)
task.dueDate = '08/31/2026'; // ❌
task.dueDate = '31-Aug-2026'; // ❌
```

## Time Entries

After creating a task, you can add time entries (time tracking):

```javascript
const task = new Task('938241');
// ... set task properties ...
task.validate();

// Create task first
const result = await client.createTask(task.toParams());
task.id = result.task.id;

// Add time entry
task.addTimeEntry({
  date: '2026-08-11',         // Required: YYYY-MM-DD
  time: '14:30',              // Optional: HH:MM (24-hour format)
  hours: 2,                   // Optional: hours worked
  minutes: 30,                // Optional: additional minutes
  description: 'Implementation work',  // Optional: what was done
  billable: true,             // Optional: is this billable time?
  personId: 108693            // Optional: specific user
});

// Add another time entry
task.addTimeEntry({
  date: new Date('2026-08-12'),
  hours: 1,
  minutes: 15,
  description: 'Testing and bug fixes'
});

// Get time entry parameters for MCP
const timeEntryParams = task.getTimeEntryParams();
for (const entry of timeEntryParams) {
  const result = await client.addTaskTimeEntry(entry);
}
```

### Time Entry Format

```javascript
{
  date: 'YYYY-MM-DD',              // Required
  time: 'HH:MM',                   // Optional (24-hour format)
  hours: number,                   // Optional (default 0)
  minutes: number,                 // Optional (default 0)
  description: 'string',           // Optional
  billable: boolean,               // Optional (default false)
  personId: number|string          // Optional
}
```

### Time Examples

```javascript
// Log 2 hours and 30 minutes
task.addTimeEntry({
  date: '2026-08-11',
  hours: 2,
  minutes: 30,
  description: 'Feature development'
});

// Log work completed at specific time
task.addTimeEntry({
  date: '2026-08-11',
  time: '14:30',  // 2:30 PM
  hours: 1,
  minutes: 45,
  description: 'Meeting and planning'
});

// Log billable consulting time
task.addTimeEntry({
  date: '2026-08-11',
  hours: 4,
  description: 'Client consultation',
  billable: true,
  personId: 108693  // Log as specific user
});
```

## Priority Constants

Use the `TaskPriority` enum for readability:

```javascript
import { TaskPriority } from './src/Task.js';

task.priority = TaskPriority.HIGHEST;  // 4 - critical
task.priority = TaskPriority.HIGH;     // 3 - high priority
task.priority = TaskPriority.NORMAL;   // 2 - normal (default)
task.priority = TaskPriority.LOW;      // 1 - low priority
task.priority = TaskPriority.LOWEST;   // 0 - lowest priority
```

## Static Helper Methods

The Task class provides static methods for date/time formatting:

```javascript
// Format a Date object to YYYY-MM-DD
const dateStr = Task.formatDate(new Date('2026-08-31'));
console.log(dateStr); // "2026-08-31"

// Validate and format a date string
const dateStr = Task.formatDate('2026-08-31');
console.log(dateStr); // "2026-08-31"

// Format time to HH:MM
const timeStr = Task.formatTime('14:30');
console.log(timeStr); // "14:30"

const timeStr = Task.formatTime(new Date(/* 14:30 */));
console.log(timeStr); // "14:30"
```

## Validation

The `validate()` method checks for required fields:

```javascript
const task = new Task('938241');
task.title = "My Task";

// Validates successfully
task.validate();

// Throws error if title is missing
const task2 = new Task('938241');
task2.validate(); // Error: Task validation failed: title is required
```

## Complete Example

```javascript
import { Task, TaskPriority } from './src/Task.js';
import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

async function createTaskWithTimeEntry() {
  const config = loadConfig();
  const client = new TeamworkClient(config);

  // Create task
  const task = new Task('938241');
  task.title = "Feature Development";
  task.description = "Implement user authentication\n\n- Set up login form\n- Add password validation\n- Create session management";
  task.assigneeUserId = 108693;
  task.priority = TaskPriority.HIGH;
  task.dueDate = new Date('2026-08-31');
  task.stageId = 182969;
  task.workflowId = 43608;

  // Validate
  task.validate();

  // Create in Teamwork
  console.log('Creating task...');
  const result = await client.createTask(task.toParams());
  task.id = result.task.id;
  console.log(`✓ Task created: ${task.id}`);

  // Add time entries
  console.log('Adding time entries...');
  task.addTimeEntry({
    date: '2026-08-11',
    hours: 3,
    minutes: 30,
    description: 'Frontend development - login form',
    billable: true
  });

  task.addTimeEntry({
    date: '2026-08-12',
    hours: 2,
    minutes: 15,
    description: 'Backend - session management',
    billable: true
  });

  // Log time entries
  const timeEntries = task.getTimeEntryParams();
  for (const entry of timeEntries) {
    const timeResult = await client.addTaskTimeEntry(entry);
    console.log(`✓ Time logged: ${timeResult.timeLogId}`);
  }

  return task;
}

createTaskWithTimeEntry();
```

## Error Handling

```javascript
try {
  const task = new Task('938241');
  task.title = "My Task";
  
  // This will throw if title is empty
  task.validate();

  // This will throw if date format is invalid
  task.dueDate = '08/31/2026'; // ❌ Invalid format
  task.toParams(); // Throws error

} catch (error) {
  console.error('Task error:', error.message);
}
```

## Integration with MCP

### Via TeamworkClient

```javascript
const client = new TeamworkClient(config);
const params = task.toParams();
const result = await client.createTask(params);
```

### Via MCP Tool (Claude Code)

```javascript
// Tools are exposed through MCP:
// - teamwork_create_task
// - teamwork_add_task_time_entry
// - teamwork_update_task
```

## Comments

The Task class supports adding comments that will be posted after task creation:

```javascript
const task = new Task('938241');
task.title = "My Task";

// Add comments (chaining supported)
task
  .addComment("## Work Summary\n\nInitial discovery findings...")
  .addComment("Follow-up notes on implementation")
  .addComment("Additional context");

// Get comments before posting
const comments = task.getPendingComments();

// After task creation, add comments
const comments = task.getPendingComments();
for (const body of comments) {
  await client.addTaskComment({
    taskId: task.id,
    body: body
  });
}

// Clear pending comments
task.clearPendingComments();
```

## Task Prioritization & Queues

See [TaskQueue Guide](./TASK_QUEUE.md) for managing task queues, prioritization, and lane organization.

## See Also

- [README.md](../README.md) - MCP overview
- [TASK_QUEUE.md](./TASK_QUEUE.md) - Task prioritization and lane management
- [TIME_ENTRY_IMPLEMENTATION.md](./TIME_ENTRY_IMPLEMENTATION.md) - Time entry details
- [teamworkClient.js](../src/teamworkClient.js) - Underlying implementation
