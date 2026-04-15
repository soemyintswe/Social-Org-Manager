import React, { useRef } from "react";
import { View, Text, StyleSheet, Image, Pressable, Alert, useWindowDimensions } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useData } from "../../lib/DataContext";
import QRCode from 'react-native-qrcode-svg';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';

const getAvatarLabel = (name: string) => {
  if (!name) return "?";
  let text = name.trim();
  const prefixes = ["ဆရာတော်", "ဦး", "ဒေါ်", "မောင်", "ကို", "မ", "ကိုရင်", "ဦးဇင်း", "ဆရာလေး", "သီလရှင်"];
  prefixes.sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      const remaining = text.slice(prefix.length).trim();
      if (remaining.length > 0) {
        text = remaining;
        break;
      }
    }
  }
  return text.charAt(0).toUpperCase();
};

export default function MemberCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { members } = useData() as any;
  const member = members?.find((m: any) => m.id === id);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const imageRef = useRef<View>(null);
  const [status, requestPermission] = MediaLibrary.usePermissions();

  if (!member) return null;

  const cardWidth = Math.max(320, Math.min(screenWidth - 40, 920));
  const uiScale = Math.max(0.82, Math.min(1.22, cardWidth / 560));
  const avatarSize = Math.round(82 * uiScale);
  const qrSize = Math.round(45 * uiScale);
  const contentGap = Math.max(10, Math.round(14 * uiScale));
  const detailLabelSize = Math.max(9, Math.round(10 * uiScale));
  const detailValueSize = Math.max(11, Math.round(12 * uiScale));
  const nameSize = Math.max(18, Math.round(22 * uiScale));
  const orgNameSize = Math.max(16, Math.round(18 * uiScale));
  const roleSize = Math.max(11, Math.round(12 * uiScale));

  const joinedText = String(member.joinDate || "-");
  const phoneText = String(member.phone || "-");
  const idText = String(member.id || "-");
  const emailText = String(member.email || "-");
  const qrPayload = `ORGHUB_MEMBER:${JSON.stringify({
    type: "ORGHUB_MEMBER_CARD",
    memberId: String(member.id || ""),
    name: String(member.name || ""),
    joinDate: String(member.joinDate || ""),
  })}`;

  const handleSave = async () => {
    try {
      if (!status?.granted) {
        const permission = await requestPermission();
        if (!permission.granted) {
          Alert.alert("Permission required", "Please allow access to save the card.");
          return;
        }
      }

      const localUri = await captureRef(imageRef, {
        quality: 1,
        format: 'png',
      });

      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert("Saved!", "Member card has been saved to your gallery.");
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Failed to save image.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Member Card</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.cardWrapper, { width: cardWidth }]} ref={imageRef} collapsable={false}>
          <LinearGradient
            colors={['#4F46E5', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.card, { padding: Math.max(14, Math.round(20 * uiScale)) }]}
          >
            {/* Card Header */}
            <View style={styles.cardHeader}>
              <View>
                <Text allowFontScaling={false} style={[styles.orgName, { fontSize: orgNameSize }]}>Social Org Manager</Text>
                <Text allowFontScaling={false} style={[styles.cardType, { fontSize: Math.max(9, Math.round(10 * uiScale)) }]}>OFFICIAL MEMBER CARD</Text>
              </View>
              <View style={styles.qrContainer}>
                <QRCode value={qrPayload} size={qrSize} />
              </View>
            </View>

            {/* Card Body */}
            <View style={[styles.cardBody, { marginTop: Math.max(8, Math.round(10 * uiScale)) }]}>
              <View style={[styles.avatarContainer, { marginRight: contentGap }]}>
                {member.profileImage ? (
                  <Image source={{ uri: member.profileImage }} style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: Math.round(avatarSize * 0.15) }]} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: Math.round(avatarSize * 0.15), backgroundColor: '#fff' }]}>
                    <Text allowFontScaling={false} style={{ fontSize: Math.max(24, Math.round(30 * uiScale)), fontWeight: 'bold', color: '#4F46E5' }}>
                      {getAvatarLabel(member.name)}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.infoContainer}>
                <Text allowFontScaling={false} style={[styles.memberName, { fontSize: nameSize }]} numberOfLines={1} adjustsFontSizeToFit>{member.name}</Text>
                <Text allowFontScaling={false} style={[styles.memberRole, { fontSize: roleSize }]}>Member</Text>

                <View style={[styles.divider, { marginVertical: Math.max(6, Math.round(8 * uiScale)) }]} />

                <View style={styles.detailRow}>
                  <Text allowFontScaling={false} style={[styles.detailLabel, { fontSize: detailLabelSize }]}>ID NO</Text>
                  <Text allowFontScaling={false} style={[styles.detailValue, { fontSize: detailValueSize }]} numberOfLines={1}>
                    {idText}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text allowFontScaling={false} style={[styles.detailLabel, { fontSize: detailLabelSize }]}>JOINED</Text>
                  <Text allowFontScaling={false} style={[styles.detailValue, { fontSize: detailValueSize }]} numberOfLines={1}>
                    {joinedText}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text allowFontScaling={false} style={[styles.detailLabel, { fontSize: detailLabelSize }]}>PHONE</Text>
                  <Text allowFontScaling={false} style={[styles.detailValue, { fontSize: detailValueSize }]} numberOfLines={1}>
                    {phoneText}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text allowFontScaling={false} style={[styles.detailLabel, { fontSize: detailLabelSize }]}>EMAIL</Text>
                  <Text allowFontScaling={false} style={[styles.detailValue, { fontSize: detailValueSize }]} numberOfLines={1}>
                    {emailText}
                  </Text>
                </View>
              </View>
            </View>

            {/* Card Footer */}
            <View style={[styles.cardFooter, { marginTop: Math.max(6, Math.round(8 * uiScale)) }]}>
              <Text allowFontScaling={false} style={[styles.footerText, { fontSize: Math.max(9, Math.round(10 * uiScale)) }]}>SCAN TO VERIFY</Text>
            </View>
          </LinearGradient>
        </View>

        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Ionicons name="download-outline" size={20} color="#4F46E5" />
          <Text style={styles.saveBtnText}>Save to Gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  closeBtn: { padding: 4 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  cardWrapper: {
    aspectRatio: 1.586, // Credit card ratio
    borderRadius: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  card: { flex: 1, borderRadius: 16, justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orgName: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },
  cardType: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600', marginTop: 2, letterSpacing: 1 },
  cardBody: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, minHeight: 0 },
  avatarContainer: {},
  avatar: { width: 80, height: 80, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  infoContainer: { flex: 1, minWidth: 0 },
  memberName: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  memberRole: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 10 },
  detailLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' },
  detailValue: { flexShrink: 1, textAlign: 'right', color: '#fff', fontSize: 12, fontWeight: '500' },
  cardFooter: { alignItems: 'center' },
  footerText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: 1 },
  instruction: { color: 'rgba(255,255,255,0.5)', marginTop: 30, fontSize: 14 },
  qrContainer: { backgroundColor: 'white', padding: 4, borderRadius: 6 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30, marginTop: 30 },
  saveBtnText: { color: '#4F46E5', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },
});
