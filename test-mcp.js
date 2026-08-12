#!/usr/bin/env node

/**
 * Comprehensive MCP test suite
 * Tests: Task class, time entries, comments, lanes, and task queries
 */

import { Task, TaskPriority } from './src/Task.js';
import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';
import { logger } from './src/logger.js';

async function runTests() {
  try {
    const config = loadConfig();
    const client = new TeamworkClient(config);

    console.log('\n' + '='.repeat(60));
    console.log('TEAMWORK MCP TEST SUITE');
    console.log('='.repeat(60));

    // Test 1: Task Class - Date Formatting
    console.log('\n[TEST 1] Task Class - Date Formatting');
    console.log('-'.repeat(60));
    try {
      const task = new Task('938241');

      // Test date formatting
      task.dueDate = new Date('2026-08-31');
      const params1 = task.toParams();
      console.log(`✓ Date object formatted: ${params1.dueDate}`);

      task.dueDate = '2026-08-31';
      const params2 = task.toParams();
      console.log(`✓ String date formatted: ${params2.dueDate}`);

      // Test invalid date
      try {
        task.dueDate = '08/31/2026';
        task.toParams();
        console.log('✗ Invalid date should have thrown');
      } catch (e) {
        console.log(`✓ Invalid date caught: ${e.message.substring(0, 40)}...`);
      }
    } catch (error) {
      console.error('✗ Test 1 failed:', error.message);
    }

    // Test 2: Task Class - Time Formatting
    console.log('\n[TEST 2] Task Class - Time Formatting');
    console.log('-'.repeat(60));
    try {
      const task = new Task('938241');
      task.title = 'Test Task';
      task.id = 'test-123';

      // Test time entry
      task.addTimeEntry({
        date: '2026-08-11',
        time: '14:30',
        hours: 2,
        minutes: 30,
        description: 'Test work',
        billable: true
      });

      const timeParams = task.getTimeEntryParams();
      console.log(`✓ Time entry created: ${JSON.stringify(timeParams[0], null, 2).split('\n')[0]}`);
      console.log(`✓ Date: ${timeParams[0].date}`);
      console.log(`✓ Time: ${timeParams[0].time}`);
      console.log(`✓ Hours: ${timeParams[0].hours}, Minutes: ${timeParams[0].minutes}`);
    } catch (error) {
      console.error('✗ Test 2 failed:', error.message);
    }

    // Test 3: Get My Tasks
    console.log('\n[TEST 3] Get My Tasks (Assigned to Me)');
    console.log('-'.repeat(60));
    try {
      const myTasks = await client.getMyTasks({ pageSize: 5 });
      if (myTasks && myTasks.length > 0) {
        console.log(`✓ Retrieved ${myTasks.length} tasks assigned to me`);
        myTasks.slice(0, 3).forEach((task, i) => {
          console.log(`  ${i + 1}. [${task.id}] ${task.name || task.title || 'Untitled'}`);
        });
      } else {
        console.log('ℹ No tasks assigned to me');
      }
    } catch (error) {
      console.error('✗ Test 3 failed:', error.message);
    }

    // Test 4: Get Project Tasks
    console.log('\n[TEST 4] Get Project Tasks (CTC.Africa)');
    console.log('-'.repeat(60));
    try {
      const projectTasks = await client.getProjectTasks({
        projectId: '938241',
        pageSize: 5
      });
      if (projectTasks && projectTasks.length > 0) {
        console.log(`✓ Retrieved ${projectTasks.length} tasks from CTC.Africa project`);
        projectTasks.slice(0, 3).forEach((task, i) => {
          console.log(`  ${i + 1}. [${task.id}] ${task.name || task.title || 'Untitled'}`);
        });
      } else {
        console.log('ℹ No tasks in project');
      }
    } catch (error) {
      console.error('✗ Test 4 failed:', error.message);
    }

    // Test 5: Get Workflow Stages (Lanes)
    console.log('\n[TEST 5] Get Workflow Stages (Lanes)');
    console.log('-'.repeat(60));
    try {
      const stages = await client.getWorkflowStages({ workflowId: 43608 });
      if (stages && stages.length > 0) {
        console.log(`✓ Retrieved ${stages.length} workflow stages`);
        stages.forEach((stage, i) => {
          console.log(`  ${i + 1}. [${stage.id}] ${stage.name}`);
        });
      } else {
        console.log('ℹ No stages found');
      }
    } catch (error) {
      console.error('✗ Test 5 failed:', error.message);
    }

    // Test 6: Get Task Details
    console.log('\n[TEST 6] Get Task Details & Comments');
    console.log('-'.repeat(60));
    try {
      // Get a task to use for testing
      const myTasks = await client.getMyTasks({ pageSize: 1 });
      if (myTasks && myTasks.length > 0) {
        const taskId = myTasks[0].id;
        const taskDetail = await client.getTask({ taskId });
        console.log(`✓ Retrieved task details: ${taskDetail.task?.name || 'Untitled'}`);
        console.log(`  Status: ${taskDetail.task?.status}`);
        console.log(`  Assigned to: ${taskDetail.task?.['responsible-party-names']}`);

        // Try to get comments
        try {
          const comments = await client.getTaskComments({ taskId });
          if (comments && comments.length > 0) {
            console.log(`✓ Retrieved ${comments.length} comments`);
            comments.slice(0, 2).forEach((comment, i) => {
              console.log(`  ${i + 1}. ${comment.body?.substring(0, 50)}...`);
            });
          } else {
            console.log('ℹ No comments on this task');
          }
        } catch (e) {
          console.log(`ℹ Could not retrieve comments: ${e.message.substring(0, 50)}`);
        }
      } else {
        console.log('ℹ No tasks to get details for');
      }
    } catch (error) {
      console.error('✗ Test 6 failed:', error.message);
    }

    // Test 7: Priority Constants
    console.log('\n[TEST 7] Task Priority Constants');
    console.log('-'.repeat(60));
    try {
      const task = new Task('938241');
      task.title = 'Priority Test';

      const priorities = {
        HIGHEST: TaskPriority.HIGHEST,
        HIGH: TaskPriority.HIGH,
        NORMAL: TaskPriority.NORMAL,
        LOW: TaskPriority.LOW,
        LOWEST: TaskPriority.LOWEST
      };

      Object.entries(priorities).forEach(([name, value]) => {
        console.log(`✓ ${name}: ${value}`);
      });
    } catch (error) {
      console.error('✗ Test 7 failed:', error.message);
    }

    // Test 8: Task Validation
    console.log('\n[TEST 8] Task Validation');
    console.log('-'.repeat(60));
    try {
      const task = new Task('938241');

      // Should fail - no title
      try {
        task.validate();
        console.log('✗ Validation should have failed without title');
      } catch (e) {
        console.log(`✓ Caught missing title: ${e.message}`);
      }

      // Should pass - has title
      task.title = 'Test Task';
      task.validate();
      console.log('✓ Validation passed with title');
    } catch (error) {
      console.error('✗ Test 8 failed:', error.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('TEST SUITE COMPLETE');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runTests();
