const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx-js-style");

const BACKUP_DIR = path.resolve(__dirname, "..", "Backup");
const CSV_PATH = fs.existsSync(path.join(BACKUP_DIR, "cash_book_edit.csv"))
  ? path.join(BACKUP_DIR, "cash_book_edit.csv")
  : path.join(BACKUP_DIR, "cash_book.csv");

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

function makeKey(receipt, amount) {
  return `${receipt}|${amount}`;
}

function loadCashBookEntries(csvPath) {
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
  const cashInIdx = idx("ငွေသားဝင်");
  const cashOutIdx = idx("ငွေသားထွက်");
  const bankInIdx = idx("ဘဏ်ဝင်");
  const bankOutIdx = idx("ဘဏ်ထွက်");

  const entries = [];

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const date = parseDate(row[dateIdx]);
    const receipt = String(row[receiptIdx] || "").trim();
    const desc = String(row[descIdx] || "").trim();
    const cashIn = toNumber(row[cashInIdx]);
    const cashOut = toNumber(row[cashOutIdx]);
    const bankIn = toNumber(row[bankInIdx]);
    const bankOut = toNumber(row[bankOutIdx]);

    const rowHasData =
      date ||
      receipt ||
      desc ||
      cashIn ||
      cashOut ||
      bankIn ||
      bankOut;
    if (!rowHasData) continue;

    const base = {
      date,
      receipt,
      desc,
      rowIndex: r + 1,
    };

    if (cashIn > 0) {
      entries.push({
        ...base,
        amount: cashIn,
        flow: "in",
        payment: "cash",
        source: "cash_in",
      });
    }
    if (cashOut > 0) {
      entries.push({
        ...base,
        amount: cashOut,
        flow: "out",
        payment: "cash",
        source: "cash_out",
      });
    }
    if (bankIn > 0) {
      entries.push({
        ...base,
        amount: bankIn,
        flow: "in",
        payment: "bank",
        source: "bank_in",
      });
    }
    if (bankOut > 0) {
      entries.push({
        ...base,
        amount: bankOut,
        flow: "out",
        payment: "bank",
        source: "bank_out",
      });
    }
  }

  return entries;
}

function loadAppTransactions(jsonPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const list = Array.isArray(raw.transactions) ? raw.transactions : [];
  return list
    .map((t) => ({
      id: String(t.id || ""),
      date: parseDate(t.date || ""),
      receipt: String(t.receiptNumber || "").trim(),
      amount: Number(t.amount || 0),
      type: t.type || "",
      payment: t.paymentMethod || "",
      notes: t.notes || "",
      memberId: t.memberId || "",
      payerPayee: t.payerPayee || "",
      category: t.category || "",
      categoryLabel: t.categoryLabel || "",
    }))
    .filter((t) => t.date || t.receipt || t.amount);
}

function buildReport(csvEntries, appTxs) {
  const appKeySet = new Set();
  const appByReceipt = new Map();

  for (const tx of appTxs) {
    if (tx.receipt && tx.amount) {
      appKeySet.add(makeKey(tx.receipt, tx.amount));
    }
    if (tx.receipt) {
      const list = appByReceipt.get(tx.receipt) || [];
      list.push(tx);
      appByReceipt.set(tx.receipt, list);
    }
  }

  const csvKeySet = new Set();
  const csvByReceipt = new Map();
  const missingInApp = [];
  const receiptMismatch = [];

  for (const entry of csvEntries) {
    const key = makeKey(entry.receipt, entry.amount);
    if (entry.receipt && entry.amount) {
      csvKeySet.add(key);
    }
    if (!appKeySet.has(key)) {
      missingInApp.push(entry);
    }
    if (entry.receipt) {
      const list = csvByReceipt.get(entry.receipt) || [];
      list.push(entry);
      csvByReceipt.set(entry.receipt, list);
    }
  }

  const missingInExcel = [];
  for (const tx of appTxs) {
    if (!tx.receipt || !tx.amount) continue;
    const key = makeKey(tx.receipt, tx.amount);
    if (!csvKeySet.has(key)) {
      missingInExcel.push(tx);
    }
  }

  for (const [receipt, csvRows] of csvByReceipt.entries()) {
    const appRows = appByReceipt.get(receipt) || [];
    if (!appRows.length) continue;
    const appAmounts = new Set(appRows.map((r) => r.amount));
    const csvAmounts = new Set(csvRows.map((r) => r.amount));
    const hasMatchingAmount = [...csvAmounts].some((amt) => appAmounts.has(amt));
    if (!hasMatchingAmount) {
      receiptMismatch.push({
        receipt,
        csvAmounts: [...csvAmounts].join(", "),
        appAmounts: [...appAmounts].join(", "),
        csvRows: csvRows.map((r) => `${r.date} | ${r.amount} | row ${r.rowIndex}`).join(" ; "),
        appRows: appRows
          .map((r) => `${r.date} | ${r.amount} | ${r.id} | ${r.type} | ${r.payment}`)
          .join(" ; "),
      });
    }
  }

  return { missingInApp, missingInExcel, receiptMismatch };
}

function buildWorkbook(report) {
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    ["Report", "Count"],
    ["Missing in App", report.missingInApp.length],
    ["Missing in Excel", report.missingInExcel.length],
    ["Receipt Mismatch", report.receiptMismatch.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");

  const sideBySideRows = [
    [
      "CSV Receipt",
      "APP Transaction ID",
      "CSV Amount",
      "APP Amount",
      "CSV Date",
      "CSV Row",
      "APP Date",
      "APP Type",
      "APP Payment",
    ],
  ];

  const csvByReceipt = new Map();
  for (const item of report.csvEntries || []) {
    if (!item.receipt) continue;
    const list = csvByReceipt.get(item.receipt) || [];
    list.push(item);
    csvByReceipt.set(item.receipt, list);
  }
  const appByReceipt = new Map();
  for (const item of report.appTxs || []) {
    if (!item.receipt) continue;
    const list = appByReceipt.get(item.receipt) || [];
    list.push(item);
    appByReceipt.set(item.receipt, list);
  }

  const receipts = [...csvByReceipt.keys()].sort((a, b) => a.localeCompare(b, "en"));
  for (const receipt of receipts) {
    const csvList = csvByReceipt.get(receipt) || [];
    const appList = appByReceipt.get(receipt) || [];

    for (const c of csvList) {
      let match = null;
      if (c && appList.length) {
        match = appList.find((a) => a.amount === c.amount) || appList[0];
      }
      sideBySideRows.push([
        receipt,
        match ? match.id : "",
        c ? c.amount : "",
        match ? match.amount : "",
        c ? c.date : "",
        c ? c.rowIndex : "",
        match ? match.date : "",
        match ? match.type : "",
        match ? match.payment : "",
      ]);
    }
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(sideBySideRows),
    "ReceiptSideBySide"
  );

  return wb;
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`);
  }

  const jsonPath = getLatestTransactionsBackup(BACKUP_DIR);
  const csvEntries = loadCashBookEntries(CSV_PATH);
  const appTxs = loadAppTransactions(jsonPath);
  const report = buildReport(csvEntries, appTxs);
  report.csvEntries = csvEntries;
  report.appTxs = appTxs;

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
  const outPath = path.join(outDir, `cash_book_discrepancies_${stamp}.xlsx`);
  XLSX.writeFile(wb, outPath, { compression: true });
  console.log(`Wrote report: ${outPath}`);
  console.log(`Source CSV: ${CSV_PATH}`);
  console.log(`Source transactions: ${jsonPath}`);
}

main();
