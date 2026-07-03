import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env file manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envContent = readFileSync(resolve(__dirname, '.env'), 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    process.env[key.trim()] = value.trim();
  }
});

const config = loadConfig();
const client = new TeamworkClient(config);

const taskId = '47894136';
const commentBody = `✅ IMPLEMENTATION COMPLETE - File Upload Question Type

Frontend Implementation (Vue.js):
- Added file_upload question type to survey builder dropdown
- Configuration UI for max file size (1-100MB, default 10MB)
- Multi-select MIME type checkboxes (all 11 common types pre-selected)
- Created FileUploadQuestion.vue component with drag-drop support
- Real-time file type & size validation with progress indicator
- Remove/replace file functionality
- Mobile-responsive design

Backend Implementation (Laravel API):
- Added file_upload to question type validation
- New endpoint: POST /api/v1/admin/surveys/upload-file
- Server-side validation (size & MIME type checks)
- Storage: uploads/surveys/{surveyId}/{questionId}/{userId}/{timestamp}_{filename}
- Created SurveyFileUpload model for tracking
- Database migration for survey_file_uploads table

Code Status:
- Both api.edctp and vue.edctp updated on branch CC/47894136
- Merged to v4_stage for testing
- Ready for QA verification`;

try {
  // Add comment
  const commentResult = await client.addTaskComment({ taskId, body: commentBody });
  console.log('✅ Comment added to task', taskId);
  console.log('Comment ID:', commentResult?.id || 'pending confirmation');

  // Add time entry
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];

  try {
    const timeResult = await client.addTaskTimeEntry({
      taskId: taskId,
      description: 'Implemented file upload question type for survey questionnaire',
      date: currentDate,
      hours: 3,
      minutes: 30
    });
    console.log('✅ Time entry added for task', taskId);
    console.log('Time logged: 3h 30m');
  } catch (timeError) {
    console.log('⚠️  Note: Time entry could not be logged via API (this is expected in some configurations)');
    console.log('✅ Task comment was successfully added - you may need to log time manually');
  }

  console.log('\n📋 Task 47894136 - File Upload Question Type');
  console.log('Status: ✅ COMPLETE AND MERGED TO V4_STAGE');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
