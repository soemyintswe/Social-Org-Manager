import React, { useState } from "react";
import { StyleSheet, Text, View, Button, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { MEMBER_STATUS_LABELS, normalizeMemberStatus } from "@/lib/types";

type ParsedMemberCardPayload = {
  memberId: string;
  raw: string;
  source: "plain" | "prefixed" | "json";
  encodedName?: string;
  encodedJoinDate?: string;
};

type VerificationStatus = "official" | "inactive" | "mismatch" | "not_found" | "invalid";

type VerificationResult = {
  status: VerificationStatus;
  message: string;
  member?: any;
  payload?: ParsedMemberCardPayload;
  mismatches?: string[];
};

const parseMemberCardPayload = (data: string): ParsedMemberCardPayload | null => {
  const raw = String(data || "").trim();
  if (!raw) return null;

  const parseJsonPayload = (jsonText: string): ParsedMemberCardPayload | null => {
    try {
      const obj = JSON.parse(jsonText);
      const memberId = String(obj?.memberId || obj?.id || "").trim();
      if (!memberId) return null;
      return {
        memberId,
        raw,
        source: "json",
        encodedName: obj?.name ? String(obj.name).trim() : "",
        encodedJoinDate: obj?.joinDate ? String(obj.joinDate).trim() : "",
      };
    } catch {
      return null;
    }
  };

  if (raw.startsWith("ORGHUB_MEMBER:")) {
    const inner = raw.slice("ORGHUB_MEMBER:".length).trim();
    if (!inner) return null;
    if (inner.startsWith("{")) {
      const parsed = parseJsonPayload(inner);
      if (parsed) return { ...parsed, source: "prefixed" };
    }
    return { memberId: inner, raw, source: "prefixed" };
  }

  if (raw.startsWith("{")) {
    const parsed = parseJsonPayload(raw);
    if (parsed) return parsed;
  }

  return { memberId: raw, raw, source: "plain" };
};

export default function QRScannerScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isMemberVerifyMode = String(mode || "") === "member_verify";
  const { members = [] } = useData() as any;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const insets = useSafeAreaInsets();

  if (!permission) {
    // Camera permissions are still loading.
    return <View style={{flex:1, backgroundColor: '#000'}} />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>ကင်မရာအသုံးပြုခွင့် ပေးရန်လိုအပ်ပါသည်။</Text>
        <Button onPress={requestPermission} title="ခွင့်ပြုမည်" />
        <Button onPress={() => router.back()} title="ပြန်ထွက်မည်" color="#FF3B30" />
      </View>
    );
  }

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    setScanned(true);
    const payload = parseMemberCardPayload(data);

    if (!payload) {
      if (isMemberVerifyMode) {
        setVerificationResult({
          status: "invalid",
          message: "QR Data မမှန်ကန်ပါ။",
        });
      } else {
        setScanned(false);
      }
      return;
    }

    const matchedMember = members.find((member: any) => String(member?.id || "").trim() === payload.memberId);

    if (!isMemberVerifyMode) {
      if (matchedMember?.id) {
        router.replace({ pathname: "/member-detail", params: { id: String(matchedMember.id) } } as any);
      } else {
        setScanned(false);
      }
      return;
    }

    if (!matchedMember) {
      setVerificationResult({
        status: "not_found",
        message: `Member ID (${payload.memberId}) ကို system တွင် မတွေ့ပါ။`,
        payload,
      });
      return;
    }

    const mismatches: string[] = [];
    if (payload.encodedName && String(matchedMember?.name || "").trim() !== String(payload.encodedName || "").trim()) {
      mismatches.push("အမည်");
    }
    if (payload.encodedJoinDate && String(matchedMember?.joinDate || "").trim() !== String(payload.encodedJoinDate || "").trim()) {
      mismatches.push("အသင်းဝင်ရက်");
    }

    const normalizedStatus = normalizeMemberStatus(matchedMember?.status || "active");
    if (normalizedStatus !== "active") {
      setVerificationResult({
        status: "inactive",
        message: `ဤကဒ်သည် Member Status "${MEMBER_STATUS_LABELS[normalizedStatus]}" ဖြစ်နေပါသည်။`,
        member: matchedMember,
        payload,
      });
      return;
    }

    if (mismatches.length > 0) {
      setVerificationResult({
        status: "mismatch",
        message: `QR Data နှင့် system data မကိုက်ညီပါ (${mismatches.join(", ")})။`,
        member: matchedMember,
        payload,
        mismatches,
      });
      return;
    }

    setVerificationResult({
      status: "official",
      message: "OFFICIAL MEMBER အတည်ပြုပြီးပါပြီ။",
      member: matchedMember,
      payload,
    });
  };

  const resetScanner = () => {
    setScanned(false);
    setVerificationResult(null);
  };

  const statusMeta = (() => {
    if (!verificationResult) return { color: "#64748B", icon: "help-circle-outline" as const };
    if (verificationResult.status === "official") return { color: "#059669", icon: "checkmark-circle-outline" as const };
    if (verificationResult.status === "inactive") return { color: "#D97706", icon: "alert-circle-outline" as const };
    if (verificationResult.status === "mismatch") return { color: "#DC2626", icon: "warning-outline" as const };
    if (verificationResult.status === "not_found") return { color: "#334155", icon: "close-circle-outline" as const };
    return { color: "#334155", icon: "help-circle-outline" as const };
  })();

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      />
      
      <View style={[styles.overlay, { paddingTop: insets.top + 20 }]}>
        <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.closeBtn}>
                <Ionicons name="close-circle" size={40} color="#fff" />
            </Pressable>
        </View>
        
        <View style={styles.scanFrameContainer}>
            <Text style={styles.instruction}>
              {isMemberVerifyMode ? "OFFICIAL MEMBER CARD QR Code ကို ဖတ်ပါ" : "Member Card QR Code ကို ဖတ်ပါ"}
            </Text>
            <View style={styles.scanFrame}>
                <View style={styles.cornerTL} />
                <View style={styles.cornerTR} />
                <View style={styles.cornerBL} />
                <View style={styles.cornerBR} />
            </View>
        </View>
      </View>

      {scanned && (
        isMemberVerifyMode ? (
          <View style={styles.resultSheet}>
            <View style={styles.resultHeader}>
              <Ionicons name={statusMeta.icon} size={22} color={statusMeta.color} />
              <Text style={[styles.resultTitle, { color: statusMeta.color }]}>
                {verificationResult?.status === "official"
                  ? "Official Member"
                  : verificationResult?.status === "inactive"
                    ? "Inactive Member"
                    : verificationResult?.status === "mismatch"
                      ? "Data Mismatch"
                      : verificationResult?.status === "not_found"
                        ? "Member Not Found"
                        : "Invalid QR"}
              </Text>
            </View>
            <Text style={styles.resultText}>{verificationResult?.message || "-"}</Text>
            {verificationResult?.member ? (
              <View style={styles.memberInfoCard}>
                <Text style={styles.memberInfoText}>အမည်: {verificationResult.member.name || "-"}</Text>
                <Text style={styles.memberInfoText}>ID: {verificationResult.member.id || "-"}</Text>
                <Text style={styles.memberInfoText}>
                  Status: {MEMBER_STATUS_LABELS[normalizeMemberStatus(verificationResult.member.status || "active")]}
                </Text>
                <Text style={styles.memberInfoText}>Join Date: {verificationResult.member.joinDate || "-"}</Text>
              </View>
            ) : null}
            <View style={styles.resultActions}>
              {verificationResult?.member?.id ? (
                <Pressable
                  style={[styles.resultBtn, styles.resultBtnPrimary]}
                  onPress={() =>
                    router.replace({ pathname: "/member-detail", params: { id: String(verificationResult.member.id) } } as any)
                  }
                >
                  <Text style={styles.resultBtnPrimaryText}>အသေးစိတ်ကြည့်မည်</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.resultBtn, styles.resultBtnGhost]} onPress={resetScanner}>
                <Text style={styles.resultBtnGhostText}>ထပ်မံ Scan</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.rescanContainer}>
              <Button title={"Tap to Scan Again"} onPress={resetScanner} />
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  permissionText: {
    color: '#fff',
    marginBottom: 20,
    fontSize: 16,
    textAlign: 'center'
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  closeBtn: {
    opacity: 0.8
  },
  scanFrameContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  instruction: {
    color: 'white',
    fontSize: 16,
    marginBottom: 30,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    overflow: 'hidden',
  },
  scanFrame: {
    width: 260,
    height: 260,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  cornerTL: { position: 'absolute', top: 0, left: 0, width: 40, height: 40, borderTopWidth: 4, borderLeftWidth: 4, borderColor: '#10B981', borderTopLeftRadius: 20 },
  cornerTR: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderTopWidth: 4, borderRightWidth: 4, borderColor: '#10B981', borderTopRightRadius: 20 },
  cornerBL: { position: 'absolute', bottom: 0, left: 0, width: 40, height: 40, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: '#10B981', borderBottomLeftRadius: 20 },
  cornerBR: { position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderBottomWidth: 4, borderRightWidth: 4, borderColor: '#10B981', borderBottomRightRadius: 20 },
  rescanContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  resultSheet: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 24,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  resultText: {
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 19,
  },
  memberInfoCard: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    gap: 2,
  },
  memberInfoText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  resultActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  resultBtn: {
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  resultBtnPrimary: {
    borderColor: Colors.light.tint,
    backgroundColor: Colors.light.tint,
  },
  resultBtnGhost: {
    borderColor: Colors.light.border,
    backgroundColor: "#fff",
  },
  resultBtnPrimaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  resultBtnGhostText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.light.text,
  },
});
