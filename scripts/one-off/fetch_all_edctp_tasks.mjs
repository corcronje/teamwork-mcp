// HISTORICAL ONE-OFF SCRIPT - not part of the reusable MCP server and not maintained.
// It was written for a single task on one Teamwork site and contains hardcoded
// project/task/user/stage IDs for that site. Kept only as a record; do not use it
// as a usage example. Use the MCP tools (see README) or src/teamworkClient.js.
import { TeamworkClient } from '../../src/teamworkClient.js';
import { loadConfig } from '../../src/config.js';

const config = loadConfig();
const client = new TeamworkClient(config);

// EDCTP workflow stages
const EDCTP_WORKFLOW_ID = 43645;
const EDCTP_STAGES = {
  selected: 183115,
  in_progress: 183117,
  qa_ready: 183120,
};

try {
  // Get all pages of my tasks
  console.error('Fetching all pages of tasks assigned to me...');
  let allTasks = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore && page <= 10) {
    const response = await client.getMyTasks({ page, pageSize: 200, includeCompleted: false });
    const tasks = Array.isArray(response) ? response : response.tasks || [];
    
    if (!tasks || tasks.length === 0) {
      hasMore = false;
      break;
    }
    
    allTasks = allTasks.concat(tasks);
    console.error(`Page ${page}: got ${tasks.length} tasks, total so far: ${allTasks.length}`);
    
    if (tasks.length < 200) {
      hasMore = false;
    }
    page++;
  }
  
  console.error(`Total tasks found: ${allTasks.length}`);
  
  // Filter for EDCTP v4 project tasks that are in selected or in_progress stages
  const edctpTasks = allTasks.filter(task => {
    // Check if task has workflow stages
    if (!task.workflowStages || !Array.isArray(task.workflowStages)) {
      return false;
    }
    
    // Find if this task is in EDCTP workflow and in one of our target stages
    const edctpStage = task.workflowStages.find(ws => ws.workflowId === EDCTP_WORKFLOW_ID);
    if (!edctpStage) {
      return false;
    }
    
    // Check if it's in selected or in_progress stage
    const isTargetStage = edctpStage.stageId === EDCTP_STAGES.selected || 
                          edctpStage.stageId === EDCTP_STAGES.in_progress;
    
    return isTargetStage;
  });
  
  console.error(`Found ${edctpTasks.length} EDCTP v4 tasks in selected/in_progress stages assigned to me`);
  
  // Determine stage for each task
  const tasksWithStage = edctpTasks.map(task => {
    const edctpStage = task.workflowStages.find(ws => ws.workflowId === EDCTP_WORKFLOW_ID);
    let stageName = 'unknown';
    if (edctpStage.stageId === EDCTP_STAGES.selected) {
      stageName = 'selected';
    } else if (edctpStage.stageId === EDCTP_STAGES.in_progress) {
      stageName = 'in_progress';
    }
    
    return {
      id: task.id,
      title: task.name || task.content,
      description: task.description,
      priority: task.priority,
      stage: stageName,
      dueDate: task.dueDate,
      status: task.status,
      updatedAt: task.updatedAt
    };
  });
  
  // Sort by stage (in_progress first, then selected), then by priority
  tasksWithStage.sort((a, b) => {
    // Sort in_progress before selected
    const stageOrder = { 'in_progress': 0, 'selected': 1 };
    const stageDiff = (stageOrder[a.stage] ?? 2) - (stageOrder[b.stage] ?? 2);
    if (stageDiff !== 0) return stageDiff;
    
    // Then by priority (lower numbers = higher priority)
    const aPrio = a.priority ?? 999;
    const bPrio = b.priority ?? 999;
    return aPrio - bPrio;
  });
  
  // Output as JSON
  console.log(JSON.stringify(tasksWithStage, null, 2));
} catch (err) {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
}
