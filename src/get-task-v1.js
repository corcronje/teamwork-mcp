import { loadConfig } from "./config.js";
import { TeamworkClient } from "./teamworkClient.js";

async function main() {
  const taskId = parseInt(process.argv[2], 10);
  
  if (!taskId || isNaN(taskId)) {
    console.error(JSON.stringify({ error: "Valid Task ID required" }));
    process.exit(1);
  }

  try {
    const config = loadConfig();
    const client = new TeamworkClient(config);
    
    // Use v1 API as the client is configured for
    const response = await client.getTask({ taskId });
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

main();
