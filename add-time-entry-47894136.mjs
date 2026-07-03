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

const taskId = '47894136';

// Today's date in YYYYMMDD format
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const dateStr = `${year}${month}${day}`;

// Time: 16:00 (4:00 PM)
const timeStr = '1600';

// Duration: 1 hour 14 minutes
const hours = 1;
const minutes = 14;

try {
  console.log(`📝 Adding time entry to task ${taskId}...`);
  console.log(`   Date: ${year}-${month}-${day}`);
  console.log(`   Time: 16:00 (4:00 PM)`);
  console.log(`   Duration: ${hours}h ${minutes}m`);
  console.log('');

  const timeResult = await client.addTaskTimeEntry({
    taskId: taskId,
    description: 'Implemented file upload question type for surveys',
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
