import React, { useRef } from "react";
import { View, Text, StyleSheet, Image, Pressable, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useData } from "@/lib/DataContext";
import QRCode from 'react-native-qrcode-svg';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import { formatPhoneForDisplay } from "@/lib/member-utils";
import { normalizeOrgPosition, ORG_POSITION_LABELS } from "@/lib/types";

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
  const imageRef = useRef<View>(null);
  const [status, requestPermission] = MediaLibrary.usePermissions();
  const phoneDisplay = formatPhoneForDisplay(member?.phone, (member as any)?.secondaryPhone);
  const orgPositionLabel = ORG_POSITION_LABELS[normalizeOrgPosition((member as any)?.orgPosition || member?.status)];

  if (!member) return null;

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
        <View style={styles.cardWrapper} ref={imageRef} collapsable={false}>
          <LinearGradient
            colors={['#4F46E5', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {/* Card Header */}
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.orgName}>Social Org Manager</Text>
                <Text style={styles.cardType}>OFFICIAL MEMBER CARD</Text>
              </View>
              <View style={styles.qrContainer}>
                <QRCode value={member.id} size={45} />
              </View>
            </View>

            {/* Card Body */}
            <View style={styles.cardBody}>
              <View style={styles.avatarContainer}>
                {member.profileImage ? (
                  <Image source={{ uri: member.profileImage }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: '#fff' }]}>
                    <Text style={{ fontSize: 30, fontWeight: 'bold', color: '#4F46E5' }}>
                      {getAvatarLabel(member.name)}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.infoContainer}>
                <Text style={styles.memberName} numberOfLines={1} adjustsFontSizeToFit>{member.name}</Text>
                <Text style={styles.memberRole}>Member</Text>

                <View style={styles.divider} />

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>ID NO</Text>
                  <Text style={styles.detailValue}>{member.id}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>JOINED</Text>
                  <Text style={styles.detailValue}>{member.joinDate || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>PHONE</Text>
                  <Text style={styles.detailValue}>{phoneDisplay || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>EMAIL</Text>
                  <Text style={styles.detailValue}>{member.email || '-'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>POSITION</Text>
                  <Text style={styles.detailValue}>{orgPositionLabel}</Text>
                </View>
              </View>
            </View>

            {/* Card Footer */}
            <View style={styles.cardFooter}>
              <Text style={styles.footerText}>www.orghub.com</Text>
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
    width: '100%',
    aspectRatio: 1.586, // Credit card ratio
    borderRadius: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  card: { flex: 1, borderRadius: 16, padding: 20, justifyContent: 'space-between' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orgName: { color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },
  cardType: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600', marginTop: 2, letterSpacing: 1 },
  cardBody: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  avatarContainer: { marginRight: 20 },
  avatar: { width: 80, height: 80, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  infoContainer: { flex: 1 },
  memberName: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  memberRole: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  detailLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' },
  detailValue: { color: '#fff', fontSize: 12, fontWeight: '500' },
  cardFooter: { alignItems: 'center', marginTop: 'auto' },
  footerText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: 1 },
  instruction: { color: 'rgba(255,255,255,0.5)', marginTop: 30, fontSize: 14 },
  qrContainer: { backgroundColor: 'white', padding: 4, borderRadius: 6 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30, marginTop: 30 },
  saveBtnText: { color: '#4F46E5', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },
});
