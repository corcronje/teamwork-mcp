import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

const config = loadConfig();
const client = new TeamworkClient(config);

const taskId = '48090178';
const commentBody = `Removed the "Find fellows" links and horizontal divider lines from all six disease area cards (HIV, Tuberculosis, Malaria, NIDs, Emerging Infections, and DDs & LRTIs) on the About Us page.

Only the card content (icon and title) now remain. Changes have been committed and merged to v4_dev and v4_stage branches.

More work still needed on this task.`;

try {
  const result = await client.addTaskComment({ taskId, body: commentBody });
  console.log('Success! Comment added to task', taskId);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error adding comment:', error.message);
  process.exit(1);
}
