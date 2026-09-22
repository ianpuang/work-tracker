/**
 * Work Tracker — Apps Script web app bound to the tracking Google Sheet.
 * Receives status updates from index.html and writes them into the `tasks` tab,
 * appending a copy to the `log` tab for audit.
 *
 * Deploy: Extensions → Apps Script → paste this file → Deploy → New deployment
 * → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
 * Copy the /exec URL into EXEC_URL at the top of index.html.
 * After any edit to this file: Deploy → Manage deployments → edit → Version: New
 * version → Deploy, or the old code keeps running.
 */

const TASKS_TAB = "tasks";
const LOG_TAB = "log";

/* Column positions in the `tasks` tab (1-based). */
const COL = { DATE: 1, TECH: 2, SITE: 3, TASK: 4, STATUS: 5, REASON: 6, NOTE: 7, UPDATED: 8 };

function doGet() {
  return json_({ ok: true, service: "work-tracker", time: new Date().toISOString() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    const row = Number(body.row);                    /* 1-based sheet row in `tasks` */
    const tech = String(body.tech || "").trim();
    const status = String(body.status || "").trim(); /* "done" | "not done" */
    const reason = String(body.reason || "").trim();
    const note = String(body.note || "").trim().slice(0, 200);

    if (!row || row < 2) return json_({ ok: false, error: "bad row" });
    if (!tech) return json_({ ok: false, error: "missing tech" });
    if (status !== "done" && status !== "not done") return json_({ ok: false, error: "bad status" });
    if (status === "not done" && !reason) return json_({ ok: false, error: "reason required" });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(TASKS_TAB);
    if (!sh) return json_({ ok: false, error: "tasks tab not found" });
    if (row > sh.getLastRow()) return json_({ ok: false, error: "row out of range" });

    /* Guard: the tech on that row must match what the client thinks it is updating,
       so a stale CSV (rows shifted after an exec edit) can't corrupt another task. */
    const rowTech = String(sh.getRange(row, COL.TECH).getValue()).trim();
    if (rowTech !== tech) return json_({ ok: false, error: "row mismatch" });

    const now = new Date();
    sh.getRange(row, COL.STATUS, 1, 4).setValues([[status, status === "done" ? "" : reason, note, now]]);

    const log = ss.getSheetByName(LOG_TAB);
    if (log) {
      log.appendRow([
        now,
        sh.getRange(row, COL.DATE).getDisplayValue(),
        tech,
        String(sh.getRange(row, COL.SITE).getValue()),
        String(sh.getRange(row, COL.TASK).getValue()),
        status,
        reason,
        note,
      ]);
    }

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
