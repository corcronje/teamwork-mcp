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
    name: "ISO 8601 datetime",
    body: {
      time_entry: {
        logged_date: "2026-07-03T15:25:00Z",
        taskid: "48034474",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "ISO 8601 date only (but in time_entry)",
    body: {
      time_entry: {
        logged_date: "2026-07-03",
        taskid: "48034474",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "DateTime from Teamwork (2026-07-03 15:25:00)",
    body: {
      time_entry: {
        logged_date: "2026-07-03 15:25:00",
        taskid: "48034474",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "loggedDatetime",
    body: {
      time_entry: {
        loggedDatetime: "2026-07-03T15:25:00",
        taskid: "48034474",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "Using date in main body",
    body: {
      logged_date: "2026-07-03",
      taskid: "48034474",
      hours: 1,
      minutes: 41
    }
  },
  {
    name: "GET task first to see response structure",
    method: "GET"
  }
];

async function testFormat(format) {
  const url = format.method === "GET"
    ? `${baseUrl}/projects/api/v1/tasks/48034474.json`
    : `${baseUrl}/projects/api/v1/tasks/48034474/time_entries.json`;

  try {
    const response = await fetch(url, {
      method: format.method || 'POST',
      headers: {
        'Authorization': `Basic ${encoded}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: format.method === "GET" ? undefined : JSON.stringify(format.body)
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = text.substring(0, 200);
    }

    const status = response.status;
    const icon = status === 200 || status === 201 ? "✅" : status < 400 ? "ℹ️" : "⚠️";
    console.log(`${icon} ${format.name || format.method} - Status: ${status}`);

    if (status === 200 || status === 201) {
      console.log(`   SUCCESS!`);
      if (typeof result === 'object') {
        console.log(JSON.stringify(result, null, 2).substring(0, 500));
      }
    } else if (status < 400) {
      console.log(`   Info: ${JSON.stringify(result).substring(0, 300)}`);
    } else {
      const msg = result?.STATUS ? result.MESSAGE : (result?.content?.message || result?.message || JSON.stringify(result).substring(0, 150));
      console.log(`   Error: ${msg}`);
    }
  } catch (error) {
    console.log(`❌ ${format.name} - ${error.message}`);
  }
}

async function runTests() {
  console.log('Testing datetime formats...\n');

  for (const format of formats) {
    await testFormat(format);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

runTests();
