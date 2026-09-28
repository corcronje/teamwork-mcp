# Status

**Version:** 3.0.0. **Last verified:** 2026-09-28, against a live Teamwork site
(`npm test`: 35 offline + 16 live end-to-end tests passing; see [TEST_RESULTS.md](TEST_RESULTS.md)).

This file replaces the earlier STATUS / FEATURES_COMPLETE / IMPLEMENTATION_PLAN documents.
Several of their claims were wrong: "27 methods" (only 13 tools were registered),
"100% pass rate", due dates / assignment / priority as "account limitations" (they were
wrong field names), and comment deletion as a Teamwork bug (it was a wrong URL).

## Required capabilities

| # | Capability | Tool | Verified live |
|---|---|---|---|
| 1 | List my projects | `teamwork_list_projects` | yes |
| 2 | List tasks within a project | `teamwork_get_project_tasks` | yes |
| 3 | List tasks assigned to me | `teamwork_get_my_tasks` | yes (every returned task checked against my id) |
| 4 | List lanes / board | `teamwork_get_project_board` | yes |
| 5 | List tasks in a lane | `teamwork_get_stage_tasks` | yes |
| 6 | Read comments | `teamwork_get_task_comments` | yes |
| 7 | Post comments | `teamwork_add_task_comment` | yes |
| 8 | Remove comments | `teamwork_delete_task_comment` | yes (verified gone) |
| 9 | Edit comments | `teamwork_update_task_comment` | yes |
| 10 | Edit tasks | `teamwork_update_task`, `teamwork_complete_task` | yes (set and clear fields, complete, reopen) |
| 11 | Attach files to tasks | `teamwork_upload_file_to_task` | yes (2 files, verified on task) |
| 12 | Attach files to comments | `teamwork_add_task_comment` (`filePaths`), `teamwork_attach_files_to_comment` | yes |
| 13 | List time entries against a task | `teamwork_get_task_time_entries` | yes |
| 14 | Add time entries against a task | `teamwork_add_task_time_entry` | yes |
| 15 | Remove time entries | `teamwork_delete_time_entry` | yes (verified gone) |
| 16 | Read my time logs | `teamwork_get_my_time_entries` | yes (every entry checked against my id) |
| 17 | Add time to my time log | `teamwork_log_my_time` | yes (task time and project time) |

Also available: current user, task lists, task detail/create/delete, stage moves by name,
workflow stages, file delete, time entry edit, notifications.

## Known limitations

- **"Assigned to me" means direct user assignment.** Tasks assigned only to a team or a
  company that includes you are not returned; Teamwork's `responsiblePartyIds` filter and
  the task's `assigneeUserIds` only cover direct user assignment.
- **No project-less time entries.** Teamwork rejects `POST /time.json` (405). Time is
  always logged against a task or a project. Project time fails on projects with
  "time logs require a task" enabled.
- **Deleting a comment does not delete its attachments.** The files stay in the project's
  Files; use `teamwork_delete_file`.
- **Legacy board columns** (`boardColumnId` / `boardLaneId`) no longer exist on Teamwork
  sites that use workflows (`/projects/{id}/boards/columns.json` is 400 there).
  `teamwork_move_task` treats them as stage ids.
- **Weekends:** sites with "Exclude weekends" reject weekend dates through v1 endpoints.
  The v3 endpoints used here accept them.
- **Stage matching** refuses ambiguous names by design. Pass the full stage name or its id.
- **Shared workflows:** if a workflow spans several projects, `teamwork_get_stage_tasks`
  with a `projectId` filters that page client-side, so a page can contain fewer than
  `pageSize` tasks.

## Verified Teamwork API behaviour

Teamwork **silently ignores unknown query parameters and body fields**: a wrong name
returns 200 and does nothing, which is how most of the 2.x bugs went unnoticed.
Everything below was checked against a live site.

| Operation | Works | Silently ignored / broken |
|---|---|---|
| Tasks assigned to a user | `GET /tasks.json?responsiblePartyIds=<id>` (identical to a full client-side scan: 222 of 719 open, 513 of 1595 incl. completed) | `assignedToMe`, `assignedToUserIds`, `assigneeUserIds` |
| Include completed tasks | `includeCompletedTasks=true` | `includeCompleted` |
| Tasks in a stage | `GET /workflows/{wf}/stages/{stage}/tasks.json` | `workflowStageIds` on `/tasks.json` |
| A project's board | `GET /projects/{id}/workflows.json` then `/workflows/{wf}/stages.json` | `/projects/{id}/boards/columns.json` (400) |
| Edit task fields | v3 `PATCH /tasks/{id}.json` with `name`, `priority` ("low"/"medium"/"high"/null), `dueAt`, `startAt`, `estimatedMinutes`, `assignees.userIds` | `content`, `dueDate`, `startDate`, `estimateMinutes` (ignored); numeric priority (400) |
| Complete / reopen | v1 `PUT /tasks/{id}/complete.json` / `uncomplete.json` | v3 `PATCH {completed}` (200, no effect) |
| Read comments | v3 `GET /tasks/{id}/comments.json` | v1 `GET /projects/api/v1/tasks/{id}/comments.json` (404) |
| Edit / delete comment | v1 `PUT` / `DELETE /comments/{id}.json` | `/tasks/{taskId}/comments/{id}.json` (400, the old "comment deletion is broken" bug) |
| Add files to a comment | v1 `PUT /comments/{id}.json` with `pendingFileAttachments` **and** `body` | same without `body` (400 "Field 'body' is required") |
| Upload step 1 | `GET /projects/api/v1/pendingfiles/presignedurl.json` | same at the site root (400) |
| Time for a user | `GET /time.json?assignedToUserIds=<id>&startDate=&endDate=` | `userId`, `userIds` |
| Log time | v3 `POST /tasks/{id}/time.json` or `/projects/{id}/time.json`, `time` as `HH:MM:SS` | `POST /time.json` (405); `time` as `HH:MM` (400) |
| Edit / delete time | v3 `PATCH` / `DELETE /time/{id}.json` | `/tasks/{taskId}/time_entries/{id}.json` (400) |
| Notifications paging | `limit`, `cursor` (`meta.nextCursor`) | `page`, `pageSize` |
| Auth with an API key | `Authorization: Basic base64(token:x)` | `Bearer <api key>` (401) |
| File lookup | v3 `GET /files/{id}.json` (404 once deleted) | |
