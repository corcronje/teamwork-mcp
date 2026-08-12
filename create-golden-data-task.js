#!/usr/bin/env node

import { Task, TaskPriority } from './src/Task.js';
import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';
import { logger } from './src/logger.js';

async function createGoldenDataTask() {
  try {
    const config = loadConfig();
    const client = new TeamworkClient(config);

    const task = new Task('938241'); // CTC.Africa project ID
    task.title = 'Golden Data Import - Complete Field Mapping & Fix Job Error Handling';
    task.description = `## Objective
Complete the golden data import system by adding the missing field mapping and fixing critical error handling in the completion percentage job.

## Part 1: Complete Field Mapping (98.5% → 100%)

The Scigenix API returns 136 fields, but our mapping only has 135. Add the missing field to \`app/Services/CTCData/GoldenDataFieldMapping.php\`:

\`\`\`php
'number_of_trials_early_bactericidal_activity_trial' => '9f25583c-e5c3-45ad-90b6-5b05526d98e9',
\`\`\`

## Part 2: Fix UpdateEntityCompletionPercentage Job Error Handling

File: \`app/Jobs/UpdateEntityCompletionPercentage.php\`

After line 45, add null check:
\`\`\`php
if (!$formTemplate) {
    Log::warning("Template not found for entity: {$this->entity->id}");
    return;
}
\`\`\`

At line 66, add division by zero protection:
\`\`\`php
$percentage = $completed['total'] > 0
    ? ($completed['completed'] / $completed['total']) * 100
    : 0;
\`\`\`

## Result
- ✅ 100% API field coverage (136/136)
- ✅ Job handles edge cases gracefully
- ✅ Queue won't be blocked by job failures

## Testing Done
- Golden data import verified: 3,812 sites × 29,871 question_answers
- API verified: 136 fields confirmed
- Field mapping verified: 135/136 coverage with exact missing field identified`;

    task.priority = TaskPriority.MEDIUM;
    task.assignees = [];
    
    // Create the task
    const created = await client.createTask(task);
    
    if (created && created.id) {
      logger.info(`✓ Task created: ${created.id}`);
      logger.info(`Title: ${created.title}`);
      
      // Move to "In Progress" stage
      const moved = await client.updateTask(created.id, { stage: 'In Progress' });
      if (moved) {
        logger.info(`✓ Moved to In Progress lane`);
      }
    } else {
      logger.error('Failed to create task');
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

createGoldenDataTask();
