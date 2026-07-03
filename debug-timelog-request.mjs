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

// Construct the API URL for v1 timelogs endpoint
const url = `${baseUrl}/projects/api/v1/timelogs.json`;

const payload = {
  timelog: {
    taskid: "48034474",
    date: "2026-07-03",
    hours: 1,
    minutes: 41,
    description: "Test time entry"
  }
};

console.log('🔍 Debug: Teamwork Time Entry Request');
console.log('=====================================');
console.log(`URL: ${url}`);
console.log(`Token: ${token.substring(0, 10)}...`);
console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);
console.log('');

const encoded = Buffer.from(`${token}:x`).toString("base64");

fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${encoded}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  body: JSON.stringify(payload)
})
  .then(async (response) => {
    const text = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Headers:`);
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
    console.log(`\nResponse Body:`);
    console.log(text);

    if (text) {
      try {
        const json = JSON.parse(text);
        console.log(`\nParsed JSON:`);
        console.log(JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('(Not valid JSON)');
      }
    }
  })
  .catch(error => {
    console.error('❌ Request failed:', error.message);
  });
