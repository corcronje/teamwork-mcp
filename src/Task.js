/**
 * Task class for simplified task creation in Teamwork MCP
 * Provides a clean object-oriented interface for task properties
 * Handles date formatting, validation, and time entry creation
 */
export class Task {
  constructor(projectId) {
    this.projectId = projectId;
    this.title = null;
    this.description = null;
    this.assigneeUserId = null;
    this.priority = null;
    this.dueDate = null; // Date object or 'YYYY-MM-DD' string
    this.stageId = null;
    this.workflowId = null;
    this.taskListId = null;
    this.notifyUserIds = [];
    this.id = null; // Set after task creation
    this.timeEntries = [];
    this.pendingComments = []; // Comments to add after task creation
  }

  /**
   * Format date to YYYY-MM-DD string
   * @param {Date|string} date - Date object or date string in YYYY-MM-DD format
   * @returns {string} Date in YYYY-MM-DD format
   * @throws {Error} If date format is invalid
   */
  static formatDate(date) {
    if (!date) return null;

    if (date instanceof Date) {
      // Handle Date objects
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    if (typeof date === 'string') {
      // Validate YYYY-MM-DD format strictly
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.test(date);
      if (!isoMatch) {
        throw new Error(`Invalid date format: "${date}". Must be YYYY-MM-DD or a Date object.`);
      }

      // Validate the date values are in range
      const [, year, month, day] = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      const d = parseInt(day, 10);

      if (m < 1 || m > 12 || d < 1 || d > 31) {
        throw new Error(`Invalid date values in "${date}": month must be 01-12, day must be 01-31`);
      }

      // Verify it's a valid date
      const testDate = new Date(`${year}-${month}-${day}T00:00:00Z`);
      if (isNaN(testDate.getTime())) {
        throw new Error(`Invalid date: "${date}" is not a valid date`);
      }

      return date; // Already in correct format
    }

    throw new Error(`Invalid date type: ${typeof date}. Use Date object or 'YYYY-MM-DD' string.`);
  }

  /**
   * Format time to HH:MM string
   * @param {string|Date} time - Time string 'HH:MM' or Date object
   * @returns {string} Time in HH:MM format
   */
  static formatTime(time) {
    if (!time) return null;

    if (typeof time === 'string') {
      if (/^\d{2}:\d{2}$/.test(time)) {
        return time; // Already in correct format
      }
    }

    if (time instanceof Date) {
      const hours = String(time.getHours()).padStart(2, '0');
      const minutes = String(time.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    throw new Error(`Invalid time format: ${time}. Use 'HH:MM' string or Date object.`);
  }

  /**
   * Convert task to MCP create parameters
   */
  toParams() {
    const params = {
      projectId: this.projectId,
      title: this.title,
    };

    if (this.description !== null && this.description !== undefined) {
      params.description = this.description;
    }
    if (this.assigneeUserId !== null && this.assigneeUserId !== undefined) {
      params.assigneeUserId = this.assigneeUserId;
    }
    if (this.priority !== null && this.priority !== undefined) {
      params.priority = this.priority;
    }
    if (this.dueDate !== null && this.dueDate !== undefined) {
      params.dueDate = Task.formatDate(this.dueDate);
    }
    if (this.stageId !== null && this.stageId !== undefined) {
      params.stageId = this.stageId;
    }
    if (this.workflowId !== null && this.workflowId !== undefined) {
      params.workflowId = this.workflowId;
    }
    if (this.taskListId !== null && this.taskListId !== undefined) {
      params.taskListId = this.taskListId;
    }
    if (this.notifyUserIds && this.notifyUserIds.length > 0) {
      params.notifyUserIds = this.notifyUserIds;
    }

    return params;
  }

  /**
   * Add a time entry to this task
   * @param {Object} entry - Time entry details
   * @param {string} entry.date - Date in 'YYYY-MM-DD' format or Date object
   * @param {string} entry.time - Time in 'HH:MM' format or Date object (optional)
   * @param {number} entry.hours - Hours spent (optional, default 0)
   * @param {number} entry.minutes - Minutes spent (optional, default 0)
   * @param {string} entry.description - Work description (optional)
   * @param {boolean} entry.billable - Whether time is billable (optional, default false)
   * @param {number} entry.personId - User ID for time entry (optional)
   */
  addTimeEntry(entry) {
    if (!entry.date) {
      throw new Error("Time entry requires 'date' field");
    }

    const timeEntry = {
      date: Task.formatDate(entry.date),
      description: entry.description || '',
      hours: entry.hours || 0,
      minutes: entry.minutes || 0,
      isbillable: entry.billable || false,
    };

    if (entry.time) {
      timeEntry.time = Task.formatTime(entry.time);
    }
    if (entry.personId) {
      timeEntry.personId = entry.personId;
    }

    this.timeEntries.push(timeEntry);
    return this;
  }

  /**
   * Convert time entries to MCP parameters
   */
  getTimeEntryParams() {
    if (!this.id) {
      throw new Error("Task must be created (have an ID) before adding time entries");
    }

    return this.timeEntries.map(entry => ({
      taskId: this.id,
      date: entry.date,
      time: entry.time || undefined,
      hours: entry.hours,
      minutes: entry.minutes,
      description: entry.description,
      isbillable: entry.isbillable,
      personId: entry.personId || undefined,
    }));
  }

  /**
   * Add a comment to the task (will be added after task creation)
   * @param {string} body - Comment text (supports markdown)
   * @returns {Task} Returns this for method chaining
   */
  addComment(body) {
    if (!body || typeof body !== 'string') {
      throw new Error('Comment body must be a non-empty string');
    }
    this.pendingComments.push(body);
    return this;
  }

  /**
   * Get pending comments to add after task creation
   * @returns {array} Array of comment bodies
   */
  getPendingComments() {
    return this.pendingComments;
  }

  /**
   * Clear pending comments
   */
  clearPendingComments() {
    this.pendingComments = [];
  }

  /**
   * Validate task has required fields
   */
  validate() {
    const errors = [];
    if (!this.projectId) {
      errors.push("projectId is required");
    }
    if (!this.title) {
      errors.push("title is required");
    }
    if (errors.length > 0) {
      throw new Error(`Task validation failed: ${errors.join(", ")}`);
    }
  }
}

/**
 * Priority constants for Teamwork
 */
export const TaskPriority = {
  HIGHEST: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
  LOWEST: 0,
};

export default Task;
