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

const taskId = '48241927';

try {
  console.log(`📝 Adding time entry comment to task ${taskId}...`);
  console.log('');

  const comment = `⏱️ **Time Entry Log**

**Date:** 2026-07-03
**Duration:** 1 hour 15 minutes (10:45 AM - 12:00 PM)

**Work Completed:**
- Reviewed backend API for education keywords field alignment
- Verified StoreProfileDataRequest allows keywords as nullable
- Confirmed ProfileController stores education data correctly as JSON
- Removed keywords column from MyProfile education table display
- Made keywords field optional in EducationForm validation
- Merged frontend branch (fix/48241927-education-keywords-alignment) to main
- Merged backend branch to main

**Status:** ✅ Task complete`;

  const result = await client.addTaskComment({
    taskId: taskId,
    body: comment
  });

  console.log('✅ Comment successfully added!');
  console.log(`   Task: ${taskId}`);
  if (result && result.id) {
    console.log(`   Comment ID: ${result.id}`);
  }
} catch (error) {
  console.error('❌ Error adding comment:', error.message);
  process.exit(1);
}
