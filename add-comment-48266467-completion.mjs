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

const taskId = '48266467';

try {
  console.log(`📝 Adding completion comment to task ${taskId}...`);
  console.log('');

  const comment = `✅ **Task Completed - Time Entry: 2h 30m**

**Date:** 2026-07-03
**Time Spent:** 2 hours 30 minutes (starting 1:00 PM)

**Work Completed:**

**Tab 3: Professional Profile (formerly Education)**
✓ Renamed section header from "Education" to "Professional Profile"
✓ Changed "Professional Positions" → "Professional experience"
✓ Changed "Board/Editorial Membership" → "Board Memberships & Leadership Roles"

**Tab 4: Awards & Professional Activities (formerly Experiences)**
✓ Removed entire "Students Supervised" section
✓ Updated Awards header to "Awards received since EDCTP Fellowship"
✓ Replaced "University" label with "Awarding body"
✓ Renamed "Other Experiences" section to "Professional Activities"
✓ Changed "Position" field to "Role"
✓ Added placeholder text: "fieldwork, projects, technical work, committee work"

**Implementation:**
- Branch: fix/48266467-profile-text-changes
- Commit: 1df061b
- Files modified: 2 (EducationForm.vue, ExperiencesForm.vue)
- Lines changed: 18 insertions, 169 deletions (removed Students Supervised section)

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
