/* eslint-disable no-console */
const { execSync } = require("child_process");

const ALLOWLIST = new Map();

function parseAuditJson(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {}

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const possible = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(possible);
    } catch {}
  }

  return null;
}

function runAudit() {
  try {
    const out = execSync("npm audit --omit=dev --audit-level=high --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return parseAuditJson(out);
  } catch (error) {
    const combined = `${error.stdout || ""}\n${error.stderr || ""}`;
    const parsed = parseAuditJson(combined);
    if (parsed) return parsed;
    throw error;
  }
}

function getHighOrCriticalVulns(report) {
  const vulnObj = report && report.vulnerabilities ? report.vulnerabilities : {};
  const list = [];

  for (const [name, data] of Object.entries(vulnObj)) {
    const severity = String(data?.severity || "").toLowerCase();
    if (severity === "high" || severity === "critical") {
      list.push({
        name,
        severity,
        via: Array.isArray(data?.via) ? data.via : [],
      });
    }
  }

  return list;
}

function main() {
  const report = runAudit();
  if (!report) {
    console.error("Could not parse npm audit JSON output.");
    process.exit(1);
  }

  const issues = getHighOrCriticalVulns(report);
  if (!issues.length) {
    console.log("Security audit passed (no high/critical runtime vulnerabilities).");
    return;
  }

  const allowed = [];
  const blocked = [];
  for (const issue of issues) {
    if (ALLOWLIST.has(issue.name)) {
      allowed.push(issue);
    } else {
      blocked.push(issue);
    }
  }

  if (blocked.length) {
    console.error("Security audit failed: high/critical vulnerabilities found.");
    for (const issue of blocked) {
      console.error(`- ${issue.name} (${issue.severity})`);
    }
    process.exit(1);
  }

  console.warn("Security audit warning: only allowlisted vulnerabilities detected.");
  for (const issue of allowed) {
    console.warn(`- ${issue.name}: ${ALLOWLIST.get(issue.name)}`);
  }
}

main();
