#!/usr/bin/env node
// HISTORICAL ONE-OFF SCRIPT - not part of the reusable MCP server and not maintained.
// It was written for a single task on one Teamwork site and contains hardcoded
// project/task/user/stage IDs for that site. Kept only as a record; do not use it
// as a usage example. Use the MCP tools (see README) or src/teamworkClient.js.

/**
 * Create CTC clinical trials task using Teamwork MCP
 */

import { Task, TaskPriority } from '../../src/Task.js';
import { TeamworkClient } from '../../src/teamworkClient.js';
import { loadConfig } from '../../src/config.js';
import { logger } from '../../src/logger.js';

async function createCTCTask() {
  try {
    const config = loadConfig();
    const client = new TeamworkClient(config);

    // Create task using Task class
    const task = new Task('938241'); // CTC.Africa project ID
    task.title = 'Clinical Trials Data Sync: Field Mapping Issues';
    task.description = `## Problem

Scigenix API sync is incomplete. 37,723 trials imported but 10-30% fields missing per trial:
- Low completion scores (83% vs 95%+)
- Trial ID missing from form display
- Sites/Centers not linked to trials
- Contributor & Entities fields empty

## Root Causes

1. **Silent field mapping failures** (ImportsDataController lines 24-38)
   - API field names don't match exact mapping expectations
   - Failed fields skipped with no error logging

2. **Malformed Sites JSON** (lines 832-839)
   - Incorrect nesting: ["['Ghana']"] instead of proper array format
   - Type conversion issues between API formats

3. **Phase/Condition special handling** (lines 841-855)
   - Phase pulled from extra_data['phase'], not flatstructure
   - Condition has fallback logic but no normalization

4. **Entities question type mismatch**
   - FormConnections type may not be processed by standard sync logic

## Discovery Complete

- ✓ Database verified: 37,723 trials, 378,606 question_answers records
- ✓ Sample analysis: 10/12 fields filled (83%)
- ✓ Code locations identified with line numbers
- ✓ Ready for implementation phase

## Next Steps

1. Validate actual Scigenix API field names
2. Fix ImportsDataController field mapping
3. Correct Sites JSON encoding
4. Debug Trial ID form rendering
5. Fix Entities question population
6. Add logging for skipped fields`;

    task.assigneeUserId = 108693; // Cor Cronje
    task.priority = TaskPriority.HIGH; // 3
    task.stageId = 182969; // In Progress stage
    task.workflowId = 43608; // CTC workflow
    task.dueDate = new Date('2026-08-31'); // Due end of August

    // Validate
    task.validate();

    // Create via MCP
    console.log('Creating task...');
    const params = task.toParams();
    console.log('Parameters:', JSON.stringify(params, null, 2));

    const result = await client.createTask(params);
    console.log('\n✓ Task created successfully!');

    // Extract task ID
    const taskId = result?.task?.id || result?.id;
    if (taskId) {
      task.id = taskId;
      console.log(`✓ Task ID: ${taskId}`);
      console.log(`✓ URL: https://teamwork.nuvoteq.io/app/tasks/${taskId}`);

      // Optionally add time entry for discovery work
      console.log('\nAdding time entry for discovery work...');
      task.addTimeEntry({
        date: '2026-08-11',
        hours: 2,
        minutes: 30,
        description: 'Discovery analysis - Scigenix API integration review',
        billable: true
      });

      const timeParams = task.getTimeEntryParams();
      for (const entry of timeParams) {
        const timeResult = await client.addTaskTimeEntry(entry);
        console.log(`✓ Time logged: ${timeResult?.timeLogId || 'success'}`);
      }
    }

  } catch (error) {
    console.error('✗ Error creating task:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

createCTCTask();
