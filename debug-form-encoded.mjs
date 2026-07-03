import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { URLSearchParams } from 'url';

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
    name: "Form-encoded: time_entry wrapper",
    contentType: "application/x-www-form-urlencoded",
    encode: () => {
      const params = new URLSearchParams();
      params.append("time_entry[logged_date]", "2026-07-03");
      params.append("time_entry[task_id]", taskId);
      params.append("time_entry[hours]", "1");
      params.append("time_entry[minutes]", "41");
      return params.toString();
    }
  },
  {
    name: "Form-encoded: direct fields",
    contentType: "application/x-www-form-urlencoded",
    encode: () => {
      const params = new URLSearchParams();
      params.append("logged_date", "2026-07-03");
      params.append("task_id", taskId);
      params.append("hours", "1");
      params.append("minutes", "41");
      return params.toString();
    }
  },
  {
    name: "XML format attempt",
    contentType: "application/xml",
    encode: () => {
      return `<?xml version="1.0" encoding="UTF-8"?>
<time_entry>
  <logged_date>2026-07-03</logged_date>
  <task_id>${taskId}</task_id>
  <hours>1</hours>
  <minutes>41</minutes>
</time_entry>`;
    }
  }
];

async function testFormat(format) {
  const url = `${baseUrl}/projects/api/v1/projects/${projectId}/time_entries.json`;

  try {
    const body = format.encode();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encoded}`,
        'Content-Type': format.contentType,
        'Accept': 'application/json'
      },
      body: body
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
    console.log(`   Content-Type: ${format.contentType}`);
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
  console.log(`Testing different content types...\n`);

  for (const format of formats) {
    await testFormat(format);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

runTests();
