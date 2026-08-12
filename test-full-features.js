/**
 * Comprehensive Test Suite for Teamwork MCP
 * Tests all CRUD operations, filtering, and advanced features
 */

import { Task, TaskPriority } from './src/Task.js';
import { TaskQueue } from './src/TaskQueue.js';
import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

const config = loadConfig();
const client = new TeamworkClient(config);

const PROJECT_ID = '938241';
let testTaskId = null;
let testCommentId = null;
let testTimeEntryId = null;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('\n=== TEAMWORK MCP COMPREHENSIVE TEST SUITE ===\n');

  const results = {
    create: 0,
    read: 0,
    update: 0,
    delete: 0,
    filter: 0,
    bulk: 0,
  };

  // ============ CREATE OPERATIONS ============
  console.log('📝 CREATE OPERATIONS\n');

  await test('Create task with all fields', async () => {
    const task = new Task(PROJECT_ID);
    task.title = 'Test Task: Complete CRUD Operations';
    task.description = '## Full Feature Test\n\nThis task tests all MCP features';
    task.assigneeUserId = 108693;
    task.priority = TaskPriority.HIGH;

    task.validate();
    const result = await client.createTask(task.toParams());
    testTaskId = result.task.id || result.id;

    if (!testTaskId) throw new Error('No task ID returned');
  });
  results.create++;

  // ============ READ OPERATIONS ============
  console.log('\n📖 READ OPERATIONS\n');

  await test('Get single task', async () => {
    const result = await client.getTask({ taskId: testTaskId });
    if (!result?.task?.id) throw new Error('Task not found');
  });
  results.read++;

  await test('Get my tasks', async () => {
    const result = await client.getMyTasks({ pageSize: 10 });
    if (!Array.isArray(result)) throw new Error('Invalid result format');
  });
  results.read++;

  await test('Get project tasks', async () => {
    const result = await client.getProjectTasks({ projectId: PROJECT_ID, pageSize: 10 });
    if (!result?.tasks || !Array.isArray(result.tasks)) throw new Error('Invalid result format');
  });
  results.read++;

  await test('List all tasks', async () => {
    const result = await client.listAllTasks({ projectId: PROJECT_ID, pageSize: 10 });
    if (!Array.isArray(result)) throw new Error('Invalid result format');
  });
  results.read++;

  // ============ UPDATE OPERATIONS ============
  console.log('\n✏️ UPDATE OPERATIONS\n');

  await test('Update task title and description', async () => {
    const result = await client.updateTask({
      taskId: testTaskId,
      title: 'Updated: Complete CRUD Operations',
      description: '## Updated Test Description\n\nNow with more details',
    });
    if (!result?.task?.id) throw new Error('Update failed');
  });
  results.update++;

  // ============ COMMENT OPERATIONS ============
  console.log('\n💬 COMMENT OPERATIONS\n');

  await test('Add comment to task', async () => {
    const result = await client.addTaskComment({
      taskId: testTaskId,
      body: '# Test Comment\n\nThis is a test comment with **markdown** support',
    });
    testCommentId = result?.comment?.id || result?.['comment-id'];
    if (!testCommentId && !result?.["TIME ENTRY CREATED SUCCESSFULLY"]) {
      throw new Error('Comment not created or invalid response');
    }
  });
  results.update++;

  await test('Get task comments', async () => {
    const result = await client.getTaskComments({ taskId: testTaskId });
    if (!Array.isArray(result)) throw new Error('Invalid result format');
  });
  results.read++;

  if (testCommentId) {
    await test('Update comment', async () => {
      const result = await client.updateTaskComment({
        taskId: testTaskId,
        commentId: testCommentId,
        body: '# Updated Comment\n\nThis comment has been updated',
      });
      if (!result) throw new Error('Update failed');
    });
    results.update++;
  }

  // ============ TIME ENTRY OPERATIONS ============
  console.log('\n⏱️ TIME ENTRY OPERATIONS\n');

  await test('Add time entry', async () => {
    const result = await client.addTaskTimeEntry({
      taskId: testTaskId,
      date: '2026-08-11',
      hours: 2,
      minutes: 30,
      description: 'Development and testing',
      isbillable: true,
    });
    testTimeEntryId = result?.['time-entry']?.id || result?.timeLogId;
  });
  results.create++;

  await test('Get task time entries', async () => {
    const result = await client.getTaskTimeEntries({ taskId: testTaskId });
    if (!Array.isArray(result)) throw new Error('Invalid result format');
  });
  results.read++;

  if (testTimeEntryId) {
    await test('Update time entry', async () => {
      const result = await client.updateTimeEntry({
        taskId: testTaskId,
        timeEntryId: testTimeEntryId,
        hours: 3,
        minutes: 0,
        description: 'Updated: Development, testing, and documentation',
      });
      if (!result) throw new Error('Update failed');
    });
    results.update++;
  }

  // ============ FILTERING OPERATIONS ============
  console.log('\n🔍 FILTERING OPERATIONS\n');

  await test('Filter tasks by assignee', async () => {
    const result = await client.filterTasksByAssignee({
      projectId: PROJECT_ID,
      assigneeUserId: 108693,
    });
    if (!Array.isArray(result)) throw new Error('Invalid result format');
  });
  results.filter++;

  await test('Filter tasks by priority', async () => {
    const result = await client.filterTasksByPriority({
      projectId: PROJECT_ID,
      priority: 3,
    });
    if (!Array.isArray(result)) throw new Error('Invalid result format');
  });
  results.filter++;

  await test('Filter active tasks', async () => {
    const result = await client.filterActiveTasks({ projectId: PROJECT_ID });
    if (!Array.isArray(result)) throw new Error('Invalid result format');
  });
  results.filter++;

  await test('Filter tasks without due date', async () => {
    const result = await client.filterTasksWithoutDueDate({ projectId: PROJECT_ID });
    if (!Array.isArray(result)) throw new Error('Invalid result format');
  });
  results.filter++;

  await test('Search tasks', async () => {
    const result = await client.searchTasks({
      projectId: PROJECT_ID,
      query: 'CRUD',
    });
    if (!Array.isArray(result)) throw new Error('Invalid result format');
  });
  results.filter++;

  // ============ TASK COMPLETION ============
  console.log('\n✔️ TASK COMPLETION\n');

  await test('Complete task', async () => {
    const result = await client.completeTask({
      taskId: testTaskId,
      completed: true,
    });
    if (!result) throw new Error('Completion failed');
  });
  results.update++;

  // ============ DELETE OPERATIONS ============
  console.log('\n🗑️ DELETE OPERATIONS\n');

  if (testCommentId) {
    await test('Delete comment', async () => {
      const result = await client.deleteTaskComment({
        taskId: testTaskId,
        commentId: testCommentId,
      });
      if (!result) throw new Error('Deletion failed');
    });
    results.delete++;
  }

  if (testTimeEntryId) {
    await test('Delete time entry', async () => {
      const result = await client.deleteTimeEntry({
        taskId: testTaskId,
        timeEntryId: testTimeEntryId,
      });
      if (!result) throw new Error('Deletion failed');
    });
    results.delete++;
  }

  await test('Delete task', async () => {
    const result = await client.deleteTask({ taskId: testTaskId });
    if (!result) throw new Error('Task deletion failed');
  });
  results.delete++;

  // ============ BULK OPERATIONS ============
  console.log('\n📦 BULK OPERATIONS\n');

  // Create multiple test tasks for bulk operations
  let bulkTaskIds = [];
  for (let i = 0; i < 2; i++) {
    const task = new Task(PROJECT_ID);
    task.title = `Bulk Test Task ${i + 1}`;
    task.description = 'Test task for bulk operations';
    task.validate();
    const result = await client.createTask(task.toParams());
    bulkTaskIds.push(result.task.id || result.id);
  }

  await test('Bulk delete tasks', async () => {
    const result = await client.bulkDeleteTasks({ taskIds: bulkTaskIds });
    if (!Array.isArray(result) || result.length !== bulkTaskIds.length) {
      throw new Error('Bulk delete failed');
    }
  });
  results.bulk++;

  // ============ SUMMARY ============
  console.log('\n=== TEST SUMMARY ===\n');
  const totalTests = Object.values(results).reduce((a, b) => a + b, 0);
  console.log(`CREATE: ${results.create} tests`);
  console.log(`READ: ${results.read} tests`);
  console.log(`UPDATE: ${results.update} tests`);
  console.log(`DELETE: ${results.delete} tests`);
  console.log(`FILTER: ${results.filter} tests`);
  console.log(`BULK: ${results.bulk} tests`);
  console.log(`\n📊 TOTAL: ${totalTests} tests\n`);
}

// Run all tests
runTests().catch(console.error);
