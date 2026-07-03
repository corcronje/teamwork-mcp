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

const payload = {
  timelog: {
    taskid: "48034474",
    date: "2026-07-03",
    hours: 1,
    minutes: 41
  }
};

const endpoints = [
  "/projects/api/v1/timelogs.json",
  "/projects/api/v1/tasks/48034474/timelogs.json",
  "/projects/api/v1/tasks/48034474/time_entries.json",
  "/projects/api/v1/tasks/48034474/timeentries.json",
  "/projects/api/v1/time_entries.json",
  "/projects/api/v1/time-entries.json",
  "/projects/api/v1/times.json",
  "/projects/api/v1/timers.json"
];

async function testEndpoint(endpoint) {
  const url = `${baseUrl}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encoded}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = text;
    }

    const status = response.status;
    const icon = status === 201 || status === 200 ? "✅" : status === 404 ? "❌" : "⚠️";
    console.log(`${icon} ${endpoint} - Status: ${status}`);

    if (status === 201 || status === 200) {
      console.log(`   SUCCESS: ${JSON.stringify(result)}`);
    } else if (status === 404) {
      // Skip 404s, they're expected for wrong paths
    } else {
      const msg = result?.content?.message || result?.error || JSON.stringify(result);
      console.log(`   Error: ${msg}`);
    }
  } catch (error) {
    console.log(`❌ ${endpoint} - ${error.message}`);
  }
}

async function runTests() {
  console.log('Testing different timelog endpoints...\n');

  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

runTests();
