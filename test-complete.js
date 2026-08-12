#!/usr/bin/env node

/**
 * Complete MCP Test - Tasks, Comments, Time Entries, Lanes, and Prioritization
 */

import { Task, TaskPriority } from './src/Task.js';
import { TaskQueue } from './src/TaskQueue.js';
import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

async function runCompleteTests() {
  try {
    const config = loadConfig();
    const client = new TeamworkClient(config);

    console.log('\n' + '='.repeat(70));
    console.log('COMPLETE TEAMWORK MCP TEST SUITE');
    console.log('Tasks, Comments, Time Entries, Lanes, and Prioritization');
    console.log('='.repeat(70));

    // TEST 1: Task with Comment
    console.log('\n[TEST 1] Create Task with Comment');
    console.log('-'.repeat(70));
    try {
      const task = new Task('938241');
      task.title = 'CTC Clinical Trials Data Sync Analysis';
      task.description = 'Review and analyze clinical trials data sync from Scigenix API';
      task.assigneeUserId = 108693;
      task.priority = TaskPriority.HIGH;
      task.dueDate = '2026-08-31';
      task.stageId = 182969; // In Progress

      // Add comments before creating task
      task.addComment('**Discovery Phase Complete**\n\n- Identified field mapping issues\n- Database verification done\n- Ready for implementation');
      task.addComment('API Integration Notes:\n- Date format: YYYY-MM-DD\n- Auth: Basic token:x\n- Fallback endpoints supported');

      console.log('✓ Task created with properties:');
      console.log(`  - Title: ${task.title}`);
      console.log(`  - Priority: ${task.priority} (HIGH)`);
      console.log(`  - Due: ${task.dueDate}`);
      console.log(`  - Pending Comments: ${task.getPendingComments().length}`);
      console.log(`  ✓ Comment 1: "${task.getPendingComments()[0].substring(0, 40)}..."`);
      console.log(`  ✓ Comment 2: "${task.getPendingComments()[1].substring(0, 40)}..."`);

      // Demonstrate chaining
      task.addComment('Third comment').addComment('Fourth comment');
      console.log(`✓ Chaining works: ${task.getPendingComments().length} comments total`);
    } catch (error) {
      console.error('✗ Test 1 failed:', error.message);
    }

    // TEST 2: Task with Time Entries
    console.log('\n[TEST 2] Task with Multiple Time Entries');
    console.log('-'.repeat(70));
    try {
      const task = new Task('938241');
      task.title = 'Development Work';
      task.id = 'demo-task-123'; // Simulated ID

      // Add multiple time entries
      task
        .addTimeEntry({
          date: '2026-08-11',
          hours: 3,
          minutes: 30,
          description: 'API discovery and analysis',
          billable: true
        })
        .addTimeEntry({
          date: '2026-08-12',
          time: '14:00',
          hours: 2,
          minutes: 15,
          description: 'Documentation review',
          billable: true
        })
        .addTimeEntry({
          date: '2026-08-13',
          hours: 1,
          minutes: 45,
          description: 'Team sync and planning',
          billable: false
        });

      const timeParams = task.getTimeEntryParams();
      console.log(`✓ Added ${timeParams.length} time entries:`);
      timeParams.forEach((entry, i) => {
        const total = `${entry.hours}h ${entry.minutes}m`;
        console.log(`  ${i + 1}. ${entry.date} ${entry.time || '--:--'} - ${total} - ${entry.description.substring(0, 30)}...`);
      });

      const totalHours = timeParams.reduce((sum, entry) => sum + entry.hours + (entry.minutes / 60), 0);
      console.log(`✓ Total time logged: ${totalHours.toFixed(2)} hours`);
    } catch (error) {
      console.error('✗ Test 2 failed:', error.message);
    }

    // TEST 3: Date Validation (Strict)
    console.log('\n[TEST 3] Date Validation (Strict Format)');
    console.log('-'.repeat(70));
    try {
      // Valid dates
      const validDates = [
        '2026-08-31',
        new Date('2026-08-31'),
        new Date(2026, 7, 31)
      ];

      validDates.forEach(date => {
        try {
          const formatted = Task.formatDate(date);
          console.log(`✓ Valid: ${formatted}`);
        } catch (e) {
          console.log(`✗ Unexpected error: ${e.message}`);
        }
      });

      // Invalid dates
      const invalidDates = [
        '08/31/2026',
        '31-Aug-2026',
        '2026/08/31',
        'August 31, 2026'
      ];

      invalidDates.forEach(date => {
        try {
          Task.formatDate(date);
          console.log(`✗ Should have rejected: ${date}`);
        } catch (e) {
          console.log(`✓ Rejected: "${date}" → ${e.message.substring(0, 45)}...`);
        }
      });
    } catch (error) {
      console.error('✗ Test 3 failed:', error.message);
    }

    // TEST 4: TaskQueue - Priority Sorting
    console.log('\n[TEST 4] TaskQueue - Priority Sorting');
    console.log('-'.repeat(70));
    try {
      const mockTasks = [
        { id: 1, name: 'Low priority', priority: 1, 'due-date': '2026-09-15' },
        { id: 2, name: 'High priority', priority: 3, 'due-date': '2026-08-15' },
        { id: 3, name: 'Medium priority', priority: 2, 'due-date': '2026-08-20' },
        { id: 4, name: 'Urgent', priority: 4, 'due-date': '2026-08-12' },
        { id: 5, name: 'Normal priority', priority: 2, 'due-date': '2026-08-18' }
      ];

      const sorted = TaskQueue.sortByPriority(mockTasks);
      console.log('✓ Tasks sorted by priority (highest first):');
      sorted.forEach((task, i) => {
        console.log(`  ${i + 1}. [Priority ${task.priority}] ${task.name}`);
      });
    } catch (error) {
      console.error('✗ Test 4 failed:', error.message);
    }

    // TEST 5: TaskQueue - Grouping by Stage
    console.log('\n[TEST 5] TaskQueue - Group by Stage (Lanes)');
    console.log('-'.repeat(70));
    try {
      const mockTasks = [
        { id: 1, name: 'Task 1', 'stage-id': 'selected' },
        { id: 2, name: 'Task 2', 'stage-id': 'in_progress' },
        { id: 3, name: 'Task 3', 'stage-id': 'selected' },
        { id: 4, name: 'Task 4', 'stage-id': 'qa_ready' },
        { id: 5, name: 'Task 5', 'stage-id': 'in_progress' }
      ];

      const grouped = TaskQueue.groupByStage(mockTasks);
      console.log('✓ Tasks grouped by stage (lane):');
      Object.entries(grouped).forEach(([stage, tasks]) => {
        console.log(`  [${stage}]: ${tasks.length} tasks`);
        tasks.forEach(task => {
          console.log(`    - ${task.name}`);
        });
      });
    } catch (error) {
      console.error('✗ Test 5 failed:', error.message);
    }

    // TEST 6: TaskQueue - Priority Queue
    console.log('\n[TEST 6] TaskQueue - Priority Queue (What to Work On)');
    console.log('-'.repeat(70));
    try {
      const mockTasks = [
        { id: 1, name: 'Low priority task', priority: 1 },
        { id: 2, name: 'High priority, due soon', priority: 3, 'due-date': '2026-08-15' },
        { id: 3, name: 'Medium, due next week', priority: 2, 'due-date': '2026-08-20' },
        { id: 4, name: 'Critical, overdue!', priority: 4, 'due-date': '2026-08-01' },
        { id: 5, name: 'No due date set', priority: 2 }
      ];

      const queue = TaskQueue.buildPriorityQueue(mockTasks);
      console.log('✓ Work queue built:');
      console.log(`\n  🔴 URGENT (${queue.urgent.length}):`);
      queue.urgent.forEach(task => {
        console.log(`    - [${task.id}] ${task.name}`);
      });
      console.log(`\n  🟠 DUE SOON (${queue.dueSoon.length}):`);
      queue.dueSoon.forEach(task => {
        console.log(`    - [${task.id}] ${task.name}`);
      });
      console.log(`\n  🟡 NOT URGENT (${queue.undue.length}):`);
      queue.undue.forEach(task => {
        console.log(`    - [${task.id}] ${task.name}`);
      });
      console.log(`\n  ⬜ NO DUE DATE (${queue.noDueDate.length}):`);
      queue.noDueDate.forEach(task => {
        console.log(`    - [${task.id}] ${task.name}`);
      });
    } catch (error) {
      console.error('✗ Test 6 failed:', error.message);
    }

    // TEST 7: Get My Tasks (from API)
    console.log('\n[TEST 7] Get My Tasks from Teamwork');
    console.log('-'.repeat(70));
    try {
      const myTasks = await client.getMyTasks({ pageSize: 10 });
      if (myTasks && myTasks.length > 0) {
        console.log(`✓ Retrieved ${myTasks.length} tasks assigned to me:`);
        const queue = TaskQueue.buildPriorityQueue(myTasks);
        console.log('\nWork queue summary:');
        console.log(`  🔴 Urgent: ${queue.urgent.length}`);
        console.log(`  🟠 Due soon: ${queue.dueSoon.length}`);
        console.log(`  🟡 Not urgent: ${queue.undue.length}`);
        console.log(`  ⬜ No due date: ${queue.noDueDate.length}`);

        // Show top 3 urgent tasks
        if (queue.urgent.length > 0) {
          console.log('\nTop urgent tasks:');
          queue.urgent.slice(0, 3).forEach((task, i) => {
            console.log(`  ${i + 1}. [${task.id}] ${(task.name || task.title || 'Untitled').substring(0, 50)}`);
          });
        }
      } else {
        console.log('ℹ No tasks assigned to me (queue is empty)');
      }
    } catch (error) {
      console.error('✗ Test 7 failed:', error.message);
    }

    // TEST 8: Task Validation
    console.log('\n[TEST 8] Task Validation');
    console.log('-'.repeat(70));
    try {
      const task = new Task('938241');
      try {
        task.validate();
        console.log('✗ Should have failed without title');
      } catch (e) {
        console.log(`✓ Validation failed correctly: ${e.message}`);
      }

      task.title = 'Valid Task';
      task.validate();
      console.log('✓ Validation passed with title');
    } catch (error) {
      console.error('✗ Test 8 failed:', error.message);
    }

    console.log('\n' + '='.repeat(70));
    console.log('TEST SUITE COMPLETE');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runCompleteTests();
