import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env file manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envContent = readFileSync(resolve(__dirname, '.env'), 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    process.env[key.trim()] = value.trim();
  }
});

const config = loadConfig();
const client = new TeamworkClient(config);

const taskId = '48034474';

try {
  console.log(`📝 Adding completion comment to task ${taskId}...`);
  console.log('');

  const comment = `✅ **Task Completed - Time Entry: 1h 41m**

**Date:** 2026-07-03
**Time Spent:** 1 hour 41 minutes (15:25 - 17:06)

**Work Completed:**

**Feature: Hide empty profile sections and display fellowship type descriptions**

✓ Created fellowshipTypeMap utility for fellowship type ID to description mapping
✓ Added education section to FellowPreviewDialog with conditional rendering
✓ Updated FellowPreviewDialog to display fellowship type descriptions instead of integers
✓ Fixed Projects section in MyProfile to be conditionally rendered when data exists
✓ All multi-item sections (education, grants, publications, projects, positions) now hidden when empty
✓ Activity timeline section always visible on MyProfile as required

**Implementation Details:**
- src/utils/fellowshipTypeMap.js: New utility mapping fellowship call IDs to descriptions
- src/components/common/FellowPreviewDialog.vue:
  - Imported fellowship type mapping
  - Added education computed property for parsing education data
  - Added education section with conditional rendering
  - Fixed fellowship type display to use getFellowshipTypeLabel() method
- src/views/dashboard/MyProfile.vue:
  - Fixed Projects section to have v-if="displayProjects.length" on card element

**Implementation Quality:**
- Branch: fix/48034474-hide-empty-profile-sections
- Commit: 8728f3c
- Files modified: 3 (FellowPreviewDialog.vue, MyProfile.vue, fellowshipTypeMap.js)
- Lines added: 61

**Note:** Attempted to use proper Teamwork time entry API via addTaskTimeEntry, but the endpoint returned 404/400 errors. The v3 endpoint (/projects/api/v3/tasks/{taskId}/time_entries.json) returns 404 (Not Found), and the v1 fallback returns 400 (Bad Request with 'Unknown error'). This appears to be a limitation with the Teamwork API for this task type or instance configuration.

**Status:** ✅ Ready for review and merge`;

  const result = await client.addTaskComment({
    taskId: taskId,
    body: comment
  });

  console.log('✅ Completion comment successfully added!');
  console.log(`   Task: ${taskId}`);
  if (result && result.id) {
    console.log(`   Comment ID: ${result.id}`);
  }
} catch (error) {
  console.error('❌ Error adding comment:', error.message);
  process.exit(1);
}
