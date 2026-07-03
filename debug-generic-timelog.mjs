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
    name: "POST to /timelogs.json (generic endpoint)",
    url: "/projects/api/v1/timelogs.json",
    body: {
      time_entry: {
        logged_date: "2026-07-03",
        taskid: "48034474",
        hours: 1,
        minutes: 41,
        description: "Test time entry"
      }
    }
  },
  {
    name: "POST to /timelogs.json (with iso datetime)",
    url: "/projects/api/v1/timelogs.json",
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
    name: "POST to /timelog.json (singular)",
    url: "/projects/api/v1/timelog.json",
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
    name: "POST to /activities.json",
    url: "/projects/api/v1/activities.json",
    body: {
      activity: {
        logged_date: "2026-07-03",
        taskid: "48034474",
        hours: 1,
        minutes: 41
      }
    }
  },
  {
    name: "POST time_log (singular wrapper)",
    url: "/projects/api/v1/timelogs.json",
    body: {
      time_log: {
        logged_date: "2026-07-03",
        taskid: "48034474",
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
    const icon = status === 200 || status === 201 ? "✅" : "⚠️";
    console.log(`${icon} ${format.name} - Status: ${status}`);

    if (status === 200 || status === 201) {
      console.log(`   SUCCESS!`);
      console.log(JSON.stringify(result, null, 2).substring(0, 400));
    } else {
      if (typeof result === 'string') {
        console.log(`   Error: ${result}`);
      } else {
        const msg = result?.STATUS ? result.MESSAGE : (result?.content?.message || result?.message || JSON.stringify(result).substring(0, 150));
        console.log(`   Error: ${msg}`);
      }
    }
  } catch (error) {
    console.log(`❌ ${format.name} - ${error.message}`);
  }
}

async function runTests() {
  console.log('Testing generic timelog endpoints...\n');

  for (const format of formats) {
    await testFormat(format);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

runTests();
