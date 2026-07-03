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

const testFormats = [
  {
    name: "time-entry wrapper",
    body: { "time-entry": { taskid: "48034474", date: "2026-07-03", hours: 1, minutes: 41 } }
  },
  {
    name: "No wrapper (direct fields)",
    body: { taskid: "48034474", date: "2026-07-03", hours: 1, minutes: 41 }
  },
  {
    name: "task_id snake case",
    body: { timelog: { task_id: "48034474", date: "2026-07-03", hours: 1, minutes: 41 } }
  },
  {
    name: "taskId camelCase",
    body: { timelog: { taskId: "48034474", date: "2026-07-03", hours: 1, minutes: 41 } }
  },
  {
    name: "With time (HH:MM)",
    body: { timelog: { taskid: "48034474", date: "2026-07-03", time: "15:25", hours: 1, minutes: 41 } }
  },
  {
    name: "With userId",
    body: { timelog: { taskid: "48034474", date: "2026-07-03", time: "15:25", hours: 1, minutes: 41, userid: "108693" } }
  }
];

async function testFormat(format) {
  const url = `${baseUrl}/projects/api/v1/timelogs.json`;

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

    console.log(`\n✓ Format: ${format.name}`);
    console.log(`  Status: ${response.status}`);
    console.log(`  Body: ${JSON.stringify(format.body)}`);
    if (response.status >= 400) {
      console.log(`  Error: ${JSON.stringify(result)}`);
    } else {
      console.log(`  ✅ SUCCESS: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.log(`✗ Format: ${format.name} - ${error.message}`);
  }
}

async function runTests() {
  console.log('Testing different timelog format...\n');

  for (const format of testFormats) {
    await testFormat(format);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

runTests();
