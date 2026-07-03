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

// Today's date in YYYY-MM-DD format
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const dateStr = `${year}-${month}-${day}`;

// Time: 15:25 (3:25 PM) in HH:MM format
const timeStr = '15:25';

// Duration: 1 hour 41 minutes
const hours = 1;
const minutes = 41;

try {
  console.log(`📝 Adding time entry to task ${taskId}...`);
  console.log(`   Date: ${dateStr}`);
  console.log(`   Time: ${timeStr}`);
  console.log(`   Duration: ${hours}h ${minutes}m`);
  console.log('');

  const timeResult = await client.addTaskTimeEntry({
    taskId: taskId,
    description: 'Task #48034474 - Hide empty profile sections and display fellowship type descriptions',
    date: dateStr,
    time: timeStr,
    hours: hours,
    minutes: minutes
  });

  console.log('✅ Time entry successfully added!');
  console.log(`   Task: ${taskId}`);
  console.log(`   Hours: ${hours}h ${minutes}m`);
  if (timeResult && timeResult.id) {
    console.log(`   Entry ID: ${timeResult.id}`);
  }
  console.log('\nTime Entry Details:');
  console.log(JSON.stringify(timeResult, null, 2));
} catch (error) {
  console.error('❌ Error adding time entry:', error.message);
  process.exit(1);
}
