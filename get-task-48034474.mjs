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
  console.log(`📋 Fetching task details for task ${taskId}...\n`);

  const taskResult = await client.getTask({ taskId });

  if (taskResult && taskResult.task) {
    const task = taskResult.task;
    console.log('='.repeat(60));
    console.log(`TASK #${task.id || taskId}`);
    console.log('='.repeat(60));
    console.log(`\nName: ${task.name || 'N/A'}`);
    console.log(`Description:\n${task.description || 'N/A'}`);
    console.log(`\nStatus: ${task.status || 'N/A'}`);
    console.log(`Priority: ${task.priority || 'N/A'}`);
    console.log(`Assignee: ${task.assignee?.name || 'Unassigned'}`);
    console.log(`\nCreated: ${task.createdOn || 'N/A'}`);
    console.log(`Due: ${task.due || 'N/A'}`);
    console.log('\n' + '='.repeat(60));
  } else {
    console.log('Task data structure not as expected:');
    console.log(JSON.stringify(taskResult, null, 2));
  }
} catch (error) {
  console.error('❌ Error fetching task:', error.message);
  process.exit(1);
}
