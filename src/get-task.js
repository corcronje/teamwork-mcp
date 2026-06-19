import { loadConfig } from "./config.js";
import { TeamworkClient } from "./teamworkClient.js";

async function main() {
  const taskId = process.argv[2];
  
  if (!taskId) {
    console.error(JSON.stringify({ error: "Task ID required" }));
    process.exit(1);
  }

  try {
    const config = loadConfig();
    const client = new TeamworkClient(config);
    
    const task = await client.getTask(taskId);
    console.log(JSON.stringify(task, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

main();
