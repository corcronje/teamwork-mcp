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
    name: "All hyphenated: logged-date, task-id, etc",
    body: {
      "time-entry": {
        "logged-date": "2026-07-03",
        "task-id": taskId,
        "hours": 1,
        "minutes": 41
      }
    }
  },
  {
    name: "Hyphenated with description",
    body: {
      "time-entry": {
        "logged-date": "2026-07-03",
        "task-id": taskId,
        "hours": 1,
        "minutes": 41,
        "description": "Test time entry"
      }
    }
  },
  {
    name: "Hyphenated with user-id",
    body: {
      "time-entry": {
        "logged-date": "2026-07-03",
        "task-id": taskId,
        "hours": 1,
        "minutes": 41,
        "user-id": "108693"
      }
    }
  },
  {
    name: "Top-level hyphenated fields",
    body: {
      "logged-date": "2026-07-03",
      "task-id": taskId,
      "hours": 1,
      "minutes": 41
    }
  },
  {
    name: "Minimal hyphenated",
    body: {
      "time-entry": {
        "logged-date": "2026-07-03",
        "task-id": taskId
      }
    }
  }
];

async function testFormat(format) {
  const url = `${baseUrl}/projects/api/v1/projects/${projectId}/time_entries.json`;

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
    const icon = status === 200 || status === 201 ? "✅" : "⚠️";
    console.log(`${icon} ${format.name}`);
    console.log(`   Status: ${status}`);

    if (status === 200 || status === 201) {
      console.log(`   ✅ SUCCESS!`);
      console.log(`   Result: ${JSON.stringify(result, null, 2).substring(0, 400)}`);
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
  console.log(`Testing hyphenated field names...\n`);

  for (const format of formats) {
    await testFormat(format);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

runTests();
