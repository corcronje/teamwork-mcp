# Time tracking

All time tracking uses Teamwork's **v3** API. Earlier versions of this document described
v1 endpoints (`/projects/{id}/timelogs.json`, hyphenated fields, a fallback chain) that
were partly wrong. Edit and delete in particular used nested URLs that return 400.

## Tools

| Tool | Endpoint |
|---|---|
| `teamwork_get_task_time_entries` | `GET /projects/api/v3/tasks/{taskId}/time.json` |
| `teamwork_add_task_time_entry` | `POST /projects/api/v3/tasks/{taskId}/time.json` |
| `teamwork_log_my_time` | same, or `POST /projects/api/v3/projects/{projectId}/time.json` (no task) |
| `teamwork_update_time_entry` | `PATCH /projects/api/v3/time/{id}.json` |
| `teamwork_delete_time_entry` | `DELETE /projects/api/v3/time/{id}.json` |
| `teamwork_get_my_time_entries` | `GET /projects/api/v3/time.json?assignedToUserIds=<me>&startDate=&endDate=` |

## Inputs

- `date`: `YYYY-MM-DD` (or `YYYYMMDD`), the day the work was done.
- `time`: the start time, `HH:MM` 24-hour, in the user's Teamwork timezone. It is sent
  as `HH:MM:SS`; v3 rejects `HH:MM` with 400 "invalid time".
- `hours`, `minutes`: the duration, which must be more than 0. `minutes` may exceed 59
  (e.g. `minutes: 90`); it is normalised.
- `description`, `isBillable` (`isbillable` accepted on the task tool for compatibility).
- `userId`: defaults to the token owner (`personId` accepted as an alias). Logging for
  someone else requires permission in Teamwork.

Request body sent:

```json
{ "timelog": { "date": "2026-10-01", "time": "09:30:00", "hours": 1, "minutes": 15,
               "description": "Implementation", "isBillable": false, "userId": 123 } }
```

## "My time log"

- **Reading**: `teamwork_get_my_time_entries` filters server-side with
  `assignedToUserIds=<me>` (Teamwork ignores `userId`/`userIds`) and re-checks every entry
  client-side. Results are newest first and paged (`page`, `pageSize`); `meta.count` is
  the total for the range.
- **Adding**: Teamwork has no time entries without a project (`POST /time.json` returns
  405). `teamwork_log_my_time` logs as you against a task (`taskId`), or against a
  project with no task (`projectId` only). Project time is refused if the project has
  "time logs require a task" enabled; `teamwork_list_projects` shows `timelogRequiresTask`.

## Output

Entries come back as `{ id, timeLogged, minutes, hours, description, isBillable,
userId, userName, taskId, taskName, projectId, projectName, createdAt }`. `timeLogged`
is the start as an ISO timestamp (Teamwork returns it in UTC or with an offset).
