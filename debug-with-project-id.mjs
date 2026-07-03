import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envContent = readFileSync(resolve(__dirname, '.env'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    env[key.trim()] = value.trim();
  }
});

const baseUrl = env.TEAMWORK_BASE_URL;
const token = env.TEAMWORK_API_TOKEN;
const encoded = Buffer.from(`${token}:x`).toString("base64");

const projectId = "1216946";
const taskId = "48034474";

const formats = [
  {
    name: "With project ID in path: /projects/{projectId}/tasks/{taskId}/time_entries.json",
    url: `/projects/api/v1/projects/${projectId}/tasks/${taskId}/time_entries.json`,
    body: {
      time_entry: {
        logged_date: "2026-07-03",
        hours: 1,
        minutes: 41,
        description: "Test time entry"
      }
    }
  },
  {
    name: "With project ID: /projects/{projectId}/time_entries.json",
    url: `/projects/api/v1/projects/${projectId}/time_entries.json`,
    body: {
      time_entry: {
        logged_date: "2026-07-03",
        taskid: taskId,
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "With project ID and hyphenated: /projects/{projectId}/time-entries.json",
    url: `/projects/api/v1/projects/${projectId}/time-entries.json`,
    body: {
      time_entry: {
        logged_date: "2026-07-03",
        taskid: taskId,
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "Original endpoint but with task ID as field",
    url: `/projects/api/v1/time_entries.json`,
    body: {
      time_entry: {
        logged_date: "2026-07-03",
        task_id: taskId,
        hours: 1,
        minutes: 41
      }
    }
  }
];

async function testFormat(format) {
  const url = `${baseUrl}${format.url}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encoded}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(format.body)
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = text.substring(0, 300);
    }

    const status = response.status;
    const icon = status === 200 || status === 201 ? "✅" : status === 404 ? "❌" : "⚠️";
    console.log(`${icon} ${format.name.substring(0, 80)}`);
    console.log(`   URL: ${format.url}`);
    console.log(`   Status: ${status}`);

    if (status === 200 || status === 201) {
      console.log(`   ✅ SUCCESS!`);
      console.log(JSON.stringify(result, null, 2).substring(0, 300));
    } else if (status === 404) {
      // Suppress 404s
    } else {
      if (typeof result === 'string') {
        console.log(`   Error: ${result}`);
      } else {
        const msg = result?.STATUS ? result.MESSAGE : (result?.content?.message || result?.message || JSON.stringify(result).substring(0, 120));
        console.log(`   Error: ${msg}`);
      }
    }
  } catch (error) {
    console.log(`❌ ${format.name} - ${error.message}`);
  }
}

async function runTests() {
  console.log('Testing with project ID...\n');

  for (const format of formats) {
    await testFormat(format);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

runTests();
