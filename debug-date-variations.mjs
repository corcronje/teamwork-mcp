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
    name: "date in wrapper (with underscores)",
    body: {
      time_entry: {
        task_id: "48034474",
        date: "2026-07-03",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "No taskid, just date/hours/minutes",
    body: {
      time_entry: {
        date: "2026-07-03",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "loggedDate with underscore wrapper",
    body: {
      time_entry: {
        loggedDate: "2026-07-03",
        task_id: "48034474",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "Trying entry_date",
    body: {
      time_entry: {
        entry_date: "2026-07-03",
        taskid: "48034474",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "Direct structure (no wrapper)",
    body: {
      logged_date: "2026-07-03",
      task_id: "48034474",
      hours: 1,
      minutes: 41
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
  console.log('Testing different date field variations...\n');

  for (const format of formats) {
    await testFormat(format);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

runTests();
