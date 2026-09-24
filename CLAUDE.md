# Work Tracker

## What this is
End-of-day task status app for WeMAL technicians (~50 techs). Techs open the page on
their phone in the evening, tap their name, and mark each of the day's tasks
**Done** (green) or **Not done** (red + required reason). The maintenance executive
sees everyone's status on a board the same evening, enters tomorrow's tasks into a
Google Sheet, and the morning meeting (with the office big screen on the `#/kiosk`
view) covers only exceptions — no more going person by person asking "done or not?".

Built Sept 2026 on the same pattern as the SO dashboard (see the `so-dashboard`
repo): single-file static site on GitHub Pages, published Google Sheet as the
database, bound Apps Script web app for writes. No build step, no backend, no
dependencies.

## Files
- `index.html` — the entire app: tech view (default), board view (`#/board`),
  kiosk view (`#/kiosk`). `PUB_KEY` and `EXEC_URL` at the top of the `<script>`
  are already wired to the live sheet/script (set up 2026-09-22). `?demo=1` URL
  param loads sample data with saving disabled, for preview/training.
- `apps-script.gs` — reference copy of the Apps Script bound to the Google Sheet.
  The live version is what you paste into the script editor; keep this file in
  sync if you edit it there.

## Data source (Google Sheet)
One Google Sheet, **published to web** (File → Share → Publish to web → Entire
spreadsheet). Three tabs:

| Tab | Columns | Written by |
|---|---|---|
| `tasks` | A `Date` · B `Tech` · C `Site` · D `Task` · E `Status` · F `Reason` · G `Note` · H `Updated` | Exec fills A–D (can pre-enter future dates); the script writes E–H |
| `techs` | A `tech` (header) then one name per row | Exec — controls the name picker spelling |
| `log` | A `Timestamp` · B `Date` · C `Tech` · D `Site` · E `Task` · F `Status` · G `Reason` · H `Note` | Script only — append-only audit trail |

- Header row must stay in row 1 of `tasks` and `techs`.
- Enter dates as `yyyy-mm-dd` (e.g. `2026-09-23`). The app also tolerates
  `d/m/yyyy`, but Sheets' date auto-formatting is a classic gotcha — if tasks
  don't show up for a day, check what column A actually displays.
- One row per tech-assignment: a job with 4 techs = 4 rows, same Site/Task
  (copy-paste keeps the strings identical, which is how the board groups them
  and how the script finds the crew when one tech marks Done).
- Blank Status = pending. On the board, pending is shown amber and treated as
  "not updated" — that's the enforcement mechanism ("no update = not done").
- Monthly housekeeping: delete (or move) old `tasks` rows to keep the published
  CSV light — at ~50 techs that's roughly 4–5k rows/month. `log` can grow forever.
- Gids are auto-detected from the `pubhtml` tab menu (both the current
  `items.push(...)` markup and the older `sheet-button-N` markup, same lesson as
  the SO dashboard). If auto-detection ever fails, set `TASKS_GID`/`TECHS_GID`
  constants manually. If `techs` can't be found, the picker falls back to names
  seen in `tasks`.

## How it works
1. Reads: on load and every `REFRESH_SECONDS` (60s), fetches
   `.../pub?gid=<gid>&output=csv` for `tasks` and `techs`. ~5 min Google republish
   lag applies — fine for this workflow (tasks sit overnight; the board lagging a
   few minutes in the evening doesn't matter). A tech's own tap shows instantly
   (optimistic local update kept until the sheet catches up).
2. Writes: the app POSTs JSON `{row, tech, status, reason, note}` to `EXEC_URL`
   with `Content-Type: text/plain` (simple request, avoids CORS preflight; the
   JSON response is still readable). The script verifies the tech name on that
   row before writing (guard against stale row numbers after an exec edit),
   updates the row, and appends to `log`. On `row mismatch` the app tells the
   tech to retry and re-fetches. **Done is job-level:** a `done` update also
   completes every other `tasks` row with the same date + site + task (one
   tech's Done speaks for the whole crew); those rows are logged with note
   `auto: done via <tech>`. Not done stays individual — each tech reports
   their own reason.
3. Views: hash-routed. Tech view = today only (device local date), remembers the
   picked name in `localStorage` (`wt-tech`). Board adds Prev/Next day arrows so
   the exec can check tomorrow's entries. Kiosk = today, big type, problems
   first, clock, no controls — for the meeting-room screen.
4. Not done requires a reason from `REASONS` (Waiting parts / No access / Need
   more time / Other) plus an optional one-line note. Edit the `REASONS`
   constant to change the list.

## Setup (once, ~15 min)
1. Create a Google Sheet (e.g. `work-tracker`). Rename the first tab to `tasks`,
   add the header row from the table above. Add tabs `techs` and `log` with
   their headers. Fill `techs` with the 50 names.
2. Extensions → Apps Script → paste `apps-script.gs` → Save.
3. Deploy → New deployment → type **Web app** → Execute as: **Me** → Who has
   access: **Anyone** → Deploy. Authorize when prompted. Copy the `/exec` URL
   into `EXEC_URL` in `index.html`.
   **Gotcha:** after any later edit to the script you must Deploy → Manage
   deployments → edit → Version: **New version** → Deploy, or the old code keeps
   running.
4. File → Share → Publish to web → Entire spreadsheet → Publish. Copy the long
   `2PACX-…` key from the publish URL into `PUB_KEY` in `index.html`.
5. Test end-to-end: enter a task dated today for yourself, open the app, tap
   your name → Done, and watch columns E–H fill in within a few seconds.
6. Deploy to Pages (below) and share links: techs get the plain URL, exec
   bookmarks `#/board`, meeting-room PC opens `#/kiosk`.

## Deployment (GitHub Pages)
```bash
cd work-tracker
git init && git add . && git commit -m "Work tracker"
gh repo create work-tracker --public --source=. --push
gh api repos/{owner}/work-tracker/pages -f 'source[branch]=main' -f 'source[path]=/'
```
Live at `https://<user>.github.io/work-tracker/` a minute or two after Pages is enabled.

## Locked-in design decisions
(agreed with the exec before building — don't flip without a reason)
- Tasks are always entered by the exec in the Sheet; techs never type anything
  except the optional note.
- Red always requires a reason; "Need more time" is how multi-day jobs are
  reported, and the exec copy-pastes the row into the next day. No auto
  carry-over.
- No login/PIN — name-pick is trust-based; mistakes are corrected by re-tapping
  or by editing the Sheet directly. The Sheet is the admin UI.
- "Done" is a statement about the job, not the person: one tech's Done
  completes all rows of that job (the script does the fan-out; sheet edits
  made by hand don't fan out). "Not done" stays personal.
- Tech view shows today only; pending (no update by evening) is displayed
  prominently and treated as not done.
- Single `tasks` tab + monthly manual archive; no month-tab auto-detection
  (unlike the SO dashboard).

## Known constraints
- Sheet must stay **published to web** — unpublishing silently breaks all reads
  (page shows an amber "connection issue" pill and keeps last-good data).
- Published sheet + public Pages repo = anyone with the URL can read it. Staff
  task data — keep the link internal, same as the SO dashboard.
- ~5 min republish lag on reads (see above). Writes land in seconds — trust the
  `log` tab / sheet, not the board, if something looks stale.
- No auth means a determined tech could mark someone else's tasks. Accepted
  risk at this scale; the `log` tab timestamps everything if it's ever questioned.

## Quick edits for future sessions
- Reasons list → `REASONS` constant.
- Refresh cadence → `REFRESH_SECONDS`.
- Sheet renamed its tabs → nothing to do (auto-detection by name), unless the
  `pubhtml` scrape itself breaks — then set `TASKS_GID`/`TECHS_GID`.
- Exec wants a new column → add it after column H and it won't disturb the app;
  inserting columns before H shifts the fixed indexes in both `index.html`
  (`loadLive`) and `apps-script.gs` (`COL`) — update both.

## Session log
- 2026-09-24 — Added job-level Done: one tech's Done completes every `tasks`
  row with the same date+site+task (fan-out server-side in `apps-script.gs`,
  mirrored optimistically in `index.html`; shared tasks show a "Shared with…"
  hint; fanned-out rows logged with note `auto: done via <tech>`). Not done
  stays individual. Verified with a mocked-sheet `doPost` test (16 checks).
  Commit `a23dd85`, pushed to Pages.
  **Pending:** redeploy the Apps Script — paste the updated `apps-script.gs`
  into the editor, Deploy → Manage deployments → Version: New version. Until
  then the live script still marks only the tapping tech's row.
  Also confirmed scaling: `log` is never read by the app (grows forever, fine);
  `tasks` at ~30 rows/day ≈ 900/month — monthly housekeeping keeps reads light;
  lag only starts in the tens of thousands of rows.
