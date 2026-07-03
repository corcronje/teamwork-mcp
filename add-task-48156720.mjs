import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

const config = loadConfig();
const client = new TeamworkClient(config);

const taskId = '48156720';

// Comment text
const commentBody = `## Fix Complete: Map List View Completion Percentages

### Issue Resolved
Fixed the discrepancy in completion percentages displayed between the map list view and the dashboard view when filtering for centers.

### Root Cause
The map endpoint (\`/entity/list/map\`) and dashboard endpoint (\`/entity/user/search\`) were not handling the \`percentage_complete\` field consistently:
- Data type inconsistencies (string vs number)
- Potential formatting differences between endpoints

### Solution Implemented

**Backend Changes (api.ctc.africa):**
- Modified \`MapController.php\` to explicitly cast \`percentage_complete\` to float
- Ensures default value of 0.0 if not set
- Guarantees consistent numeric data types across API responses

**Frontend Changes (ctc.africa):**
- Enhanced \`EntityService.js\` in \`loadEntitiesForMap()\` method
- Normalizes all \`percentage_complete\` values to numbers
- Provides fallback to 0 if value is missing

### Commits
- Frontend: b7e7df4 - Ensure map entities percentage_complete is properly formatted
- Backend: 3a976e7 - Ensure MapController returns percentage_complete as float consistently

### Testing Recommendations
1. Navigate to \`/map\`
2. Switch to list view
3. Filter for centers
4. Compare percentages with \`/dashboard\` view
5. Verify percentages now match between both views

Both changes have been committed to the task branch: \`CC/48156720/fix-map-list-view-completion-percentages\``;

// Time entry for today, 2 hours from 8 AM
const today = new Date();
const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format

try {
  console.log('Adding comment to task', taskId);
  const commentResult = await client.addTaskComment({
    taskId,
    body: commentBody
  });
  console.log('✓ Success! Comment added to task', taskId);
  console.log('Comment ID:', commentResult.id);

  console.log('\nAdding time entry to task', taskId);
  const timeEntryResult = await client.addTaskTimeEntry({
    taskId,
    date: dateStr,
    time: '08:00:00',
    hours: 2,
    minutes: 0,
    isbillable: false,
    description: 'Fix map list view completion percentages issue'
  });
  console.log('✓ Success! Time entry added to task', taskId);
  console.log('Time Entry Response:', JSON.stringify(timeEntryResult, null, 2));

} catch (error) {
  console.error('Error:', error.message);
  if (error.response?.data) {
    console.error('Response:', JSON.stringify(error.response.data, null, 2));
  }
  process.exit(1);
}
