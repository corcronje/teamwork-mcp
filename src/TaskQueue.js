/**
 * TaskQueue - helpers for prioritising and grouping task lists client-side.
 *
 * Works with both raw Teamwork v3 task objects and the compact summaries that
 * the list tools / TeamworkClient return (detail: "summary"). Earlier versions
 * read v1 field names ("due-date", "responsible-party-id", "stage-id") that v3
 * payloads do not contain, so they silently returned empty results.
 */

const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };

function priorityRank(task) {
  const p = task?.priority;
  if (typeof p === "number") return p; // tolerate legacy numeric data
  return PRIORITY_RANK[String(p ?? "").toLowerCase()] ?? 0;
}

function dueDate(task) {
  const raw = task?.dueDate ?? task?.["due-date"];
  if (!raw) return null;
  const d = new Date(/^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function assigneeIds(task) {
  if (Array.isArray(task?.assigneeUserIds)) return task.assigneeUserIds.map(String);
  if (Array.isArray(task?.assignees)) return task.assignees.map((a) => String(a.id ?? a));
  const legacy = task?.["responsible-party-id"];
  return legacy ? String(legacy).split(",") : [];
}

function stageKey(task) {
  const ws = task?.workflowStages?.[0];
  if (ws) return ws.stageName ?? (ws.stageId ? String(ws.stageId) : "backlog");
  return task?.["stage-id"] ?? task?.stageId ?? "unknown";
}

export class TaskQueue {
  /** Highest priority first; ties broken by nearest due date (undated last). */
  static sortByPriority(tasks) {
    if (!Array.isArray(tasks)) return [];
    return [...tasks].sort((a, b) => {
      const diff = priorityRank(b) - priorityRank(a);
      if (diff) return diff;
      const da = dueDate(a);
      const db = dueDate(b);
      if (da && db) return da - db;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });
  }

  /** Group by workflow stage (stage name when available, else stage id). */
  static groupByStage(tasks) {
    if (!Array.isArray(tasks)) return {};
    const grouped = {};
    for (const task of tasks) (grouped[stageKey(task)] ||= []).push(task);
    return grouped;
  }

  static filterByAssignee(tasks, userId) {
    if (!Array.isArray(tasks)) return [];
    return tasks.filter((t) => assigneeIds(t).includes(String(userId)));
  }

  static filterByStatus(tasks, status) {
    if (!Array.isArray(tasks)) return [];
    return tasks.filter((t) => (t.status ?? t.currentStatus) === status);
  }

  /** Tasks due between now and N days from now. */
  static filterByDueDate(tasks, daysFromNow = 7) {
    if (!Array.isArray(tasks)) return [];
    const now = new Date();
    const until = new Date(now.getTime() + daysFromNow * 86400000);
    return tasks.filter((t) => {
      const d = dueDate(t);
      return d && d >= now && d <= until;
    });
  }

  static filterWithoutDueDate(tasks) {
    if (!Array.isArray(tasks)) return [];
    return tasks.filter((t) => !dueDate(t));
  }

  /**
   * urgent: high priority or overdue; dueSoon: due within 7 days;
   * undue: due later; noDueDate: no due date.
   */
  static buildPriorityQueue(tasks) {
    const queue = { urgent: [], dueSoon: [], undue: [], noDueDate: [] };
    if (!Array.isArray(tasks)) return queue;
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 86400000);
    for (const task of tasks) {
      const d = dueDate(task);
      if (!d) queue.noDueDate.push(task);
      else if (priorityRank(task) >= 3 || d < now) queue.urgent.push(task);
      else if (d <= weekFromNow) queue.dueSoon.push(task);
      else queue.undue.push(task);
    }
    for (const key of Object.keys(queue)) queue[key] = TaskQueue.sortByPriority(queue[key]);
    return queue;
  }

  static summarize(tasks, limit = 10) {
    if (!Array.isArray(tasks) || tasks.length === 0) return "No tasks";
    const sorted = TaskQueue.sortByPriority(tasks).slice(0, limit);
    const lines = [`Total: ${tasks.length} tasks${limit < tasks.length ? ` (showing first ${limit})` : ""}`, ""];
    sorted.forEach((task, i) => {
      const p = ["-", "L", "M", "H"][priorityRank(task)] ?? "-";
      const d = dueDate(task);
      lines.push(`  ${i + 1}. [${p}] [${task.id}] ${task.name || task.title || "Untitled"}${d ? ` (due: ${d.toISOString().slice(0, 10)})` : ""}`);
    });
    return lines.join("\n");
  }
}

export default TaskQueue;
