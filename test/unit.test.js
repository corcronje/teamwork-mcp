/**
 * Offline tests: no network, no credentials needed.
 * Run: npm test   (or: node --test test/unit.test.js)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { resolveStage } from "../src/stages.js";
import { TeamworkClient, normalizeDate, normalizeTime, normalizePriority } from "../src/teamworkClient.js";
import { parseTeamworkError, MCPError, ValidationError, NotFoundError, AuthorizationError } from "../src/errors.js";
import { buildTools, guardWrite } from "../src/tools.js";
import { createServer } from "../src/server.js";

// Real stage lists from two different projects' workflows on a live site.
const mk = (rows) => rows.map(([id, name]) => ({ id, name }));
const CTC = mk([
  [182965, "Selected"], [182969, "In Progress"], [182975, "Peer Review"], [182981, "DEV QA Ready"],
  [182982, "STAGE Ready"], [182984, "QA Ready STAGE"], [182985, "Production Ready"],
  [182989, "Deployed to Production"], [182992, "Done"],
]);
const EDCTP = mk([
  [183115, "Selected"], [183117, "In Progress"], [183120, "QA Ready STAGE"], [183125, "Production Ready"],
  [183127, "Deployed to Production"], [183129, "Done"], [320296, "EDCTP TEST STAGE"],
]);

const baseConfig = {
  baseUrl: "https://example.teamwork.com",
  apiBase: "https://example.teamwork.com/projects/api/v3",
  token: "t",
  authMode: "basic_token_x",
  readOnly: false,
  allowedProjectIds: [],
  requestTimeout: 5000,
  maxRetries: 2,
  uploadRoots: [],
};

/** fetch stub: routes(method, url) -> {status, body}; records calls. */
function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const method = init.method || "GET";
    calls.push({ method, url: String(url), body: init.body ? JSON.parse(init.body) : undefined });
    const r = routes(method, new URL(url)) ?? { status: 404, body: { message: "Not Found" } };
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status ?? 200 });
  };
  fn.calls = calls;
  return fn;
}

describe("stage resolution", () => {
  const name = (stages, q) => resolveStage(stages, q).stage.name;

  it("matches exact names regardless of case/punctuation", () => {
    assert.equal(name(CTC, "in_progress"), "In Progress");
    assert.equal(name(CTC, "In-Progress"), "In Progress");
    assert.equal(name(EDCTP, "SELECTED"), "Selected");
    assert.equal(name(CTC, "dev qa ready"), "DEV QA Ready");
  });

  it("matches by id only within the workflow", () => {
    assert.equal(name(CTC, "182969"), "In Progress");
    assert.throws(() => resolveStage(EDCTP, "182969"), ValidationError);
  });

  it("reports ambiguity with the real stage names instead of guessing", () => {
    assert.throws(
      () => resolveStage(CTC, "qa_ready", { workflowId: 43608 }),
      (e) => e instanceof ValidationError && /ambiguous/.test(e.message) && /DEV QA Ready/.test(e.message) && /QA Ready STAGE/.test(e.message)
    );
    assert.throws(() => resolveStage(CTC, "production"), /ambiguous/);
    assert.throws(() => resolveStage(mk([[1, "Peer Review"], [2, "Code Review"]]), "review"), /ambiguous/);
  });

  it("resolves a partial name when it is unique in that workflow", () => {
    assert.equal(name(EDCTP, "qa_ready"), "QA Ready STAGE");
  });

  it("respects word order", () => {
    assert.equal(name(CTC, "stage ready"), "STAGE Ready");
    assert.throws(() => resolveStage(EDCTP, "stage ready"), /No stage matching/);
  });

  it("supports synonyms and small typos", () => {
    assert.equal(name(CTC, "wip"), "In Progress");
    assert.equal(name(CTC, "complete"), "Done");
    assert.equal(name(CTC, "review"), "Peer Review");
    assert.equal(name(CTC, "Selcted"), "Selected");
  });

  it("lists available stages when nothing matches", () => {
    assert.throws(() => resolveStage(CTC, "nonsense"), (e) => /Available stages/.test(e.message) && e.context.availableStages.length === 9);
  });
});

describe("normalizers", () => {
  it("dates", () => {
    assert.equal(normalizeDate("2026-09-28"), "2026-09-28");
    assert.equal(normalizeDate("20260928"), "2026-09-28");
    assert.equal(normalizeDate(null), null);
    assert.equal(normalizeDate(undefined), undefined);
    assert.throws(() => normalizeDate("2026-02-30"), ValidationError);
    assert.throws(() => normalizeDate("28/09/2026"), ValidationError);
  });
  it("times become HH:MM:SS (v3 rejects HH:MM)", () => {
    assert.equal(normalizeTime("9:05"), "09:05:00");
    assert.equal(normalizeTime("14:30:15"), "14:30:15");
    assert.throws(() => normalizeTime("25:00"), ValidationError);
  });
  it("priorities", () => {
    assert.equal(normalizePriority("HIGH"), "high");
    assert.equal(normalizePriority("none"), null);
    assert.throws(() => normalizePriority(3), ValidationError);
  });
});

describe("errors", () => {
  const res = (status) => ({ status, url: "u", headers: { get: () => null } });
  it("keeps subclass identity", () => {
    const e = parseTeamworkError(res(404), { message: "x" });
    assert.ok(e instanceof NotFoundError && e instanceof MCPError);
  });
  it("surfaces v1 and v3 messages", () => {
    assert.match(parseTeamworkError(res(400), { content: { message: "Bad request" } }).message, /Bad request/);
    assert.match(parseTeamworkError(res(422), { MESSAGE: "Exclude Weekends enabled", STATUS: "Error" }).message, /Exclude Weekends/);
    assert.match(parseTeamworkError(res(400), { errors: [{ title: "invalid data", detail: "invalid time '09:15'" }] }).message, /invalid time/);
    assert.equal(parseTeamworkError(res(400), {}, { method: "DELETE" }).context.method, "DELETE");
  });
});

describe("client transport", () => {
  it("never retries a POST on 5xx (duplicate-write risk)", async () => {
    const f = mockFetch(() => ({ status: 503, body: { message: "down" } }));
    const c = new TeamworkClient({ ...baseConfig, maxRetries: 2 }, { fetchImpl: f });
    await assert.rejects(c.request("POST", "/x.json", { body: {} }));
    assert.equal(f.calls.length, 1);
  });
  it("retries idempotent requests on 5xx", async () => {
    let n = 0;
    const f = mockFetch(() => (++n < 2 ? { status: 502, body: {} } : { status: 200, body: { ok: true } }));
    const c = new TeamworkClient({ ...baseConfig, maxRetries: 2 }, { fetchImpl: f });
    assert.deepEqual(await c.request("GET", "/x.json"), { ok: true });
    assert.equal(f.calls.length, 2);
  });
  it("uses /projects/api/v1 for v1 calls, including the upload presign endpoint", () => {
    const c = new TeamworkClient(baseConfig, { fetchImpl: mockFetch(() => ({})) });
    assert.equal(c.getLegacyApiBase(), "https://example.teamwork.com/projects/api/v1");
  });
});

describe("getMyTasks", () => {
  it("filters with responsiblePartyIds, re-checks assignees client-side, and paginates", async () => {
    const f = mockFetch((method, url) => {
      if (url.pathname.endsWith("/me.json")) return { body: { person: { id: 7, firstName: "Me" } } };
      if (url.pathname.endsWith("/tasks.json")) {
        const page = Number(url.searchParams.get("page"));
        const tasks = page === 1 ? [{ id: 1, assigneeUserIds: [7] }, { id: 2, assigneeUserIds: [8] }] : [{ id: 3, assigneeUserIds: [8, 7] }];
        return { body: { tasks, meta: { page: { hasMore: page === 1 } }, included: {} } };
      }
      return undefined;
    });
    const c = new TeamworkClient(baseConfig, { fetchImpl: f });
    const r = await c.getMyTasks({ detail: "full" });
    assert.deepEqual(r.tasks.map((t) => t.id), [1, 3]); // task 2 (not mine) dropped
    const taskCalls = f.calls.filter((x) => x.url.includes("/tasks.json"));
    assert.equal(taskCalls.length, 2);
    for (const call of taskCalls) {
      const q = new URL(call.url).searchParams;
      assert.equal(q.get("responsiblePartyIds"), "7");
      assert.equal(q.get("assignedToMe"), null);
    }
    await c.getMyTasks({ includeCompleted: true, detail: "full" });
    assert.equal(new URL(f.calls.at(-1).url).searchParams.get("includeCompletedTasks"), "true");
    assert.equal(f.calls.filter((x) => x.url.endsWith("/me.json")).length, 1, "me is cached per process");
  });
});

describe("request shapes", () => {
  const f = mockFetch((method, url) => {
    if (url.pathname.endsWith("/tasks/5.json") && method === "GET") return { body: { task: { id: 5, workflowStages: [] } } };
    if (url.pathname.endsWith("/notifications.json")) return { body: { notifications: [], meta: { nextCursor: "c2" } } };
    return { status: 200, body: { STATUS: "OK" } };
  });
  const c = new TeamworkClient(baseConfig, { fetchImpl: f });

  it("edits a task with v3 write fields and clears with null", async () => {
    await c.updateTask({ taskId: 5, title: "T", priority: "high", dueDate: null, startDate: "2026-10-01", assigneeUserIds: [] });
    const patch = f.calls.find((x) => x.method === "PATCH");
    assert.match(patch.url, /\/projects\/api\/v3\/tasks\/5\.json$/);
    assert.deepEqual(patch.body.task, { name: "T", priority: "high", dueAt: null, startAt: "2026-10-01", assignees: { userIds: [] } });
  });
  it("uses flat comment and v3 time-entry URLs", async () => {
    await c.deleteComment({ commentId: 9 });
    await c.deleteTimeEntry({ timeEntryId: 11 });
    await c.completeTask({ taskId: 5 });
    const urls = f.calls.map((x) => `${x.method} ${new URL(x.url).pathname}`);
    assert.ok(urls.includes("DELETE /projects/api/v1/comments/9.json"));
    assert.ok(urls.includes("DELETE /projects/api/v3/time/11.json"));
    assert.ok(urls.includes("PUT /projects/api/v1/tasks/5/complete.json"));
  });
  it("pages notifications by cursor", async () => {
    const r = await c.getNotifications({ limit: 5, cursor: "c1" });
    const q = new URL(f.calls.at(-1).url).searchParams;
    assert.equal(q.get("limit"), "5");
    assert.equal(q.get("cursor"), "c1");
    assert.equal(q.get("page"), null);
    assert.equal(r.nextCursor, "c2");
  });
});

describe("write guard", () => {
  const fakeClient = {
    getTaskProjectId: async (id) => (id === 1 ? 100 : 200),
    getTasklistProjectId: async () => 100,
    getComment: async () => ({ projectId: 200 }),
    getTimeEntry: async () => ({ projectId: 100 }),
    getFile: async () => {
      throw new NotFoundError("gone");
    },
  };
  const ctx = (over) => ({ config: { ...baseConfig, ...over }, client: fakeClient });

  it("blocks everything in read-only mode", async () => {
    await assert.rejects(guardWrite(ctx({ readOnly: true }), { projectId: 100 }), AuthorizationError);
  });
  it("allows any project when no allowlist is set", async () => {
    await guardWrite(ctx({}), { taskId: 2 });
  });
  it("resolves the owning project from task/comment/time ids", async () => {
    const c = ctx({ allowedProjectIds: ["100"] });
    await guardWrite(c, { taskId: 1 });
    await guardWrite(c, { timeEntryId: 5 });
    await assert.rejects(guardWrite(c, { taskId: 2 }), /project 200 is not in/);
    await assert.rejects(guardWrite(c, { commentId: 3 }), /project 200 is not in/);
    await assert.rejects(guardWrite(c, { projectId: 100, taskListId: 9, taskId: 2 }), /project 200/);
  });
  it("fails closed when the project cannot be resolved", async () => {
    await assert.rejects(guardWrite(ctx({ allowedProjectIds: ["100"] }), { fileId: 4 }), /could not resolve/);
    await assert.rejects(guardWrite(ctx({ allowedProjectIds: ["100"] }), {}), /could not resolve/);
  });
});

describe("tool table", () => {
  const exploding = new Proxy({}, { get: () => () => { throw new Error("client must not be called"); } });
  const tools = buildTools({ config: { ...baseConfig, readOnly: true }, client: exploding });

  it("has unique names and covers every required capability", () => {
    const names = new Set(tools.map((t) => t.name));
    assert.equal(names.size, tools.length);
    for (const required of [
      "teamwork_list_projects", "teamwork_get_project_tasks", "teamwork_get_my_tasks", "teamwork_get_project_board",
      "teamwork_get_stage_tasks", "teamwork_get_task_comments", "teamwork_add_task_comment", "teamwork_delete_task_comment",
      "teamwork_update_task_comment", "teamwork_update_task", "teamwork_upload_file_to_task", "teamwork_attach_files_to_comment",
      "teamwork_get_task_time_entries", "teamwork_add_task_time_entry", "teamwork_delete_time_entry",
      "teamwork_get_my_time_entries", "teamwork_log_my_time",
    ]) {
      assert.ok(names.has(required), required);
    }
  });

  it("every write tool is guarded before touching the API", async () => {
    const sample = { taskId: 1, projectId: 1, commentId: 1, timeEntryId: 1, fileId: 1, title: "x", body: "x", stage: "done", filePaths: ["/x"], filePath: "/x", date: "2026-01-01", time: "09:00", minutes: 5 };
    const writes = tools.filter((t) => t.write);
    assert.ok(writes.length >= 15);
    for (const tool of writes) {
      await assert.rejects(tool.handler({ ...sample }), AuthorizationError, tool.name);
    }
  });

  it("read tools are annotated read-only and write tools are not", () => {
    for (const t of tools) assert.equal(t.annotations.readOnlyHint, !t.write, t.name);
  });
});

describe("MCP protocol", () => {
  it("registers every tool with a JSON schema and returns structured errors", async () => {
    const config = { ...baseConfig, readOnly: true };
    const server = createServer({ config, client: new TeamworkClient(config, { fetchImpl: mockFetch(() => undefined) }) });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "unit", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const { tools } = await client.listTools();
    assert.equal(tools.length, buildTools({ config, client: {} }).length);
    assert.ok(tools.every((t) => t.inputSchema?.type === "object"));
    const denied = await client.callTool({ name: "teamwork_delete_task", arguments: { taskId: 1 } });
    assert.equal(denied.isError, true);
    assert.equal(JSON.parse(denied.content[0].text).code, "FORBIDDEN");
    const invalid = await client.callTool({ name: "teamwork_get_task_detail", arguments: { taskId: "abc" } });
    assert.equal(invalid.isError, true);
    await client.close();
  });
});

describe("TaskQueue (v3 and summary task shapes)", async () => {
  const { TaskQueue } = await import("../src/TaskQueue.js");
  const tasks = [
    { id: 1, name: "a", priority: "low", dueDate: "2099-01-02", assigneeUserIds: [7], workflowStages: [{ stageId: 5 }] },
    { id: 2, name: "b", priority: "high", dueDate: null, assignees: [{ id: 8 }], workflowStages: [{ stageId: 6, stageName: "Done" }] },
    { id: 3, name: "c", priority: null, dueDate: "2099-01-01", assigneeUserIds: [7, 8], workflowStages: [{ stageId: 0 }] },
  ];
  it("sorts by v3 string priority, then due date", () => {
    assert.deepEqual(TaskQueue.sortByPriority(tasks).map((t) => t.id), [2, 1, 3]);
  });
  it("filters by assignee across both shapes", () => {
    assert.deepEqual(TaskQueue.filterByAssignee(tasks, 8).map((t) => t.id), [2, 3]);
  });
  it("groups by stage name or id", () => {
    assert.deepEqual(Object.keys(TaskQueue.groupByStage(tasks)).sort(), ["5", "Done", "backlog"]);
  });
  it("finds tasks without due dates", () => {
    assert.deepEqual(TaskQueue.filterWithoutDueDate(tasks).map((t) => t.id), [2]);
  });
});
