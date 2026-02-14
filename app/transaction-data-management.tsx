import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  ToastAndroid,
  Modal,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import * as store from "@/lib/storage";

const TXN_AUTO_BACKUP_FILE = "transactions_auto_backup.json";
const LEGACY_AUTO_BACKUP_FILE = "auto_backup.json";

const TEMPLATE_FILES = {
  income: {
    fileName: "transactions_income_template.csv",
    title: "ရငွေစာရင်း Template",
    csv: `id,payment_method,amount,category,member_id,payer_payee,date,receipt_number,notes,fee_period_start,fee_period_end
,cash,5000,member_fees,M-001,ဦးအောင်,2026-02-15,I-TR001,ဇန်နဝါရီမှ ဧပြီလကြေး,2026-01-01,2026-04-30
,bank,20000,donations,,မမီ,2026-02-16,I-TR002,အလှူငွေရရှိ,,
,cash,3500,other_income,,ဦးဘ,2026-02-18,I-TR003,အခြားရငွေ,,
`,
  },
  expense: {
    fileName: "transactions_expense_template.csv",
    title: "အသုံးစာရင်း Template",
    csv: `id,payment_method,amount,category,payer_payee,date,receipt_number,notes
,cash,15000,general_expenses,ရုံးသုံးဆိုင်,2026-02-20,O-TR001,ရုံးသုံးစရိတ်
,bank,8000,health_support,ဦးကျော်,2026-02-21,O-TR002,ကျန်းမာရေးထောက်ပံ့
,cash,3500,other_expenses,အထွေထွေ,2026-02-22,O-TR003,အခြားအသုံးစရိတ်
`,
  },
  transfer: {
    fileName: "transactions_transfer_template.csv",
    title: "ဘဏ်သွင်း/ဘဏ်ထုတ် Template",
    csv: `id,amount,category,date,receipt_number,notes
,300000,bank_deposit,2026-02-25,TR-0001,ငွေသားမှ ဘဏ်သို့သွင်း
,50000,bank_withdraw,2026-02-26,TR-0002,ဘဏ်မှ ငွေသားထုတ်
`,
  },
} as const;

type TemplateKind = keyof typeof TEMPLATE_FILES;

const categoryMap: Record<string, string> = {
  monthly_fee: "member_fees",
  donation: "donations",
  loan_issued: "loan_disbursement",
  general_expense: "general_expenses",
  welfare_health: "health_support",
  welfare_education: "education_support",
  welfare_funeral: "funeral_support",
  "လစဉ်ကြေးရငွေ": "member_fees",
  "အလှူငွေရရှိ": "donations",
  "ဘဏ်တိုးရငွေ": "bank_interest",
  "အခြားရငွေ": "other_income",
  "ချေးငွေပြန်ဆပ်ရရှိငွေ": "loan_repayment",
  "အတိုးရငွေ": "interest_income",
  "ကျန်းမာရေးထောက်ပံ့ငွေ": "health_support",
  "ပညာရေးထောက်ပံ့ငွေ": "education_support",
  "နာရေးကူညီငွေ": "funeral_support",
  "ချေးငွေထုတ်ပေးငွေ": "loan_disbursement",
  "ဘဏ်စရိတ်ပေးငွေ": "bank_charges",
  "အထွေထွေအသုံးစရိတ်": "general_expenses",
  "အခြားအသုံးစရိတ်": "other_expenses",
  "ဘဏ်သွင်း": "bank_deposit",
  "ဘဏ်ထုတ်": "bank_withdraw",
};

const incomeSet = new Set([
  "member_fees",
  "donations",
  "bank_interest",
  "other_income",
  "loan_repayment",
  "interest_income",
]);
const expenseSet = new Set([
  "health_support",
  "education_support",
  "funeral_support",
  "loan_disbursement",
  "bank_charges",
  "general_expenses",
  "other_expenses",
]);

type ParseResult =
  | { ok: true; transactions: any[]; skipped: number }
  | { ok: false; message: string };

function mDigits(input: string): string {
  const mm = ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"];
  return input.replace(/[၀-၉]/g, (d) => String(mm.indexOf(d)));
}

function text(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        q = !q;
      }
    } else if (c === "," && !q) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsvRows(raw: string): Record<string, string>[] {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function toIsoDate(v: unknown): string | null {
  const raw = mDigits(text(v));
  if (!raw) return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(raw)) {
    const [d, m, y] = raw.split(/[\/.\-]/);
    const yy = y.length === 2 ? `20${y}` : y;
    return `${yy}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(v: unknown): number {
  const cleaned = mDigits(text(v)).replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

function toCanonical(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const nk = k.toLowerCase().replace(/\s+/g, "_").replace(/[()]/g, "");
    if (nk === "payment_method" || nk === "paymentmethod" || nk === "ငွေပေးချေမှုပုံစံ") out.paymentMethod = v;
    else if (nk === "member_id" || nk === "memberid" || nk === "အသင်းဝင်အမှတ်") out.memberId = v;
    else if (nk === "payer_payee" || nk === "payerpayee" || nk === "ငွေပေးသွင်းသူအမည်" || nk === "ငွေလက်ခံသူအမည်" || nk === "name") out.payerPayee = v;
    else if (nk === "receipt_number" || nk === "receiptnumber" || nk === "voucher" || nk === "ဘောင်ချာနံပါတ်") out.receiptNumber = v;
    else if (nk === "fee_period_start" || nk === "feeperiodstart") out.feePeriodStart = v;
    else if (nk === "fee_period_end" || nk === "feeperiodend") out.feePeriodEnd = v;
    else if (nk === "notes" || nk === "note" || nk === "description" || nk === "မှတ်ချက်") out.notes = v;
    else out[k] = v;
  }
  return out;
}

function normalizeTransaction(raw: Record<string, unknown>, idx: number): any | null {
  const c = toCanonical(raw);
  const amount = parseAmount(c.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const rawCategory = text(c.category);
  let category = categoryMap[rawCategory] || rawCategory;
  const rawType = text(c.type).toLowerCase();
  const receipt = text(c.receiptNumber);
  let type: "income" | "expense" | "transfer" = "income";
  if (rawType.includes("expense") || rawType.includes("အသုံး")) type = "expense";
  else if (rawType.includes("transfer") || rawType.includes("ဘဏ်သွင်း") || rawType.includes("ဘဏ်ထုတ်")) type = "transfer";
  else if (rawType.includes("income") || rawType.includes("ရငွေ")) type = "income";
  else if (category === "bank_deposit" || category === "bank_withdraw") type = "transfer";
  else if (incomeSet.has(category)) type = "income";
  else if (expenseSet.has(category)) type = "expense";
  else if (receipt.startsWith("O-")) type = "expense";
  else if (receipt.startsWith("TR-")) type = "transfer";

  if (!category) {
    if (type === "transfer") category = rawType.includes("ဘဏ်ထုတ်") ? "bank_withdraw" : "bank_deposit";
    else category = type === "income" ? "other_income" : "other_expenses";
  }

  const paymentMethodRaw = text(c.paymentMethod).toLowerCase();
  const paymentMethod =
    type === "transfer"
      ? category === "bank_withdraw"
        ? "bank"
        : "cash"
      : paymentMethodRaw.includes("bank") || paymentMethodRaw.includes("ဘဏ်")
      ? "bank"
      : "cash";

  const date = toIsoDate(c.date) || new Date().toISOString().slice(0, 10);
  const id = text(c.id) || `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${idx}`;
  const receiptNumber = receipt || `${type === "income" ? "I-" : type === "expense" ? "O-" : "TR-"}${Date.now().toString().slice(-6)}${idx}`;
  const notes = text(c.notes);

  const tx: any = {
    id,
    type,
    category,
    amount,
    paymentMethod,
    date,
    receiptNumber,
    createdAt: text(c.createdAt) || new Date().toISOString(),
  };
  if (text(c.memberId)) tx.memberId = text(c.memberId);
  if (text(c.payerPayee)) tx.payerPayee = text(c.payerPayee);
  if (notes) {
    tx.notes = notes;
    tx.description = notes;
  }
  const fs = toIsoDate(c.feePeriodStart);
  const fe = toIsoDate(c.feePeriodEnd);
  if (fs) tx.feePeriodStart = fs;
  if (fe) tx.feePeriodEnd = fe;
  return tx;
}

function extractTransactionsFromJson(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (Array.isArray(o.transactions)) return o.transactions as unknown[];
  if (typeof o["@orghub_transactions"] === "string") {
    try {
      const nested = JSON.parse(o["@orghub_transactions"] as string);
      if (Array.isArray(nested)) return nested;
    } catch {}
  }
  return null;
}

function parseTransactions(textRaw: string): ParseResult {
  const t = textRaw.trim();
  if (!t) return { ok: false, message: "ဖိုင်စာသား မရှိပါ။" };

  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(t);
    const arr = extractTransactionsFromJson(parsed);
    if (arr) rows = arr as Record<string, unknown>[];
  } catch {}

  if (!rows.length) {
    const csvRows = parseCsvRows(t);
    rows = csvRows as Record<string, unknown>[];
  }
  if (!rows.length) return { ok: false, message: "JSON/CSV format မမှန်ပါ။ Excel ကို CSV (UTF-8) အဖြစ် export လုပ်ပါ။" };

  let skipped = 0;
  const normalized = rows
    .map((r, i) => normalizeTransaction(r, i))
    .filter((r) => {
      const ok = Boolean(r);
      if (!ok) skipped += 1;
      return ok;
    }) as any[];

  const byId = new Map<string, any>();
  normalized.forEach((x) => byId.set(x.id, x));
  const transactions = Array.from(byId.values());
  if (!transactions.length) return { ok: false, message: "အသုံးပြုနိုင်သော transaction row မရှိပါ။" };
  return { ok: true, transactions, skipped };
}

function buildBackup(transactions: any[]): string {
  return JSON.stringify(
    {
      type: "transaction_backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      count: transactions.length,
      transactions,
    },
    null,
    2
  );
}

export default function TransactionDataManagementScreen() {
  const insets = useSafeAreaInsets();
  const { transactions, refreshData } = useData() as any;
  const [backupText, setBackupText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);

  const preview = useMemo(() => {
    if (!backupText.trim()) return { count: 0, skipped: 0, error: "" };
    const p = parseTransactions(backupText);
    if (!p.ok) return { count: 0, skipped: 0, error: p.message };
    return { count: p.transactions.length, skipped: p.skipped, error: "" };
  }, [backupText]);

  const busy = processing || importing;

  const msg = (title: string, body: string) => {
    if (Platform.OS === "web") alert(`${title}\n${body}`);
    else Alert.alert(title, body);
  };

  const writeAutoSnapshot = async () => {
    if (Platform.OS === "web") return;
    const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!dir) return;
    const latest = await store.getTransactions();
    await FileSystem.writeAsStringAsync(dir + TXN_AUTO_BACKUP_FILE, buildBackup(latest as any[]));
  };

  const downloadTemplate = async (kind: TemplateKind) => {
    const template = TEMPLATE_FILES[kind];
    const csv = `\uFEFF${template.csv}`;
    if (Platform.OS === "web") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = template.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      msg("Template", `${template.title} CSV ကို download လုပ်ပြီးပါပြီ။`);
      return;
    }
    const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!dir) return msg("Error", "Template file သိမ်းရန် directory မတွေ့ပါ။");
    const uri = dir + template.fileName;
    await FileSystem.writeAsStringAsync(uri, csv);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: `${template.title} CSV ကို share/save လုပ်ပါ`,
      });
    }
  };

  const doBackup = async () => {
    if (busy) return;
    setProcessing(true);
    try {
      const data = buildBackup(transactions || []);
      setBackupText(data);
      if (!transactions?.length) return msg("No Data", "Transaction စာရင်း မရှိသေးပါ။");
      if (Platform.OS === "web") {
        const ts = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
        const blob = new Blob([data], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `transactions_backup_${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
        if (!dir) return msg("Error", "Backup file သိမ်းရန် directory မတွေ့ပါ။");
        const ts = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
        const uri = dir + `transactions_backup_${ts}.json`;
        await FileSystem.writeAsStringAsync(uri, data);
        await FileSystem.writeAsStringAsync(dir + TXN_AUTO_BACKUP_FILE, data);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Transaction backup file ကို share/save လုပ်ပါ", UTI: "public.json" });
      }
    } catch (e) {
      console.error(e);
      msg("Error", "Backup မအောင်မြင်ပါ။");
    } finally {
      setProcessing(false);
    }
  };

  const restoreAuto = async () => {
    if (busy) return;
    if (Platform.OS === "web") return msg("Not Available", "Web မှာ Local Auto-Backup restore မရပါ။");
    setProcessing(true);
    try {
      const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!dir) return msg("Error", "Local backup directory မတွေ့ပါ။");
      for (const uri of [dir + TXN_AUTO_BACKUP_FILE, dir + LEGACY_AUTO_BACKUP_FILE]) {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) continue;
        const content = await FileSystem.readAsStringAsync(uri);
        const p = parseTransactions(content);
        if (!p.ok) continue;
        setBackupText(buildBackup(p.transactions));
        return msg("Loaded", `Auto-Backup မှ Transaction ${p.transactions.length} ခုဖတ်ပြီးပါပြီ။`);
      }
      msg("Not Found", "Transaction Auto-Backup file မတွေ့ပါ။");
    } catch (e) {
      console.error(e);
      msg("Error", "Auto-Backup file ဖတ်မရပါ။");
    } finally {
      setProcessing(false);
    }
  };

  const pickFile = async () => {
    if (busy) return;
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (r.canceled) return;
      const a = r.assets[0];
      const content = Platform.OS === "web" ? await (await fetch(a.uri)).text() : await FileSystem.readAsStringAsync(a.uri);
      setBackupText(content);
    } catch (e) {
      console.error(e);
      msg("Error", "ဖိုင်ဖွင့်မရနိုင်ပါ။");
    }
  };

  const pasteText = async () => {
    if (busy) return;
    const t = await Clipboard.getStringAsync();
    if (!t.trim()) return msg("Clipboard Empty", "Clipboard ထဲတွင် စာသားမရှိပါ။");
    setBackupText(t);
    if (Platform.OS === "android") ToastAndroid.show("Pasted from Clipboard", ToastAndroid.SHORT);
  };

  const applyReplace = async () => {
    const p = parseTransactions(backupText);
    if (!p.ok) return msg("Invalid Data", p.message);
    const run = async () => {
      setImporting(true);
      try {
        await store.saveTransactions(p.transactions);
        await refreshData();
        await writeAutoSnapshot();
        msg("Success", `Restore ပြီးပါပြီ။ ${p.transactions.length} rows သိမ်းခဲ့ပါသည်${p.skipped ? ` (${p.skipped} rows skip)` : ""}။`);
      } finally {
        setImporting(false);
      }
    };
    const question = "လက်ရှိ Transaction စာရင်းအားလုံးကို ဖိုင်ထဲက data ဖြင့် အစားထိုးပါမည်။ သေချာပါသလား။";
    if (Platform.OS === "web") {
      if (confirm(question)) await run();
    } else {
      Alert.alert("Confirm Restore", question, [{ text: "Cancel", style: "cancel" }, { text: "Restore", style: "destructive", onPress: () => void run() }]);
    }
  };

  const applyMerge = async () => {
    const p = parseTransactions(backupText);
    if (!p.ok) return msg("Invalid Data", p.message);
    const run = async () => {
      setImporting(true);
      try {
        await store.importTransactions(p.transactions);
        await refreshData();
        await writeAutoSnapshot();
        msg("Success", `Import ပြီးပါပြီ။ ${p.transactions.length} rows merge လုပ်ခဲ့ပါသည်${p.skipped ? ` (${p.skipped} rows skip)` : ""}။`);
      } finally {
        setImporting(false);
      }
    };
    const question = "ဖိုင်ထဲက Transaction data ကို လက်ရှိစာရင်းထဲသို့ ထည့်သွင်းပါမည် (ID တူပါက update)။ ဆက်လုပ်မည်လား။";
    if (Platform.OS === "web") {
      if (confirm(question)) await run();
    } else {
      Alert.alert("Confirm Import", question, [{ text: "Cancel", style: "cancel" }, { text: "Import", onPress: () => void run() }]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Transaction Data Tools</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.instruction}>Excel ဖိုင်ကို CSV (UTF-8) အဖြစ် export လုပ်ပြီး import လုပ်ပါ။</Text>

          <View style={styles.autoBackupCard}>
            <Text style={styles.cardTitle}>Local Auto Backup (Transactions)</Text>
            <Text style={styles.cardDesc}>Transaction auto-backup ဖိုင်မှ restore လုပ်နိုင်ပါသည်။</Text>
            <Pressable style={styles.restoreAutoBtn} onPress={restoreAuto} disabled={busy}>
              <Text style={styles.restoreAutoText}>Restore from Auto-Backup</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#6366F1", marginBottom: 10, opacity: busy ? 0.7 : 1 }]}
            onPress={doBackup}
            disabled={busy}
          >
            <View style={styles.actionContent}>
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>Backup</Text>
            </View>
          </Pressable>

          <View style={styles.templateCard}>
            <Text style={styles.templateTitle}>Excel Templates (စာရင်းအမျိုးအစားခွဲ)</Text>
            <Text style={styles.templateHint}>
              `member_fees` အတွက် `member_id`, `fee_period_start`, `fee_period_end` ဖြည့်ရန်လိုပါသည်။
              `payer_payee` တွင် Member မဟုတ်သူအမည်လည်း ထည့်နိုင်ပါသည်။
            </Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Pressable
                style={[styles.templateBtn, { backgroundColor: "#0EA5A4" }]}
                onPress={() => void downloadTemplate("income")}
                disabled={busy}
              >
                <Text style={styles.templateBtnText}>ရငွေစာရင်း</Text>
              </Pressable>
              <Pressable
                style={[styles.templateBtn, { backgroundColor: "#F59E0B" }]}
                onPress={() => void downloadTemplate("expense")}
                disabled={busy}
              >
                <Text style={styles.templateBtnText}>အသုံးစာရင်း</Text>
              </Pressable>
              <Pressable
                style={[styles.templateBtn, { backgroundColor: "#8B5CF6" }]}
                onPress={() => void downloadTemplate("transfer")}
                disabled={busy}
              >
                <Text style={styles.templateBtnText}>ဘဏ်သွင်း/ဘဏ်ထုတ်</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <Pressable style={[styles.actionBtn, { backgroundColor: "#8B5CF6", flex: 1, opacity: busy ? 0.7 : 1 }]} onPress={pickFile} disabled={busy}>
              <View style={styles.actionContent}>
                <Ionicons name="document-text-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Select File</Text>
              </View>
            </Pressable>
            <Pressable style={[styles.actionBtn, { backgroundColor: "#059669", flex: 1, opacity: busy ? 0.7 : 1 }]} onPress={pasteText} disabled={busy}>
              <View style={styles.actionContent}>
                <Ionicons name="clipboard-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Paste Text</Text>
              </View>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            multiline
            placeholder="Transaction JSON သို့မဟုတ် CSV စာသားကို ဒီမှာ paste လုပ်ပါ..."
            value={backupText}
            onChangeText={setBackupText}
            textAlignVertical="top"
          />

          {backupText.trim().length > 0 ? (
            <Text style={[styles.previewText, preview.error ? styles.previewError : undefined]}>
              {preview.error || `Detected: ${preview.count} rows${preview.skipped ? `, Skipped: ${preview.skipped}` : ""}`}
            </Text>
          ) : null}

          <Pressable style={[styles.actionBtn, { backgroundColor: "#F59E0B", marginBottom: 10, opacity: busy ? 0.7 : 1 }]} onPress={applyReplace} disabled={busy}>
            <View style={styles.actionContent}>
              <Ionicons name="refresh-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>Restore (Replace All)</Text>
            </View>
          </Pressable>

          <Pressable style={[styles.actionBtn, { backgroundColor: "#0EA5A4", opacity: busy ? 0.7 : 1 }]} onPress={applyMerge} disabled={busy}>
            <View style={styles.actionContent}>
              <Ionicons name="add-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>Import (Add / Update by ID)</Text>
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal transparent animationType="fade" visible={busy} onRequestClose={() => {}}>
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
            <Text style={styles.loadingText}>Processing Transactions...</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  backBtn: { padding: 4 },
  content: { padding: 20, flexGrow: 1 },
  instruction: { fontSize: 13, color: Colors.light.text, marginBottom: 12, fontFamily: "Inter_400Regular", lineHeight: 20 },
  input: {
    flex: 1,
    minHeight: 220,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 12,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 12,
  },
  actionBtn: { paddingVertical: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionContent: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  templateCard: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  templateTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  templateHint: { fontSize: 11, lineHeight: 17, color: Colors.light.textSecondary, fontFamily: "Inter_400Regular" },
  templateBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    opacity: 1,
  },
  templateBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  autoBackupCard: {
    backgroundColor: Colors.light.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 20,
  },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginBottom: 8 },
  cardDesc: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 10, lineHeight: 18 },
  restoreAutoBtn: {
    backgroundColor: Colors.light.background,
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  restoreAutoText: { color: Colors.light.text, fontSize: 13, fontFamily: "Inter_500Medium" },
  previewText: { fontSize: 12, color: Colors.light.tint, marginBottom: 12, fontFamily: "Inter_500Medium" },
  previewError: { color: "#EF4444" },
  loadingOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 20 },
  loadingBox: {
    width: "84%",
    maxWidth: 320,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  loadingText: { marginTop: 12, fontSize: 15, color: Colors.light.text, fontFamily: "Inter_600SemiBold", textAlign: "center" },
});
