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

// Today's date in YYYYMMDD format
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const dateStr = `${year}${month}${day}`;

// Time: 13:00 (1:00 PM)
const timeStr = '1300';

// Duration: 2 hours 30 minutes
const hours = 2;
const minutes = 30;

try {
  console.log(`📝 Adding time entry to task ${taskId}...`);
  console.log(`   Date: ${year}-${month}-${day}`);
  console.log(`   Time: 13:00 (1:00 PM)`);
  console.log(`   Duration: ${hours}h ${minutes}m`);
  console.log('');

  const timeResult = await client.addTaskTimeEntry({
    taskId: taskId,
    description: 'Task #48266467 - Profile form text changes and section reorganization',
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
} catch (error) {
  console.error('❌ Error adding time entry:', error.message);
  process.exit(1);
}
