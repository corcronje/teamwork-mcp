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

const formats = [
  {
    name: "logged_date",
    body: {
      "time_entry": {
        taskid: "48034474",
        logged_date: "2026-07-03",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "loggedDate",
    body: {
      "time_entry": {
        taskid: "48034474",
        loggedDate: "2026-07-03",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "time_entry wrapper with logged_date",
    body: {
      time_entry: {
        taskid: "48034474",
        logged_date: "2026-07-03",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "With description and userid",
    body: {
      time_entry: {
        taskid: "48034474",
        logged_date: "2026-07-03",
        hours: 1,
        minutes: 41,
        description: "Test time entry",
        userid: "108693"
      }
    }
  },
  {
    name: "With time (HH:MM)",
    body: {
      time_entry: {
        taskid: "48034474",
        logged_date: "2026-07-03",
        time: "15:25",
        hours: 1,
        minutes: 41,
        description: "Test time entry"
      }
    }
  }
];

async function testFormat(format) {
  const url = `${baseUrl}/projects/api/v1/tasks/48034474/time_entries.json`;

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
      result = text;
    }

    const status = response.status;
    const icon = status === 200 || status === 201 ? "✅" : "⚠️";
    console.log(`${icon} ${format.name} - Status: ${status}`);

    if (status === 200 || status === 201) {
      console.log(`   SUCCESS!`);
      console.log(JSON.stringify(result, null, 2));
    } else {
      const msg = result?.STATUS ? result.MESSAGE : (result?.content?.message || JSON.stringify(result));
      console.log(`   Error: ${msg}`);
    }
  } catch (error) {
    console.log(`❌ ${format.name} - ${error.message}`);
  }
}

async function runTests() {
  console.log('Testing different logged_date field names...\n');

  for (const format of formats) {
    await testFormat(format);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

runTests();
