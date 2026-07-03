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

try {
  console.log(`Fetching task ${taskId}...`);
  const task = await client.getTask({ taskId });
  console.log('✅ Task found:');
  console.log(JSON.stringify(task, null, 2));
} catch (error) {
  console.error('❌ Error fetching task:', error.message);
}
