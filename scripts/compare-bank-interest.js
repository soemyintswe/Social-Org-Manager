const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx-js-style");

const BACKUP_DIR = path.resolve(__dirname, "..", "Backup");
const CSV_PATH = path.join(BACKUP_DIR, "ဘဏ်တိုးရငွေလက်ကျန်.csv");

function getLatestTransactionsBackup(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((name) => /^transactions_backup_.*\.json$/i.test(name))
    .map((name) => ({
      name,
      full: path.join(dir, name),
      stat: fs.statSync(path.join(dir, name)),
    }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  if (!files.length) {
    throw new Error("No transactions_backup_*.json found in Backup/");
  }
  return files[0].full;
}

function parseDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return raw;
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value)
    .replace(/[, ]/g, "")
    .replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function loadBankInterestEntries(csvPath) {
  const wb = XLSX.readFile(csvPath, { raw: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h || "").trim());
  const idx = (name) => header.findIndex((h) => h === name);

  const dateIdx = idx("ရက်စွဲ");
  const receiptIdx = idx("ပြေစာအမှတ်");
  const descIdx = idx("အကြောင်းအရာ");
  const bankInIdx = idx("ဘဏ်ဝင်");

  const entries = [];

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const date = parseDate(row[dateIdx]);
    const receipt = String(row[receiptIdx] || "").trim();
    const desc = String(row[descIdx] || "").trim();
    const bankIn = toNumber(row[bankInIdx]);

    const rowHasData = date || receipt || desc || bankIn;
    if (!rowHasData) continue;

    if (bankIn > 0) {
      entries.push({
        date,
        receipt,
        desc,
        amount: bankIn,
        rowIndex: r + 1,
      });
    }
  }

  return entries;
}

function loadAppBankInterest(jsonPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const list = Array.isArray(raw.transactions) ? raw.transactions : [];
  return list
    .filter((t) => {
      const cat = String(t.category || "");
      const label = String(t.categoryLabel || "");
      return cat === "bank_interest" || label.includes("ဘဏ်တိုး");
    })
    .map((t) => ({
      id: String(t.id || ""),
      date: parseDate(t.date || ""),
      receipt: String(t.receiptNumber || "").trim(),
      amount: Number(t.amount || 0),
      payment: t.paymentMethod || "",
      notes: t.notes || "",
      payerPayee: t.payerPayee || "",
    }))
    .filter((t) => t.receipt || t.amount);
}

function buildReport(csvEntries, appTxs) {
  const appKeySet = new Set();
  const appByReceipt = new Map();
  for (const tx of appTxs) {
    if (tx.receipt && tx.amount) {
      appKeySet.add(`${tx.receipt}|${tx.amount}`);
    }
    if (tx.receipt) {
      const list = appByReceipt.get(tx.receipt) || [];
      list.push(tx);
      appByReceipt.set(tx.receipt, list);
    }
  }

  const missingInApp = [];
  for (const entry of csvEntries) {
    const key = `${entry.receipt}|${entry.amount}`;
    if (!appKeySet.has(key)) {
      missingInApp.push(entry);
    }
  }

  return { missingInApp, csvEntries, appTxs, appByReceipt };
}

function buildWorkbook(report) {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    ["Report", "Count"],
    ["CSV Rows", report.csvEntries.length],
    ["App Bank Interest Rows", report.appTxs.length],
    ["Missing In App", report.missingInApp.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");

  const compareRows = [
    [
      "CSV Receipt",
      "APP Transaction ID",
      "CSV Amount",
      "APP Amount",
      "CSV Date",
      "APP Date",
      "CSV Row",
      "APP Payment",
      "APP Notes",
    ],
  ];

  const csvByReceipt = new Map();
  for (const item of report.csvEntries) {
    if (!item.receipt) continue;
    const list = csvByReceipt.get(item.receipt) || [];
    list.push(item);
    csvByReceipt.set(item.receipt, list);
  }

  const receipts = [...csvByReceipt.keys()].sort((a, b) => a.localeCompare(b, "en"));
  for (const receipt of receipts) {
    const csvList = csvByReceipt.get(receipt) || [];
    const appList = report.appByReceipt.get(receipt) || [];
    for (const c of csvList) {
      const match = appList.find((a) => a.amount === c.amount) || appList[0];
      compareRows.push([
        receipt,
        match ? match.id : "",
        c.amount,
        match ? match.amount : "",
        c.date,
        match ? match.date : "",
        c.rowIndex,
        match ? match.payment : "",
        match ? match.notes : "",
      ]);
    }
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(compareRows), "ReceiptCompare");

  const missingRows = [
    ["Date", "Receipt", "Amount", "Desc", "Row"],
    ...report.missingInApp.map((r) => [r.date, r.receipt, r.amount, r.desc, r.rowIndex]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(missingRows), "MissingInApp");

  return wb;
}

function buildImportCsv(missingEntries) {
  const rows = [
    [
      "id",
      "payment_method",
      "amount",
      "category",
      "member_id",
      "payer_payee",
      "date",
      "receipt_number",
      "notes",
      "fee_period_start",
      "fee_period_end",
    ],
  ];
  for (const entry of missingEntries) {
    const id = `bankint-${entry.receipt}`.replace(/\s+/g, "");
    rows.push([
      id,
      "bank",
      entry.amount,
      "bank_interest",
      "",
      entry.desc || "KBZ Bank ဘဏ်တိုးရငွေ",
      entry.date,
      entry.receipt,
      "",
      "",
      "",
    ]);
  }
  return rows;
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`);
  }
  const jsonPath = getLatestTransactionsBackup(BACKUP_DIR);
  const csvEntries = loadBankInterestEntries(CSV_PATH);
  const appTxs = loadAppBankInterest(jsonPath);
  const report = buildReport(csvEntries, appTxs);

  const wb = buildWorkbook(report);
  const ts = new Date();
  const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, "0")}${String(
    ts.getDate()
  ).padStart(2, "0")}_${String(ts.getHours()).padStart(2, "0")}${String(
    ts.getMinutes()
  ).padStart(2, "0")}`;
  const outDir = path.resolve(__dirname, "..", "exports");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const reportPath = path.join(outDir, `bank_interest_report_${stamp}.xlsx`);
  XLSX.writeFile(wb, reportPath, { compression: true });

  const importRows = buildImportCsv(report.missingInApp);
  const importWs = XLSX.utils.aoa_to_sheet(importRows);
  const importWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(importWb, importWs, "Import");
  const importPath = path.join(outDir, `bank_interest_import_${stamp}.csv`);
  const csvContent = XLSX.utils.sheet_to_csv(importWs);
  fs.writeFileSync(importPath, csvContent, "utf8");

  console.log(`Wrote report: ${reportPath}`);
  console.log(`Wrote import CSV: ${importPath}`);
  console.log(`Source CSV: ${CSV_PATH}`);
  console.log(`Source transactions: ${jsonPath}`);
}

main();
