import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { currentUser, currentMember } = useAuth();
  const {
    users,
    members,
    chatThreads,
    chatMessages,
    createDirectChatThread,
    createGroupChatThread,
    sendChatMessage,
    markChatThreadRead,
  } = useData() as any;

  const meUserId = String(currentUser?.id || "");
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [messageImage, setMessageImage] = useState("");
  const [replyTarget, setReplyTarget] = useState<any>(null);
  const [newModal, setNewModal] = useState(false);
  const [newMode, setNewMode] = useState<"direct" | "group">("direct");
  const [targetUserId, setTargetUserId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupUsers, setGroupUsers] = useState<string[]>([]);

  const myThreads = useMemo(() => {
    const rows = (chatThreads || []).filter((t: any) => (t.participantUserIds || []).includes(meUserId));
    return rows.sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  }, [chatThreads, meUserId]);

  useEffect(() => {
    if (!selectedThreadId && myThreads.length > 0) {
      setSelectedThreadId(myThreads[0].id);
    }
  }, [myThreads, selectedThreadId]);

  const selectedThread = useMemo(
    () => myThreads.find((t: any) => String(t.id) === String(selectedThreadId)),
    [myThreads, selectedThreadId]
  );

  const selectedMessages = useMemo(() => {
    const rows = (chatMessages || []).filter((m: any) => String(m.threadId) === String(selectedThreadId));
    return rows.sort((a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  }, [chatMessages, selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId || !meUserId) return;
    void markChatThreadRead(selectedThreadId, meUserId);
  }, [selectedThreadId, meUserId, markChatThreadRead]);

  const getMemberNameByUserId = (uid: string): string => {
    const user = (users || []).find((u: any) => String(u.id) === String(uid));
    if (!user) return uid;
    if (user.memberId) {
      const m = (members || []).find((row: any) => String(row.id) === String(user.memberId));
      if (m?.name) return String(m.name);
    }
    return String(user.displayName || uid);
  };

  const threadTitle = (thread: any): string => {
    if (!thread) return "";
    if (thread.type === "group") return String(thread.name || "Group");
    const other = (thread.participantUserIds || []).find((id: string) => id !== meUserId);
    return getMemberNameByUserId(other || "");
  };

  const unreadCount = (thread: any): number => {
    const lastRead = String(thread?.lastReadAtBy?.[meUserId] || "");
    return (chatMessages || []).filter((m: any) => {
      if (String(m.threadId) !== String(thread.id)) return false;
      if (String(m.senderUserId) === meUserId) return false;
      if (!lastRead) return true;
      return new Date(m.createdAt || 0).getTime() > new Date(lastRead).getTime();
    }).length;
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.45,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) return;
    const mime = asset.mimeType || "image/jpeg";
    setMessageImage(`data:${mime};base64,${asset.base64}`);
  };

  const handleSend = async () => {
    if (!selectedThreadId || !meUserId) return;
    const text = messageText.trim();
    if (!text && !messageImage) return;
    await sendChatMessage({
      threadId: selectedThreadId,
      senderUserId: meUserId,
      senderMemberId: currentUser?.memberId || currentMember?.id,
      senderDisplayName: currentUser?.displayName || currentMember?.name,
      text,
      image: messageImage || undefined,
      replyToMessageId: replyTarget?.id,
      replyToUserId: replyTarget?.senderUserId,
      replyToDisplayName: replyTarget?.senderDisplayName || replyTarget?.senderMemberId || replyTarget?.senderUserId,
      mentionUserIds: replyTarget?.senderUserId ? [replyTarget.senderUserId] : [],
    });
    setMessageText("");
    setMessageImage("");
    setReplyTarget(null);
    await markChatThreadRead(selectedThreadId, meUserId);
  };

  const handleCreateThread = async () => {
    if (!meUserId) return;
    if (newMode === "direct") {
      if (!targetUserId) {
        Alert.alert("လိုအပ်ချက်", "Member တစ်ဦးရွေးချယ်ပါ။");
        return;
      }
      const thread = await createDirectChatThread({ userAId: meUserId, userBId: targetUserId, createdByUserId: meUserId });
      setSelectedThreadId(thread.id);
      setNewModal(false);
      return;
    }

    const participants = Array.from(new Set([meUserId, ...groupUsers]));
    if (!groupName.trim() || participants.length < 2) {
      Alert.alert("လိုအပ်ချက်", "Group name နှင့် member များရွေးချယ်ပါ။");
      return;
    }
    const thread = await createGroupChatThread({ name: groupName.trim(), participantUserIds: participants, createdByUserId: meUserId });
    setSelectedThreadId(thread.id);
    setGroupName("");
    setGroupUsers([]);
    setNewModal(false);
  };

  const chatCandidates = useMemo(
    () => (users || []).filter((u: any) => u.isActive && String(u.id) !== meUserId),
    [users, meUserId]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Messages</Text>
        <Pressable onPress={() => setNewModal(true)} style={styles.iconBtn}>
          <Ionicons name="add" size={22} color={Colors.light.tint} />
        </Pressable>
      </View>

      <View style={styles.main}>
        <View style={styles.threadCol}>
          <ScrollView>
            {myThreads.map((thread: any) => {
              const active = String(selectedThreadId) === String(thread.id);
              const unread = unreadCount(thread);
              return (
                <Pressable key={thread.id} style={[styles.threadRow, active && styles.threadRowActive]} onPress={() => setSelectedThreadId(thread.id)}>
                  <Text style={styles.threadTitle} numberOfLines={1}>{threadTitle(thread)}</Text>
                  <Text style={styles.threadMeta} numberOfLines={1}>{thread.lastMessageText || "No message yet"}</Text>
                  {unread > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unread}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.chatCol}>
          {!selectedThread ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Chat thread တစ်ခုရွေးပါ</Text>
            </View>
          ) : (
            <>
              <View style={styles.chatHeader}>
                <Text style={styles.chatTitle}>{threadTitle(selectedThread)}</Text>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ padding: 12, gap: 10 }}
              >
                {selectedMessages.map((msg: any) => {
                  const mine = String(msg.senderUserId) === meUserId;
                  return (
                    <View key={msg.id} style={[styles.msgBox, mine ? styles.msgMine : styles.msgOther]}>
                      <Text style={styles.msgSender}>{msg.senderDisplayName || getMemberNameByUserId(msg.senderUserId)}</Text>
                      {msg.replyToDisplayName ? (
                        <Text style={styles.replyTo}>Reply to: {msg.replyToDisplayName}</Text>
                      ) : null}
                      {msg.text ? <Text style={styles.msgText}>{msg.text}</Text> : null}
                      {msg.image ? <Image source={{ uri: msg.image }} style={styles.msgImage} resizeMode="cover" /> : null}
                      <View style={styles.msgFooter}>
                        <Text style={styles.msgDate}>{new Date(msg.createdAt).toLocaleString()}</Text>
                        {!mine && (
                          <Pressable onPress={() => setReplyTarget(msg)}>
                            <Text style={styles.replyAction}>Reply</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              {replyTarget && (
                <View style={styles.replyComposer}>
                  <Text style={styles.replyComposerText}>Reply to: {replyTarget.senderDisplayName || getMemberNameByUserId(replyTarget.senderUserId)}</Text>
                  <Pressable onPress={() => setReplyTarget(null)}>
                    <Text style={styles.replyCancel}>Cancel</Text>
                  </Pressable>
                </View>
              )}

              {messageImage ? (
                <View style={styles.previewRow}>
                  <Image source={{ uri: messageImage }} style={styles.previewImage} />
                  <Pressable onPress={() => setMessageImage("")}>
                    <Text style={styles.replyCancel}>Remove</Text>
                  </Pressable>
                </View>
              ) : null}

              <View
                style={[
                  styles.composer,
                  {
                    paddingBottom: Math.max(insets.bottom, 10) + (Platform.OS === "android" ? keyboardInset : 0),
                    marginBottom: 6,
                  },
                ]}
              >
                <Pressable style={styles.pickBtn} onPress={() => void pickImage()}>
                  <Ionicons name="image-outline" size={18} color={Colors.light.tint} />
                </Pressable>
                <TextInput
                  style={styles.input}
                  value={messageText}
                  onChangeText={setMessageText}
                  placeholder={replyTarget ? "Reply..." : "Type a message..."}
                />
                <Pressable style={styles.sendBtn} onPress={() => void handleSend()}>
                  <Ionicons name="send" size={16} color="#fff" />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>

      <Modal visible={newModal} animationType="slide" transparent onRequestClose={() => setNewModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Message</Text>
            <View style={styles.modeRow}>
              <Pressable style={[styles.modeBtn, newMode === "direct" && styles.modeBtnActive]} onPress={() => setNewMode("direct")}>
                <Text style={[styles.modeText, newMode === "direct" && styles.modeTextActive]}>Direct</Text>
              </Pressable>
              <Pressable style={[styles.modeBtn, newMode === "group" && styles.modeBtnActive]} onPress={() => setNewMode("group")}>
                <Text style={[styles.modeText, newMode === "group" && styles.modeTextActive]}>Group</Text>
              </Pressable>
            </View>

            {newMode === "group" && (
              <TextInput style={styles.modalInput} value={groupName} onChangeText={setGroupName} placeholder="Group name" />
            )}

            <ScrollView style={{ maxHeight: 240 }}>
              {chatCandidates.map((u: any) => {
                const uid = String(u.id);
                const selected = newMode === "direct" ? targetUserId === uid : groupUsers.includes(uid);
                return (
                  <Pressable
                    key={uid}
                    style={[styles.userRow, selected && styles.userRowActive]}
                    onPress={() => {
                      if (newMode === "direct") {
                        setTargetUserId(uid);
                      } else {
                        setGroupUsers((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
                      }
                    }}
                  >
                    <Text style={styles.userText}>{getMemberNameByUserId(uid)}</Text>
                    {selected ? <Ionicons name="checkmark-circle" size={18} color={Colors.light.tint} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable onPress={() => setNewModal(false)}><Text style={styles.cancel}>Cancel</Text></Pressable>
              <Pressable style={styles.createBtn} onPress={() => void handleCreateThread()}>
                <Text style={styles.createText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.surface },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, color: Colors.light.text, fontFamily: "Inter_700Bold" },
  main: { flex: 1, flexDirection: "row" },
  threadCol: { width: "38%", borderRightWidth: 1, borderRightColor: Colors.light.border, backgroundColor: "#fff" },
  chatCol: { width: "62%", backgroundColor: "#F8FAFC" },
  threadRow: { padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  threadRowActive: { backgroundColor: "#ECFEFF" },
  threadTitle: { fontSize: 13, color: Colors.light.text, fontFamily: "Inter_600SemiBold" },
  threadMeta: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 2 },
  badge: { marginTop: 6, alignSelf: "flex-start", backgroundColor: "#EF4444", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { fontSize: 10, color: "#fff", fontFamily: "Inter_700Bold" },
  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.light.textSecondary },
  chatHeader: { padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.border, backgroundColor: "#fff" },
  chatTitle: { fontSize: 14, color: Colors.light.text, fontFamily: "Inter_700Bold" },
  msgBox: { borderRadius: 10, padding: 8, borderWidth: 1 },
  msgMine: { marginLeft: 28, backgroundColor: "#ECFEFF", borderColor: "#A5F3FC" },
  msgOther: { marginRight: 28, backgroundColor: "#fff", borderColor: Colors.light.border },
  msgSender: { fontSize: 11, color: Colors.light.textSecondary, fontFamily: "Inter_600SemiBold" },
  replyTo: { fontSize: 11, color: "#1D4ED8", marginTop: 2 },
  msgText: { fontSize: 13, color: Colors.light.text, marginTop: 4 },
  msgImage: { width: 160, height: 120, borderRadius: 8, marginTop: 6 },
  msgFooter: { marginTop: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  msgDate: { fontSize: 10, color: Colors.light.textSecondary },
  replyAction: { fontSize: 11, color: Colors.light.tint, fontFamily: "Inter_600SemiBold" },
  replyComposer: { paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#EFF6FF", borderTopWidth: 1, borderTopColor: "#BFDBFE" },
  replyComposerText: { fontSize: 12, color: "#1D4ED8" },
  replyCancel: { fontSize: 12, color: "#DC2626", fontFamily: "Inter_600SemiBold" },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingTop: 8 },
  previewImage: { width: 70, height: 52, borderRadius: 8 },
  composer: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: Colors.light.border, backgroundColor: "#fff" },
  pickBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: Colors.light.border, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff" },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.light.tint, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 12 },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 8 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  modeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border },
  modeBtnActive: { backgroundColor: "#E0F2FE", borderColor: "#7DD3FC" },
  modeText: { color: Colors.light.textSecondary, fontSize: 12 },
  modeTextActive: { color: "#0369A1", fontFamily: "Inter_700Bold" },
  modalInput: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  userRow: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: Colors.light.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  userRowActive: { backgroundColor: "#ECFEFF" },
  userText: { color: Colors.light.text, fontSize: 13 },
  modalActions: { marginTop: 10, flexDirection: "row", justifyContent: "flex-end", gap: 10, alignItems: "center" },
  cancel: { color: Colors.light.textSecondary, fontSize: 13 },
  createBtn: { backgroundColor: Colors.light.tint, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  createText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12 },
});
