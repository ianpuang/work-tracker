/**
 * Work Tracker — Apps Script web app bound to the tracking Google Sheet.
 * Receives status updates from index.html and writes them into the `tasks` tab,
 * appending a copy to the `log` tab for audit.
 * A "done" update also completes every other row of the same job (same date +
 * site + task) — one tech's Done speaks for the whole crew. "Not done" stays
 * individual.
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
    const dateDisp = sh.getRange(row, COL.DATE).getDisplayValue();
    const site = String(sh.getRange(row, COL.SITE).getValue()).trim();
    const taskName = String(sh.getRange(row, COL.TASK).getValue()).trim();

    /* "Done" speaks for the whole crew: find every row of the same job (same
       date + site + task — the exec enters one row per tech with identical
       copy-pasted strings) and complete them all together. */
    let rows = [row];
    if (status === "done") {
      const n = sh.getLastRow() - 1;
      const dates = sh.getRange(2, COL.DATE, n, 1).getDisplayValues();
      const sites = sh.getRange(2, COL.SITE, n, 1).getValues();
      const taskCol = sh.getRange(2, COL.TASK, n, 1).getValues();
      rows = [];
      for (let i = 0; i < n; i++) {
        if (dates[i][0] === dateDisp &&
            String(sites[i][0]).trim() === site &&
            String(taskCol[i][0]).trim() === taskName) rows.push(i + 2);
      }
    }

    const log = ss.getSheetByName(LOG_TAB);
    for (const r of rows) {
      const mine = r === row;
      sh.getRange(r, COL.STATUS, 1, 4)
        .setValues([[status, status === "done" ? "" : reason, mine ? note : "", now]]);
      if (log) {
        log.appendRow([
          now,
          dateDisp,
          mine ? tech : String(sh.getRange(r, COL.TECH).getValue()).trim(),
          site,
          taskName,
          status,
          mine ? reason : "",
          mine ? note : "auto: done via " + tech,
        ]);
      }
    }

    return json_({ ok: true, updated: rows.length });
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
