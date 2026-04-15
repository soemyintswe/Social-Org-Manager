import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import Colors from "@/constants/colors";
import { exportData, mergeData, restoreData, sanitizeExportForLanSync } from "@/lib/storage-service";
import { useData } from "@/lib/DataContext";

const TRANSFER_TYPE = "org_hub_transfer_v1";
const QR_PREFIX = "ORGHUBSYNC1";
const QR_CHUNK_SIZE = 650;
const QR_MAX_CHUNKS = 220;

function parseTransferData(text: string): Record<string, string> {
  const parsed = JSON.parse(text) as any;
  if (parsed && parsed.type === TRANSFER_TYPE && parsed.data && typeof parsed.data === "object") {
    return parsed.data as Record<string, string>;
  }
  if (parsed && typeof parsed === "object") {
    const keys = Object.keys(parsed);
    const looksLikeStorage = keys.some((k) => k.startsWith("@orghub_"));
    if (looksLikeStorage) return parsed as Record<string, string>;
  }
  throw new Error("invalid_transfer_payload");
}

function buildQrChunks(payload: string): string[] {
  const encoded = encodeURIComponent(payload);
  const total = Math.ceil(encoded.length / QR_CHUNK_SIZE);
  const session = Date.now().toString(36);
  const chunks: string[] = [];
  for (let i = 0; i < total; i += 1) {
    const part = encoded.slice(i * QR_CHUNK_SIZE, (i + 1) * QR_CHUNK_SIZE);
    chunks.push(`${QR_PREFIX}|${session}|${i + 1}|${total}|${part}`);
  }
  return chunks;
}

export default function PhoneTransferScreen() {
  const insets = useSafeAreaInsets();
  const { refreshData } = useData() as any;
  const [busy, setBusy] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [transferPayload, setTransferPayload] = useState("");
  const [qrChunks, setQrChunks] = useState<string[]>([]);
  const [qrIndex, setQrIndex] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanSession, setScanSession] = useState("");
  const [scanTotal, setScanTotal] = useState(0);
  const [scanParts, setScanParts] = useState<Record<number, string>>({});
  const scanLockRef = useRef(false);

  const scannedCount = useMemo(() => Object.keys(scanParts).length, [scanParts]);

  const createTransferPayload = async (): Promise<string> => {
    const raw = await exportData();
    const data = await sanitizeExportForLanSync(JSON.parse(raw) as Record<string, string>);
    return JSON.stringify({
      type: TRANSFER_TYPE,
      version: 1,
      createdAt: new Date().toISOString(),
      data,
    });
  };

  const applyTransferText = async (text: string) => {
    const data = parseTransferData(text);
    const payload = JSON.stringify(data);
    const ok = replaceMode ? await restoreData(payload) : await mergeData(payload);
    await refreshData();
    Alert.alert(
      "Transfer",
      ok
        ? (replaceMode ? "Replace restore completed." : "Merge import completed.")
        : "Import did not change data."
    );
  };

  const handleShareNearby = async () => {
    setBusy(true);
    try {
      const payload = await createTransferPayload();
      setTransferPayload(payload);
      const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!dir) throw new Error("storage_not_available");
      const fileName = `orghub_transfer_${new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19)}.json`;
      const uri = dir + fileName;
      await FileSystem.writeAsStringAsync(uri, payload, { encoding: FileSystem.EncodingType.UTF8 });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Share မရနိုင်ပါ", "ဒီစက်မှာ share dialog မရနိုင်ပါ။");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: "Nearby Share / Bluetooth / Apps ကိုရွေးပါ",
        UTI: "public.json",
      });
    } catch (e) {
      console.log("share transfer failed", e);
      Alert.alert("Error", "Transfer file share မလုပ်နိုင်ပါ။");
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async () => {
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      await applyTransferText(text);
    } catch (e) {
      console.log("import transfer failed", e);
      Alert.alert("Error", "Transfer file import မအောင်မြင်ပါ။");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateQr = async () => {
    setBusy(true);
    try {
      const payload = transferPayload || (await createTransferPayload());
      setTransferPayload(payload);
      const chunks = buildQrChunks(payload);
      if (chunks.length > QR_MAX_CHUNKS) {
        Alert.alert(
          "QR Transfer ကြီးလွန်းနေပါသည်",
          `Chunks: ${chunks.length}\nQR နဲ့လွှဲရန်ကြာပါမည်။ Nearby Share/File နည်းကိုသုံးပါ။`
        );
        return;
      }
      setQrChunks(chunks);
      setQrIndex(0);
    } catch (e) {
      console.log("qr build failed", e);
      Alert.alert("Error", "QR package မဖန်တီးနိုင်ပါ။");
    } finally {
      setBusy(false);
    }
  };

  const resetScanner = () => {
    setScanSession("");
    setScanTotal(0);
    setScanParts({});
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    setTimeout(() => {
      scanLockRef.current = false;
    }, 350);

    if (!data.startsWith(`${QR_PREFIX}|`)) return;
    const parts = data.split("|");
    if (parts.length < 5) return;
    const session = parts[1];
    const idx = Number(parts[2]);
    const total = Number(parts[3]);
    const payloadPart = parts.slice(4).join("|");
    if (!session || !Number.isFinite(idx) || !Number.isFinite(total) || !payloadPart) return;

    if (scanSession && scanSession !== session) {
      resetScanner();
    }

    setScanSession(session);
    setScanTotal(total);
    setScanParts((prev) => {
      if (prev[idx]) return prev;
      const next = { ...prev, [idx]: payloadPart };
      const count = Object.keys(next).length;
      if (count === total) {
        const merged = Array.from({ length: total }, (_, i) => next[i + 1] || "").join("");
        const decoded = decodeURIComponent(merged);
        setTimeout(async () => {
          try {
            setBusy(true);
            await applyTransferText(decoded);
            setScannerOpen(false);
            resetScanner();
          } catch (e) {
            console.log("qr apply failed", e);
            Alert.alert("Error", "QR data apply မအောင်မြင်ပါ။");
          } finally {
            setBusy(false);
          }
        }, 10);
      }
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Phone-to-Phone Transfer</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mode</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Replace restore (ON) / Merge import (OFF)</Text>
            <Switch value={replaceMode} onValueChange={setReplaceMode} />
          </View>
          <Text style={styles.hint}>
            Replace = လက်ရှိဒေတာအစားထိုးမည်။ Merge = ရှိပြီးသားဒေတာထဲပေါင်းမည်။
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>1) Nearby Share (Wi-Fi/Bluetooth)</Text>
          <Text style={styles.hint}>
            Sender phone မှာ Share နှိပ်ပြီး Nearby Share/Bluetooth/app တစ်ခုခုနဲ့ ပို့ပါ။ Receiver phone မှာ Import File နှိပ်ပါ။
          </Text>
          <View style={styles.btnRow}>
            <Pressable style={styles.primaryBtn} onPress={() => void handleShareNearby()} disabled={busy}>
              <Text style={styles.primaryText}>Share Transfer File</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => void handleImportFile()} disabled={busy}>
              <Text style={styles.secondaryText}>Import File</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>2) QR Transfer</Text>
          <Text style={styles.hint}>
            Sender က QR စာမျက်နှာတွေတစ်ခုပြီးတစ်ခု ပြပါ။ Receiver က Scan QR နှိပ်ပြီး ဆက်တိုက်ဖတ်ပါ။
          </Text>
          <View style={styles.btnRow}>
            <Pressable style={styles.primaryBtn} onPress={() => void handleGenerateQr()} disabled={busy}>
              <Text style={styles.primaryText}>Generate QR</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => setScannerOpen(true)} disabled={busy}>
              <Text style={styles.secondaryText}>Scan QR</Text>
            </Pressable>
          </View>

          {qrChunks.length > 0 ? (
            <View style={styles.qrWrap}>
              <QRCode value={qrChunks[qrIndex]} size={220} />
              <Text style={styles.qrInfo}>Chunk {qrIndex + 1} / {qrChunks.length}</Text>
              <View style={styles.btnRow}>
                <Pressable
                  style={[styles.secondaryBtn, qrIndex <= 0 && styles.btnDisabled]}
                  onPress={() => setQrIndex((v) => Math.max(0, v - 1))}
                  disabled={qrIndex <= 0}
                >
                  <Text style={styles.secondaryText}>Prev</Text>
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, qrIndex >= qrChunks.length - 1 && styles.btnDisabled]}
                  onPress={() => setQrIndex((v) => Math.min(qrChunks.length - 1, v + 1))}
                  disabled={qrIndex >= qrChunks.length - 1}
                >
                  <Text style={styles.secondaryText}>Next</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {busy ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : null}

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={styles.scannerContainer}>
          <View style={[styles.scannerHeader, { paddingTop: insets.top + 10 }]}>
            <Pressable onPress={() => setScannerOpen(false)} style={styles.iconBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
            <Text style={styles.scannerTitle}>Scan Transfer QR</Text>
            <Pressable onPress={resetScanner} style={styles.iconBtn}>
              <Ionicons name="refresh" size={22} color="#fff" />
            </Pressable>
          </View>

          {!permission ? <View style={styles.cameraFallback} /> : null}
          {permission && !permission.granted ? (
            <View style={styles.permissionWrap}>
              <Text style={styles.permissionText}>ကင်မရာခွင့်ပြုချက် လိုအပ်ပါသည်။</Text>
              <Pressable style={styles.primaryBtn} onPress={() => void requestPermission()}>
                <Text style={styles.primaryText}>Grant Permission</Text>
              </Pressable>
            </View>
          ) : null}

          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            />
          ) : null}

          <View style={styles.scannerFooter}>
            <Text style={styles.scannerText}>
              Received: {scannedCount}{scanTotal ? ` / ${scanTotal}` : ""}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowLabel: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.text,
    fontFamily: "Inter_500Medium",
  },
  hint: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#E2E8F0",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: {
    color: Colors.light.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  qrWrap: {
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  qrInfo: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  btnDisabled: {
    opacity: 0.45,
  },
  loading: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(15,23,42,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerHeader: {
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  scannerTitle: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  scannerFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 30,
    alignItems: "center",
  },
  scannerText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  permissionWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  permissionText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  cameraFallback: {
    flex: 1,
    backgroundColor: "#000",
  },
});
