# Test results

## How to run

```bash
npm test            # unit + live
npm run test:unit   # offline, no credentials
npm run test:live   # real Teamwork site
```

The live suite needs `TEAMWORK_BASE_URL`, `TEAMWORK_API_TOKEN` and
`TEAMWORK_TEST_PROJECT_ID` (a project where one temporary task may be created), set in
the environment or in `<repo>/.env`. Without `TEAMWORK_TEST_PROJECT_ID` it is skipped and
reports why. It starts the real server over MCP stdio with
`TEAMWORK_ALLOWED_PROJECT_IDS=<test project>` and `TEAMWORK_UPLOAD_ROOTS=<temp dir>`, so
it cannot write to any other project or upload any other file. It deletes every task,
comment, file and time entry it creates, including after a failure.

## Latest run: 2026-09-28, v3.0.0, Node 22.15

`npm test`: **51 tests, 51 pass, 0 fail.**

### Offline (35)

- Stage resolution against two real workflows: exact/alias/id matching, ambiguity
  errors naming the real stages (`qa_ready` on a board with "DEV QA Ready" and
  "QA Ready STAGE"), word order, synonyms, typos, unknown names
- Date, time and priority normalisation
- Error parsing (v1 and v3 bodies) and `instanceof` on error subclasses
- Transport: POST not retried on 5xx; GET retried; v1 base is `/projects/api/v1`
- `getMyTasks`: `responsiblePartyIds` sent, `assignedToMe` not sent, foreign tasks
  filtered client-side, all pages fetched, `/me.json` cached, `includeCompletedTasks`
- Request shapes: v3 task edit fields including null clearing, flat comment URL, v3
  time URL, v1 complete, cursor notifications
- Write guard: read-only, no allowlist, allowlist via task/comment/time/task-list
  ownership, fail closed
- Every write tool is rejected by the guard before any API call; read/write annotations
- MCP registration over an in-memory transport; structured `FORBIDDEN` and validation errors
- TaskQueue with v3 and summary task shapes
- Config precedence: defaults, config-file-only setup (its readOnly applies), env overrides file

### Live (16), against a real Teamwork site

| Test | Capabilities |
|---|---|
| resolves the token owner | |
| lists my projects (including the test project) | #1 |
| creates a temporary task assigned to me | |
| refuses writes outside `TEAMWORK_ALLOWED_PROJECT_IDS` | safety |
| lists tasks within the project | #2 |
| lists tasks assigned to me, and only to me (checked on every returned task) | #3 |
| edits a task: set title/priority/dates/estimate, clear them, complete, reopen | #10 |
| lists board lanes, moves the task by stage name, lists that lane | #4 #5 |
| posts, reads, edits and removes a comment (verified gone) | #7 #6 #9 #8 |
| attaches two files to a task (verified on the task) | #11 |
| refuses uploads outside `TEAMWORK_UPLOAD_ROOTS` | safety |
| attaches files to a comment on creation and afterwards (body kept) | #12 |
| adds, lists, edits and removes task time entries (verified gone) | #14 #13 #15 |
| adds to my time log (task and project time) and reads it back, only my entries | #17 #16 |
| reads notifications with cursor paging | |
| cleans up files, comments, time entries and the task; nothing left behind | |

Earlier versions of this file reported "100% pass" for tests that exercised only local
helper classes, not the API. Those tests have been removed.
