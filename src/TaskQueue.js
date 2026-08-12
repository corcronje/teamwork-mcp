/**
 * TaskQueue - Helper class for task prioritization and lane management
 * Provides methods to work with task queues by priority, stage, and assignment
 */

export class TaskQueue {
  /**
   * Sort tasks by priority and due date
   * @param {array} tasks - Array of task objects
   * @returns {array} Sorted tasks (highest priority first, closest due date first)
   */
  static sortByPriority(tasks) {
    if (!Array.isArray(tasks)) return [];

    return [...tasks].sort((a, b) => {
      // Sort by priority descending (higher number = higher priority)
      const aPriority = a.priority || 0;
      const bPriority = b.priority || 0;

      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }

      // If same priority, sort by due date (closest first)
      const aDueDate = a['due-date'] ? new Date(a['due-date']) : null;
      const bDueDate = b['due-date'] ? new Date(b['due-date']) : null;

      if (aDueDate && bDueDate) {
        return aDueDate.getTime() - bDueDate.getTime();
      }

      if (aDueDate) return -1; // a has due date, comes first
      if (bDueDate) return 1;  // b has due date, comes first

      return 0;
    });
  }

  /**
   * Group tasks by workflow stage (lane)
   * @param {array} tasks - Array of task objects
   * @returns {object} Object with stage IDs as keys, task arrays as values
   */
  static groupByStage(tasks) {
    if (!Array.isArray(tasks)) return {};

    const grouped = {};

    tasks.forEach(task => {
      // Try different possible stage ID fields
      const stageId = task['stage-id'] ||
                      task.stageId ||
                      task['workflow-stage-id'] ||
                      task['status'] ||
                      'unknown';

      if (!grouped[stageId]) {
        grouped[stageId] = [];
      }
      grouped[stageId].push(task);
    });

    return grouped;
  }

  /**
   * Filter tasks by assignee
   * @param {array} tasks - Array of task objects
   * @param {string|number} userId - User ID to filter by
   * @returns {array} Tasks assigned to the user
   */
  static filterByAssignee(tasks, userId) {
    if (!Array.isArray(tasks)) return [];

    return tasks.filter(task => {
      const assignedTo = task['responsible-party-id'] ||
                        task['assigned-to-id'] ||
                        task.assigneeUserId;
      return String(assignedTo) === String(userId);
    });
  }

  /**
   * Filter tasks by status
   * @param {array} tasks - Array of task objects
   * @param {string} status - Status to filter by (e.g., 'new', 'in-progress', 'completed')
   * @returns {array} Tasks with matching status
   */
  static filterByStatus(tasks, status) {
    if (!Array.isArray(tasks)) return [];

    return tasks.filter(task => {
      const taskStatus = task.status || task.currentStatus;
      return taskStatus === status;
    });
  }

  /**
   * Get tasks due within N days
   * @param {array} tasks - Array of task objects
   * @param {number} daysFromNow - Number of days to look ahead
   * @returns {array} Tasks due within the timeframe
   */
  static filterByDueDate(tasks, daysFromNow = 7) {
    if (!Array.isArray(tasks)) return [];

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysFromNow);

    return tasks.filter(task => {
      if (!task['due-date']) return false;

      const dueDate = new Date(task['due-date']);
      return dueDate >= now && dueDate <= futureDate;
    });
  }

  /**
   * Get tasks without a due date
   * @param {array} tasks - Array of task objects
   * @returns {array} Tasks without due dates
   */
  static filterWithoutDueDate(tasks) {
    if (!Array.isArray(tasks)) return [];

    return tasks.filter(task => !task['due-date']);
  }

  /**
   * Build a priority queue: urgent + due soon + undue
   * @param {array} tasks - Array of task objects
   * @returns {object} Organized queue with urgency levels
   */
  static buildPriorityQueue(tasks) {
    if (!Array.isArray(tasks)) {
      return { urgent: [], dueSoon: [], undue: [], noDueDate: [] };
    }

    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const queue = {
      urgent: [],      // High priority OR overdue
      dueSoon: [],     // Due within 7 days
      undue: [],       // Low priority, not due soon
      noDueDate: []    // No due date set
    };

    tasks.forEach(task => {
      const priority = task.priority || 0;
      const dueDate = task['due-date'] ? new Date(task['due-date']) : null;

      if (!dueDate) {
        queue.noDueDate.push(task);
      } else if (priority >= 3 || dueDate < now) {
        // High priority or overdue
        queue.urgent.push(task);
      } else if (dueDate <= weekFromNow) {
        // Due within 7 days
        queue.dueSoon.push(task);
      } else {
        // Lower priority, due later
        queue.undue.push(task);
      }
    });

    // Sort each queue by priority and due date
    Object.keys(queue).forEach(key => {
      queue[key] = TaskQueue.sortByPriority(queue[key]);
    });

    return queue;
  }

  /**
   * Get readable summary of tasks
   * @param {array} tasks - Array of task objects
   * @param {number} limit - Maximum tasks to show
   * @returns {string} Formatted summary
   */
  static summarize(tasks, limit = 10) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return 'No tasks';
    }

    const sorted = TaskQueue.sortByPriority(tasks);
    const toShow = sorted.slice(0, limit);

    const lines = [
      `Total: ${tasks.length} tasks${limit < tasks.length ? ` (showing first ${limit})` : ''}`,
      ''
    ];

    toShow.forEach((task, i) => {
      const priority = task.priority || 0;
      const priorityStr = ['⬜', '🟨', '🟡', '🟠', '🔴'][priority] || '⬜';
      const name = task.name || task.title || 'Untitled';
      const dueDate = task['due-date'] ? ` (due: ${task['due-date']})` : '';
      lines.push(`  ${i + 1}. ${priorityStr} [${task.id}] ${name}${dueDate}`);
    });

    return lines.join('\n');
  }
}

export default TaskQueue;
