import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

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

async function testTimelogFormats() {
  const taskId = '48034474';

  // Test different request body structures
  const formats = [
    {
      name: "Minimal (taskid, date, hours, minutes)",
      body: {
        timelog: {
          taskid: taskId,
          date: "2026-07-03",
          hours: 1,
          minutes: 41
        }
      }
    },
    {
      name: "With time field (HH:MM format)",
      body: {
        timelog: {
          taskid: taskId,
          date: "2026-07-03",
          time: "15:25",
          hours: 1,
          minutes: 41
        }
      }
    },
    {
      name: "With description",
      body: {
        timelog: {
          taskid: taskId,
          date: "2026-07-03",
          hours: 1,
          minutes: 41,
          description: "Test time entry"
        }
      }
    }
  ];

  for (const format of formats) {
    console.log(`\n📝 Testing format: ${format.name}`);
    console.log(`Body: ${JSON.stringify(format.body)}`);

    try {
      const result = await client.requestLegacy("POST", `/timelogs.json`, {
        body: format.body
      });
      console.log(`✅ Success!`);
      console.log(JSON.stringify(result, null, 2));
      return;
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
}

testTimelogFormats().catch(console.error);
