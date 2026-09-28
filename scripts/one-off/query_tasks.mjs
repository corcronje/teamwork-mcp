// HISTORICAL ONE-OFF SCRIPT - not part of the reusable MCP server and not maintained.
// It was written for a single task on one Teamwork site and contains hardcoded
// project/task/user/stage IDs for that site. Kept only as a record; do not use it
// as a usage example. Use the MCP tools (see README) or src/teamworkClient.js.
import { TeamworkClient } from '../../src/teamworkClient.js';
import { loadConfig } from '../../src/config.js';

const config = loadConfig();
console.error('Config loaded:', { baseUrl: config.baseUrl, authMode: config.authMode });

const client = new TeamworkClient(config);

try {
  // Get my tasks
  console.error('Fetching my tasks...');
  const response = await client.getMyTasks();
  console.error('Response type:', typeof response, 'Keys:', Object.keys(response || {}).slice(0, 5));
  
  // The response might have the tasks in different formats
  let tasks = [];
  if (Array.isArray(response)) {
    tasks = response;
  } else if (response && Array.isArray(response.tasks)) {
    tasks = response.tasks;
  } else if (response && Array.isArray(response['todo-items'])) {
    tasks = response['todo-items'];
  } else if (response && response.data && Array.isArray(response.data)) {
    tasks = response.data;
  }
  
  console.error(`Found ${tasks.length} tasks assigned to me`);
  console.log(JSON.stringify({ totalTasks: tasks.length, tasks: tasks.slice(0, 5) }, null, 2));
} catch (err) {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
}
