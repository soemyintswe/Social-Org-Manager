import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx-js-style";

export type XlsxSheetData = {
  name: string;
  rows: unknown[][];
  headerRowIndex?: number;
};

type ExportXlsxOptions = {
  sheets: XlsxSheetData[];
  filePrefix: string;
  dialogTitle?: string;
};

function buildTimestamp(): string {
  return new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
}

function sanitizeSheetName(name: string): string {
  const value = String(name || "Sheet1").trim() || "Sheet1";
  return value.replace(/[\\/*?:[\]]/g, "_").slice(0, 31) || "Sheet1";
}

function encodeRange(startRow: number, startCol: number, endRow: number, endCol: number): string {
  return XLSX.utils.encode_range({
    s: { r: startRow, c: startCol },
    e: { r: endRow, c: endCol },
  });
}

function detectHeaderRowIndex(rows: unknown[][]): number | undefined {
  for (let i = 0; i < rows.length; i += 1) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const cells = row.map((v) => String(v ?? "").trim()).filter(Boolean);
    if (cells.length < 3) continue;
    const joined = cells.join(" ").toLowerCase();
    if (
      /\bno\.?\b/.test(joined) ||
      joined.includes("ရက်စွဲ") ||
      joined.includes("အမည်") ||
      joined.includes("အသင်းဝင်") ||
      joined.includes("receipt") ||
      joined.includes("category")
    ) {
      return i;
    }
  }
  return undefined;
}

function buildColWidths(rows: unknown[][]): { wch: number }[] {
  const maxCols = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const widths = Array.from({ length: maxCols }, () => 10);

  rows.forEach((row) => {
    const cells = Array.isArray(row) ? row : [];
    cells.forEach((cell, colIndex) => {
      const text = String(cell ?? "");
      const rawLen = text.length;
      const adjusted = Math.min(48, Math.max(8, Math.ceil(rawLen * 1.05)));
      widths[colIndex] = Math.max(widths[colIndex], adjusted);
    });
  });

  return widths.map((wch) => ({ wch }));
}

function countNonEmptyCells(row: unknown[]): number {
  return row.reduce<number>((count, cell) => (String(cell ?? "").trim() ? count + 1 : count), 0);
}

function buildCellBorder(color = "D7DEE8") {
  return {
    top: { style: "thin", color: { rgb: color } },
    bottom: { style: "thin", color: { rgb: color } },
    left: { style: "thin", color: { rgb: color } },
    right: { style: "thin", color: { rgb: color } },
  };
}

function applyWorksheetFormatting(ws: XLSX.WorkSheet, rows: unknown[][], explicitHeaderRow?: number): void {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const maxCol = range.e.c;
  const maxRow = range.e.r;
  const headerRow = explicitHeaderRow ?? detectHeaderRowIndex(rows);
  const defaultBorder = buildCellBorder();

  ws["!cols"] = buildColWidths(rows);

  if (headerRow !== undefined && headerRow >= 0 && headerRow <= maxRow) {
    ws["!autofilter"] = {
      ref: encodeRange(headerRow, 0, headerRow, maxCol),
    } as any;
  }

  const merges: XLSX.Range[] = [];
  if (maxCol > 0) {
    for (let r = 0; r < Math.min(3, rows.length); r += 1) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      if (row.length === 1) {
        merges.push({ s: { r, c: 0 }, e: { r, c: maxCol } });
      }
    }
  }
  if (merges.length > 0) {
    ws["!merges"] = [...(ws["!merges"] || []), ...merges];
  }

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row = Array.isArray(rows[r]) ? rows[r] : [];
    const nonEmptyCount = countNonEmptyCells(row);
    const isTitleRow = r === 0 && nonEmptyCount === 1;
    const isSubtitleRow = r === 1 && nonEmptyCount === 1;
    const isMetaRow = r === 2 && nonEmptyCount === 1;
    const isSectionRow =
      !isTitleRow &&
      !isSubtitleRow &&
      !isMetaRow &&
      headerRow !== undefined &&
      r < headerRow &&
      nonEmptyCount === 1 &&
      String(row[0] ?? "").trim();

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as any;
      if (!cell) continue;

      const cellValue = cell.v;
      const isNumber = typeof cellValue === "number";
      const baseStyle = {
        border: defaultBorder,
        alignment: {
          horizontal: isNumber ? "right" : "left",
          vertical: "center",
          wrapText: true,
        },
        font: {
          name: "Arial",
          sz: 11,
          color: { rgb: "0F172A" },
        },
      };

      if (typeof cell.v === "number") {
        const isInteger = Number.isInteger(cell.v);
        cell.t = "n";
        cell.z = isInteger ? "#,##0" : "#,##0.00";
      }

      if (isTitleRow) {
        cell.s = {
          ...baseStyle,
          font: { name: "Arial", sz: 16, bold: true, color: { rgb: "0F172A" } },
          fill: { patternType: "solid", fgColor: { rgb: "E6FFFB" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      } else if (isSubtitleRow) {
        cell.s = {
          ...baseStyle,
          font: { name: "Arial", sz: 13, bold: true, color: { rgb: "0F172A" } },
          fill: { patternType: "solid", fgColor: { rgb: "F8FAFC" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      } else if (isMetaRow) {
        cell.s = {
          ...baseStyle,
          font: { name: "Arial", sz: 10, italic: true, color: { rgb: "475569" } },
          fill: { patternType: "solid", fgColor: { rgb: "F8FAFC" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      } else if (isSectionRow) {
        cell.s = {
          ...baseStyle,
          font: { name: "Arial", sz: 12, bold: true, color: { rgb: "0F172A" } },
          fill: { patternType: "solid", fgColor: { rgb: "DBEAFE" } },
          alignment: { horizontal: "left", vertical: "center", wrapText: true },
        };
      } else if (headerRow !== undefined && r === headerRow) {
        cell.s = {
          ...baseStyle,
          font: { name: "Arial", sz: 11, bold: true, color: { rgb: "FFFFFFFF" } },
          fill: { patternType: "solid", fgColor: { rgb: "0EA5A4" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      } else {
        cell.s = {
          ...baseStyle,
          fill: {
            patternType: "solid",
            fgColor: { rgb: r % 2 === 0 ? "FFFFFF" : "F8FAFC" },
          },
        };
      }
    }
  }
}

export async function exportXlsxFile(options: ExportXlsxOptions): Promise<void> {
  const workbook = XLSX.utils.book_new();
  const timestamp = buildTimestamp();
  const fileName = `${options.filePrefix}_${timestamp}.xlsx`;

  (options.sheets || []).forEach((sheet, index) => {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows || []);
    applyWorksheetFormatting(ws, sheet.rows || [], sheet.headerRowIndex);
    const name = sanitizeSheetName(sheet.name || `Sheet${index + 1}`);
    XLSX.utils.book_append_sheet(workbook, ws, name);
  });

  if (Platform.OS === "web") {
    const output = XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true, compression: true });
    const blob = new Blob([output], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!directory) return;

  const fileUri = directory + fileName;
  const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64", cellStyles: true, compression: true });
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: options.dialogTitle || "Excel (.xlsx) ထုတ်ယူရန်",
      UTI: "org.openxmlformats.spreadsheetml.sheet",
    });
  }
}
