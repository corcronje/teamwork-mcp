/**
 * Live end-to-end suite against a REAL Teamwork site, driven through the actual
 * MCP stdio server (the same path Claude Code / VS Code / Copilot / Claude
 * Desktop use). Covers every required capability and cleans up after itself.
 *
 * Opt-in. Needs, in the environment or in <repo>/.env:
 *   TEAMWORK_BASE_URL, TEAMWORK_API_TOKEN (+ TEAMWORK_AUTH_MODE if not basic_token_x)
 *   TEAMWORK_TEST_PROJECT_ID   a project where a temporary task may be created
 * The spawned server is locked to that project (TEAMWORK_ALLOWED_PROJECT_IDS),
 * so the suite cannot write anywhere else. Without TEAMWORK_TEST_PROJECT_ID the
 * suite is skipped.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv() {
  const env = {};
  const file = join(REPO, ".env");
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

const ENV = { ...loadDotEnv(), ...process.env };
const PROJECT_ID = ENV.TEAMWORK_TEST_PROJECT_ID;
const SKIP = !PROJECT_ID || !ENV.TEAMWORK_BASE_URL || !ENV.TEAMWORK_API_TOKEN
  ? "set TEAMWORK_BASE_URL, TEAMWORK_API_TOKEN and TEAMWORK_TEST_PROJECT_ID to run the live suite"
  : false;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("live Teamwork API via MCP stdio", { skip: SKIP, timeout: 300000 }, () => {
  let mcp;
  let me;
  let taskId;
  let tmp;
  let project;
  const created = { comments: new Set(), timeEntries: new Set(), files: new Set() };
  const runId = `${Date.now()}`;

  async function call(name, args = {}) {
    const res = await mcp.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? "";
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (res.isError) {
      const err = new Error(`${name} failed: ${typeof data === "string" ? data : data.message}`);
      err.data = data;
      throw err;
    }
    return data;
  }

  before(async () => {
    tmp = mkdtempSync(join(tmpdir(), "teamwork-mcp-live-"));
    writeFileSync(join(tmp, "a.txt"), `teamwork-mcp live test ${runId} A\n`);
    writeFileSync(join(tmp, "b.txt"), `teamwork-mcp live test ${runId} B\n`);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(REPO, "src", "server.js")],
      env: {
        ...ENV,
        TEAMWORK_READ_ONLY: "false",
        TEAMWORK_ALLOWED_PROJECT_IDS: String(PROJECT_ID),
        TEAMWORK_UPLOAD_ROOTS: tmp,
        LOG_LEVEL: "error",
      },
      stderr: "ignore",
    });
    mcp = new Client({ name: "teamwork-mcp-live-test", version: "1" });
    await mcp.connect(transport);
    me = await call("teamwork_get_current_user");
  });

  after(async () => {
    // Best-effort cleanup of everything this run created, even after failures.
    for (const id of created.timeEntries) await call("teamwork_delete_time_entry", { timeEntryId: id }).catch(() => {});
    for (const id of created.comments) await call("teamwork_delete_task_comment", { commentId: id }).catch(() => {});
    for (const id of created.files) await call("teamwork_delete_file", { fileId: id }).catch(() => {});
    if (taskId) await call("teamwork_delete_task", { taskId }).catch(() => {});
    await mcp?.close();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it("resolves the token owner", () => {
    assert.ok(Number.isInteger(me.id));
  });

  it("#1 lists my projects (including the test project)", async () => {
    const r = await call("teamwork_list_projects");
    project = r.projects.find((p) => String(p.id) === String(PROJECT_ID));
    assert.ok(project, `test project ${PROJECT_ID} not visible to this token`);
  });

  it("creates a temporary task assigned to me", async () => {
    const r = await call("teamwork_create_task", {
      projectId: PROJECT_ID,
      title: `[teamwork-mcp live test ${runId}] safe to delete`,
      description: "Created by npm run test:live; deleted automatically.",
      assignToMe: true,
    });
    taskId = r.taskId;
    assert.ok(taskId);
    assert.deepEqual(r.task.assignees.map((a) => a.id), [me.id]);
  });

  it("refuses writes outside TEAMWORK_ALLOWED_PROJECT_IDS", async () => {
    const other = (await call("teamwork_list_projects")).projects.find((p) => String(p.id) !== String(PROJECT_ID));
    if (!other) return;
    await assert.rejects(
      call("teamwork_create_task", { projectId: other.id, title: "must never be created" }),
      (e) => e.data?.code === "FORBIDDEN"
    );
  });

  it("#2 lists tasks within the project", async () => {
    const r = await call("teamwork_get_project_tasks", { projectId: PROJECT_ID, searchTerm: runId });
    assert.ok(r.tasks.some((t) => t.id === taskId));
  });

  it("#3 lists tasks assigned to me (and only to me)", async () => {
    const scoped = await call("teamwork_get_my_tasks", { projectId: PROJECT_ID, pageSize: 500 });
    assert.ok(scoped.tasks.some((t) => t.id === taskId));
    const all = await call("teamwork_get_my_tasks", { pageSize: 500 });
    assert.ok(all.tasks.length > 0);
    for (const t of all.tasks) assert.ok(t.assignees.some((a) => a.id === me.id), `task ${t.id} is not assigned to me`);
  });

  it("#10 edits a task (fields set, then cleared)", async () => {
    const r = await call("teamwork_update_task", {
      taskId,
      title: `[teamwork-mcp live test ${runId}] edited`,
      priority: "high",
      dueDate: "2030-01-15",
      startDate: "2030-01-10",
      estimatedMinutes: 30,
    });
    assert.equal(r.task.priority, "high");
    assert.equal(r.task.dueDate, "2030-01-15");
    assert.equal(r.task.startDate, "2030-01-10");
    assert.equal(r.task.estimateMinutes, 30);
    const cleared = await call("teamwork_update_task", { taskId, priority: "none", dueDate: null, startDate: null });
    assert.equal(cleared.task.priority, null);
    assert.equal(cleared.task.dueDate, null);
    const done = await call("teamwork_complete_task", { taskId });
    assert.equal(done.status, "completed");
    const reopened = await call("teamwork_complete_task", { taskId, completed: false });
    assert.notEqual(reopened.status, "completed");
  });

  it("#4 #5 lists board lanes, moves the task by stage name, and lists that lane", async (t) => {
    const board = await call("teamwork_get_project_board", { projectId: PROJECT_ID });
    if (!board.workflows.length) return t.skip("test project has no workflow");
    const wf = board.workflows[0];
    assert.ok(wf.stages.length > 0);
    const target = wf.stages[0];
    const moved = await call("teamwork_move_task_stage", { taskId, stage: target.name, workflowId: board.workflows.length > 1 ? wf.id : undefined });
    assert.equal(moved.to.id, target.id);
    assert.equal(moved.verified, true);
    const lane = await call("teamwork_get_stage_tasks", { projectId: PROJECT_ID, workflowId: wf.id, stage: String(target.id), pageSize: 250 });
    assert.equal(lane.stage.id, target.id);
    assert.ok(lane.tasks.every((x) => x.workflowStages.some((s) => s.stageId === target.id)));
    if (!lane.meta?.hasMore) assert.ok(lane.tasks.some((x) => x.id === taskId), "moved task is listed in its lane");
  });

  it("#7 #6 #9 #8 posts, reads, edits and removes a comment", async () => {
    const posted = await call("teamwork_add_task_comment", { taskId, body: `live test comment ${runId}` });
    created.comments.add(posted.commentId);
    let list = await call("teamwork_get_task_comments", { taskId });
    assert.ok(list.comments.some((c) => c.id === posted.commentId && c.body.includes(runId)));
    const edited = await call("teamwork_update_task_comment", { commentId: posted.commentId, body: `edited ${runId}` });
    assert.equal(edited.body, `edited ${runId}`);
    const removed = await call("teamwork_delete_task_comment", { commentId: posted.commentId });
    assert.equal(removed.deleted, true);
    created.comments.delete(posted.commentId);
    list = await call("teamwork_get_task_comments", { taskId });
    assert.ok(!list.comments.some((c) => c.id === posted.commentId));
  });

  it("#11 attaches files to a task", async () => {
    const r = await call("teamwork_upload_file_to_task", { taskId, filePaths: [join(tmp, "a.txt"), join(tmp, "b.txt")] });
    assert.equal(r.fileIds.length, 2);
    r.fileIds.forEach((id) => created.files.add(id));
    const detail = await call("teamwork_get_task_detail", { taskId });
    const attached = (detail.task.attachments || []).map((a) => a.id);
    for (const id of r.fileIds) assert.ok(attached.includes(id));
  });

  it("refuses to upload files outside TEAMWORK_UPLOAD_ROOTS", async () => {
    await assert.rejects(call("teamwork_upload_file_to_task", { taskId, filePath: join(REPO, "package.json") }), (e) => e.data?.code === "FORBIDDEN");
  });

  it("#12 attaches files to comments (on creation and afterwards)", async () => {
    const posted = await call("teamwork_add_task_comment", { taskId, body: `comment with file ${runId}`, filePaths: [join(tmp, "a.txt")] });
    created.comments.add(posted.commentId);
    assert.equal(posted.comment.files.length, 1);
    const after1 = await call("teamwork_attach_files_to_comment", { commentId: posted.commentId, filePaths: [join(tmp, "b.txt")] });
    assert.equal(after1.files.length, 2);
    assert.equal(after1.body, `comment with file ${runId}`, "body preserved");
    after1.files.forEach((f) => created.files.add(f.id));
  });

  it("#14 #13 #15 adds, lists, edits and removes task time entries", async () => {
    const added = await call("teamwork_add_task_time_entry", { taskId, date: today(), time: "07:00", minutes: 5, description: `live ${runId}` });
    created.timeEntries.add(added.id);
    assert.equal(added.userId, me.id);
    let list = await call("teamwork_get_task_time_entries", { taskId });
    assert.ok(list.timeEntries.some((e) => e.id === added.id && e.minutes === 5));
    const edited = await call("teamwork_update_time_entry", { timeEntryId: added.id, minutes: 7 });
    assert.equal(edited.minutes, 7);
    await call("teamwork_delete_time_entry", { timeEntryId: added.id });
    created.timeEntries.delete(added.id);
    list = await call("teamwork_get_task_time_entries", { taskId });
    assert.ok(!list.timeEntries.some((e) => e.id === added.id));
  });

  it("#17 #16 adds to my time log and reads it back", async () => {
    const onTask = await call("teamwork_log_my_time", { taskId, date: today(), time: "07:30", minutes: 3, description: `my log ${runId}` });
    created.timeEntries.add(onTask.id);
    let projectLevel;
    if (project && project.timelogRequiresTask === false) {
      projectLevel = await call("teamwork_log_my_time", { projectId: PROJECT_ID, date: today(), time: "07:45", minutes: 2, description: `my project log ${runId}` });
      created.timeEntries.add(projectLevel.id);
      assert.equal(projectLevel.taskId, null);
    }
    const mine = await call("teamwork_get_my_time_entries", { startDate: today(), endDate: today(), pageSize: 250 });
    assert.ok(mine.timeEntries.every((e) => e.userId === me.id));
    const ids = mine.timeEntries.map((e) => e.id);
    assert.ok(ids.includes(onTask.id));
    if (projectLevel) assert.ok(ids.includes(projectLevel.id));
  });

  it("reads notifications with cursor paging", async () => {
    const r = await call("teamwork_get_notifications", { limit: 2 });
    assert.ok(Array.isArray(r.notifications) && r.notifications.length <= 2);
  });

  it("cleans up: files, comments, time entries and the task", async () => {
    for (const id of created.timeEntries) await call("teamwork_delete_time_entry", { timeEntryId: id });
    created.timeEntries.clear();
    for (const id of created.comments) await call("teamwork_delete_task_comment", { commentId: id });
    created.comments.clear();
    for (const id of created.files) await call("teamwork_delete_file", { fileId: id });
    created.files.clear();
    const del = await call("teamwork_delete_task", { taskId });
    assert.equal(del.deleted, true);
    const leftovers = await call("teamwork_get_project_tasks", { projectId: PROJECT_ID, searchTerm: runId, includeCompleted: true });
    assert.equal(leftovers.tasks.length, 0);
    taskId = undefined;
  });
});
