#!/usr/bin/env node

import { Task, TaskPriority } from './src/Task.js';
import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

const LONG_DESCRIPTION = `## Overview
Complete the golden data import system infrastructure to enable full data synchronization from the Scigenix API. This work finalizes the completion percentage calculation system and ensures 100% API field coverage with robust error handling for production reliability.

## Current State
- Golden data import partially working: 3,812 sites × 29,871 question_answers imported
- Completion percentage calculation: 3,840 centers with average 3.66% completion
- Field mapping coverage: 135/136 fields (98.5%)
- Job error handling: Missing critical safety checks
- API verified: All 136 fields confirmed available in production API

## Problems to Solve

### 1. Field Mapping Gap (1 hour)
**Issue:** The Scigenix API returns 136 fields in sites endpoint, but our mapping only covers 135. One field is missing from \`GoldenDataFieldMapping.php\` despite being available in the API.

**Missing Field:**
- API Field: \`number_of_trials_early_bactericidal_activity_trial\`
- Template Question ID: \`9f25583c-e5c3-45ad-90b6-5b05526d98e9\`
- Question: "Early bactericidal activity trial (Phase IIa trials: short term dose-ranging in patients)"
- Section: TB Centre Information

**Impact:** Golden data containing this field won't be imported. This field tracks a specific trial phase data which is critical for centers doing TB research.

**Solution:**
Add to \`app/Services/CTCData/GoldenDataFieldMapping.php\`:
\`\`\`php
'number_of_trials_early_bactericidal_activity_trial' => '9f25583c-e5c3-45ad-90b6-5b05526d98e9',
\`\`\`

### 2. UpdateEntityCompletionPercentage Job Error Handling (3 hours)

**Critical Issues:**

#### Issue 2a: Missing Null Check for Template (HIGH PRIORITY)
File: \`app/Jobs/UpdateEntityCompletionPercentage.php\` (Lines 42-46)

**Problem:** If entity has a non-existent template or template_id mismatch, query returns null. Calling \`->loadQuestionAnswers()\` on null causes job to crash. This blocks queue processing and prevents all subsequent completion percentage updates.

**Real-World Scenario:** If any entity's template_id is corrupted or deleted, the entire completion percentage update queue fails, affecting data integrity for all entities.

**Fix:**
\`\`\`php
if (!$formTemplate) {
    Log::warning("Template not found for entity: {$this->entity->id}");
    return;
}
\`\`\`

#### Issue 2b: Division by Zero (MEDIUM PRIORITY)
File: \`app/Jobs/UpdateEntityCompletionPercentage.php\` (Line 60)

**Problem:** If template has zero questions (edge case for corrupted templates), division by zero causes job crash.

**Real-World Scenario:** Malformed template with no forms/questions would crash the job.

**Fix:**
\`\`\`php
$percentage = $completed['total'] > 0
    ? ($completed['completed'] / $completed['total']) * 100
    : 0;
\`\`\`

## Implementation Tasks (6 hours)

### 1. Code Changes (2 hours)
- [ ] Add missing field mapping to GoldenDataFieldMapping.php
- [ ] Add null check for template in UpdateEntityCompletionPercentage job
- [ ] Add division by zero protection
- [ ] Code review and verification

### 2. Testing & Verification (3 hours)
- [ ] Re-import golden data with complete 136-field mapping
- [ ] Verify all 3,812 sites import correctly
- [ ] Test edge cases with corrupted/missing templates
- [ ] Verify completion percentage recalculation for all 3,840 centers
- [ ] Confirm new field data is populated
- [ ] Monitor queue processing for errors

### 3. Documentation & Deployment (1 hour)
- [ ] Update field mapping documentation
- [ ] Document error handling strategy
- [ ] Update completion percentage calculation documentation
- [ ] Prepare deployment checklist

## Expected Results

### Functional Improvements
- ✅ 100% API field coverage (136/136 fields mapped)
- ✅ Robust job error handling prevents queue blocking
- ✅ Graceful handling of edge cases
- ✅ Complete golden data synchronization

### Data Improvements
- ✅ Additional TB trial phase data imported for ~30-50 centers
- ✅ Completion percentage distribution shifts as new field data is populated
- ✅ Estimated completion increase: 0.2-0.5% average

### System Reliability
- ✅ Queue processing won't crash on template issues
- ✅ Proper error logging for debugging
- ✅ Safe division by zero handling
- ✅ Production-ready job implementation

## Testing Evidence from Development
- API verified: 136 fields returned from production Scigenix API
- Field names confirmed: All snake_case, matching database conventions
- Template verified: All 137 questions present, soft-deleted sections included
- Completion calculation tested: 3,794 centers with completion > 0%
- Database state: Clean, ready for full re-import

## Related Systems Affected
- Golden data import pipeline
- Entity completion percentage system (3,840 centers)
- Queue processing system
- Form template/question loading
- TB Centre form module

## Acceptance Criteria
- [ ] Field mapping count = 136
- [ ] Job handles null template gracefully
- [ ] Job handles zero questions gracefully
- [ ] All 3,812 sites import without errors
- [ ] All 3,840 centers receive completion percentage
- [ ] Queue processing completes without failures
- [ ] New field is populated for relevant centers
- [ ] Completion percentages calculated and stored correctly
- [ ] Error logs show proper warnings for edge cases
- [ ] Documentation updated
- [ ] Code review approved`;

async function createGoldenDataTask() {
  try {
    const config = loadConfig();
    const client = new TeamworkClient(config);

    const task = new Task('938241'); // CTC.Africa project ID
    task.title = 'Golden Data Import - Complete Field Mapping & Fix Job Error Handling';
    task.description = LONG_DESCRIPTION;
    task.priority = TaskPriority.MEDIUM;
    
    console.log('Creating task...');
    const created = await client.createTask(task);
    
    console.log('Response:', JSON.stringify(created, null, 2));
    
    if (created) {
      const taskId = created.id || created.taskId || created.data?.id;
      if (taskId) {
        console.log(`\n✓ Task created successfully!`);
        console.log(`Task ID: ${taskId}`);
        console.log(`Task URL: https://teamwork.nuvoteq.io/tasks/${taskId}`);
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

createGoldenDataTask();
