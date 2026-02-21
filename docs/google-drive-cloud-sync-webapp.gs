const API_KEY = "CHANGE_ME";
const SNAPSHOT_FILE_NAME = "orghub_sync_snapshot.json";
const DEFAULT_FOLDER_NAME = "OrgHub Sync";

function jsonResponse(payload, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function parseJsonBody_(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    return {};
  }
}

function resolveFolder_(folderName) {
  const safeName = String(folderName || DEFAULT_FOLDER_NAME).trim() || DEFAULT_FOLDER_NAME;
  const folders = DriveApp.getFoldersByName(safeName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(safeName);
}

function findOrCreateFile_(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  if (files.hasNext()) return files.next();
  return folder.createFile(fileName, JSON.stringify({ updatedAt: "", source: "cloud", data: {} }), MimeType.PLAIN_TEXT);
}

function validateKey_(apiKey) {
  if (!String(API_KEY || "").trim()) return true;
  return String(apiKey || "").trim() === String(API_KEY || "").trim();
}

function doGet(e) {
  return jsonResponse({
    ok: true,
    service: "orghub-google-drive-cloud-sync",
    now: new Date().toISOString(),
    hint: "Use POST with action=health|pullSnapshot|pushSnapshot",
  });
}

function doPost(e) {
  const body = parseJsonBody_(e);
  const action = String(body.action || "").trim();
  const apiKey = String(body.apiKey || "").trim();
  const folderName = String(body.folderName || DEFAULT_FOLDER_NAME).trim() || DEFAULT_FOLDER_NAME;

  if (!validateKey_(apiKey)) {
    return jsonResponse({ ok: false, reason: "unauthorized" });
  }

  if (action === "health") {
    return jsonResponse({ ok: true, action: "health", now: new Date().toISOString() });
  }

  const folder = resolveFolder_(folderName);
  const file = findOrCreateFile_(folder, SNAPSHOT_FILE_NAME);

  if (action === "pullSnapshot") {
    try {
      const raw = file.getBlob().getDataAsString();
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object" || !parsed.data) {
        return jsonResponse({ ok: false, reason: "snapshot_not_found" });
      }
      return jsonResponse({ ok: true, snapshot: parsed });
    } catch (err) {
      return jsonResponse({ ok: false, reason: "snapshot_read_failed", error: String(err) });
    }
  }

  if (action === "pushSnapshot") {
    try {
      const snapshot = body.snapshot || {};
      const normalized = {
        updatedAt: String(snapshot.updatedAt || new Date().toISOString()),
        source: String(snapshot.source || "mobile"),
        data: snapshot.data && typeof snapshot.data === "object" ? snapshot.data : {},
      };
      file.setContent(JSON.stringify(normalized));
      return jsonResponse({ ok: true, updatedAt: normalized.updatedAt });
    } catch (err) {
      return jsonResponse({ ok: false, reason: "snapshot_write_failed", error: String(err) });
    }
  }

  return jsonResponse({ ok: false, reason: "invalid_action" });
}
