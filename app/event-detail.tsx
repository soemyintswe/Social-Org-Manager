import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";

interface OrgEventNotice {
  id: string;
  title: string;
  description: string;
  date: string;
  type: "activity" | "news" | "announcement";
  image?: string;
  images?: string[];
  senderName?: string;
  senderMemberId?: string;
  senderPhone?: string;
  senderDate?: string;
  senderTime?: string;
  summary?: string;
  detail?: string;
  topic?: string;
  subjectMemberName?: string;
  subjectMemberId?: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  eventLocationMapUrl?: string;
  healthPatientName?: string;
  healthPatientMemberId?: string;
  healthPatientAge?: string;
  healthRelation?: string;
  healthIllnessSummary?: string;
  healthCondition?: string;
  healthTreatmentType?: "hospital" | "clinic_home";
  healthFacilityName?: string;
  healthFacilityLocation?: string;
  healthFacilityMapUrl?: string;
  healthStartDate?: string;
  healthEndDate?: string;
  healthProgressStatus?: "ကုသပြီး" | "ကုသနေဆဲ";
  funeralDeceasedName?: string;
  funeralAge?: string;
  funeralDeceasedDate?: string;
  funeralRelation?: string;
  funeralIllnessSummary?: string;
  funeralBurialDate?: string;
  funeralBurialTime?: string;
  funeralCemetery?: string;
  funeralCemeteryMapUrl?: string;
  funeralTransportLocation?: string;
  funeralTransportMapUrl?: string;
  funeralTransportDate?: string;
  funeralTransportTime?: string;
  funeralMemorialLocation?: string;
  funeralMemorialMapUrl?: string;
  funeralMemorialDate?: string;
  funeralMemorialTime?: string;
  readBy?: Record<string, { userId: string; memberId?: string; displayName?: string; readAt: string }>;
  reactions?: Record<string, "like" | "love" | "sad">;
  comments?: {
    id: string;
    userId: string;
    memberId?: string;
    displayName?: string;
    message: string;
    image?: string;
    createdAt: string;
    updatedAt?: string;
    editedAt?: string;
    deletedAt?: string;
    deletedByUserId?: string;
    isDeleted?: boolean;
    replyToCommentId?: string;
    replyToUserId?: string;
    replyToDisplayName?: string;
    mentionUserIds?: string[];
  }[];
}

function getTopicColor(topic?: string): string {
  if (!topic) return "#6B7280";
  if (topic.includes("အလှူ")) return "#3B82F6";
  if (topic.includes("မင်္ဂလာ")) return "#EC4899";
  if (topic.includes("ကျန်းမာရေး")) return "#10B981";
  if (topic.includes("နာရေး")) return "#EF4444";
  if (topic.includes("အခြား")) return "#F59E0B";
  return "#0EA5A4";
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const { members, users, events, editEvent } = useData() as any;
  const [commentText, setCommentText] = useState("");
  const [commentImage, setCommentImage] = useState("");
  const [editingCommentId, setEditingCommentId] = useState("");
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{
    commentId: string;
    userId: string;
    displayName?: string;
  } | null>(null);

  const actorUserId = String(currentUser?.id || "");
  const actorDisplayName = String(currentUser?.displayName || "");
  const actorMemberId = String(currentUser?.memberId || "");

  const event = useMemo(
    () => ((events || []).find((item: any) => String(item?.id) === String(id)) as OrgEventNotice | undefined) || null,
    [events, id]
  );
  const loading = !Array.isArray(events);

  useEffect(() => {
    (async () => {
      if (!event || !actorUserId) return;
      const already = !!event.readBy?.[actorUserId];
      if (already) return;
      await editEvent(String(id), {
        readBy: {
          ...(event.readBy || {}),
          [actorUserId]: {
            userId: actorUserId,
            memberId: actorMemberId || undefined,
            displayName: actorDisplayName || undefined,
            readAt: new Date().toISOString(),
          },
        },
      });
    })();
  }, [id, event, actorUserId, actorMemberId, actorDisplayName, editEvent]);

  const images = useMemo(() => {
    if (!event) return [] as string[];
    if (Array.isArray(event.images) && event.images.length) return event.images;
    if (event.image) return [event.image];
    return [] as string[];
  }, [event]);

  const reactionSummary = useMemo(() => {
    const reactions = event?.reactions || {};
    let like = 0;
    let love = 0;
    let sad = 0;
    Object.values(reactions).forEach((value) => {
      if (value === "like") like += 1;
      if (value === "love") love += 1;
      if (value === "sad") sad += 1;
    });
    return { like, love, sad, mine: actorUserId ? reactions[actorUserId] : undefined };
  }, [event?.reactions, actorUserId]);

  const readStatusRows = useMemo(() => {
    const readBy = event?.readBy || {};
    const activeMembers = (members || []).filter((m: any) => String(m?.status || "") === "active");
    return activeMembers.map((member: any) => {
      const matchedUser = (users || []).find((u: any) => u.memberId === member.id && u.isActive);
      const matchedRead = matchedUser?.id ? readBy[matchedUser.id] : undefined;
      return {
        memberId: member.id,
        name: member.name,
        readAt: matchedRead?.readAt || "",
      };
    });
  }, [event?.readBy, members, users]);

  const handleReact = async (reaction: "like" | "love" | "sad") => {
    if (!actorUserId || !event) {
      return;
    }
    const current = event.reactions || {};
    const mine = current[actorUserId];
    const next = { ...current };
    if (mine === reaction) delete next[actorUserId];
    else next[actorUserId] = reaction;
    await editEvent(String(id), { reactions: next });
  };

  const handleSendComment = async () => {
    const msg = commentText.trim();
    if (!msg && !commentImage) return;
    if (!actorUserId || !event) return;
    if (isSendingComment) return;
    const comments = event.comments || [];
    const now = new Date().toISOString();
    const draftText = commentText;
    const draftImage = commentImage;
    const draftReply = replyTarget;
    const draftEditingId = editingCommentId;

    setIsSendingComment(true);
    setCommentText("");
    setCommentImage("");
    setEditingCommentId("");
    setReplyTarget(null);

    if (editingCommentId) {
      const next = comments.map((comment) => {
        if (String(comment.id || "") !== String(editingCommentId || "")) return comment;
        if (String(comment.userId || "") !== actorUserId) return comment;
        return {
          ...comment,
          message: msg,
          image: draftImage || undefined,
          updatedAt: now,
          editedAt: now,
        };
      });
      try {
        await editEvent(String(id), { comments: next });
      } catch (error) {
        setCommentText(draftText);
        setCommentImage(draftImage);
        setReplyTarget(draftReply);
        setEditingCommentId(draftEditingId);
        Alert.alert("Error", "Comment ပို့မရပါ။ Network ကိုစစ်ပြီး ထပ်မံကြိုးစားပါ။");
      } finally {
        setIsSendingComment(false);
      }
    } else {
      const mentionUserIds = draftReply?.userId ? [draftReply.userId] : [];
      try {
        await editEvent(String(id), {
          comments: [
            ...comments,
            {
              id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              userId: actorUserId,
              memberId: actorMemberId || undefined,
              displayName: actorDisplayName || undefined,
              message: msg,
              image: draftImage || undefined,
              createdAt: now,
              replyToCommentId: draftReply?.commentId,
              replyToUserId: draftReply?.userId,
              replyToDisplayName: draftReply?.displayName,
              mentionUserIds,
            },
          ],
        });
      } catch (error) {
        setCommentText(draftText);
        setCommentImage(draftImage);
        setReplyTarget(draftReply);
        Alert.alert("Error", "Comment ပို့မရပါ။ Network ကိုစစ်ပြီး ထပ်မံကြိုးစားပါ။");
      } finally {
        setIsSendingComment(false);
      }
    }
  };

  const pickCommentImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) return;
    const mime = asset.mimeType || "image/jpeg";
    setCommentImage(`data:${mime};base64,${asset.base64}`);
  };

  const startEditComment = (comment: any) => {
    setEditingCommentId(String(comment?.id || ""));
    setCommentText(String(comment?.message || ""));
    setCommentImage(String(comment?.image || ""));
    setReplyTarget(null);
  };

  const cancelEditComment = () => {
    setEditingCommentId("");
    setCommentText("");
    setCommentImage("");
  };

  const handleDeleteComment = async (comment: any) => {
    if (!event || !actorUserId) return;
    const commentId = String(comment?.id || "");
    if (!commentId) return;
    Alert.alert("ဖျက်မည်", "ဤမှတ်ချက်ကို ဖျက်မည်လား?", [
      { text: "မဖျက်တော့ပါ", style: "cancel" },
      {
        text: "ဖျက်မည်",
        style: "destructive",
        onPress: () => {
          const comments = event.comments || [];
          const now = new Date().toISOString();
          const next = comments.map((row) => {
            if (String(row?.id || "") !== commentId) return row;
            if (String(row?.userId || "") !== actorUserId) return row;
            return {
              ...row,
              message: "ဤမှတ်ချက်ကို ဖျက်ပြီးပါပြီ။",
              image: undefined,
              isDeleted: true,
              deletedAt: now,
              deletedByUserId: actorUserId,
              updatedAt: now,
            };
          });
          void editEvent(String(id), { comments: next });
          if (editingCommentId === commentId) {
            cancelEditComment();
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>သတင်းမတွေ့ပါ</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>နောက်သို့ပြန်ရန်</Text>
        </Pressable>
      </View>
    );
  }

  const topic = event.topic || event.title;
  const topicColor = getTopicColor(topic);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>သတင်းအသေးစိတ်</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.imageRow}>
              {images.map((img, idx) => (
                <Image key={`${img.slice(0, 16)}-${idx}`} source={{ uri: img }} style={styles.image} resizeMode="cover" />
              ))}
            </View>
          </ScrollView>
        )}

        <View style={styles.body}>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: `${topicColor}20` }]}>
              <Text style={[styles.badgeText, { color: topicColor }]}>{topic}</Text>
            </View>
            <Text style={styles.date}>{event.senderDate || new Date(event.date).toLocaleDateString()} {event.senderTime || ""}</Text>
          </View>

          <Text style={styles.summaryTitle}>အကျဉ်းချုပ်</Text>
          <Text style={styles.summaryText}>{event.summary || event.title}</Text>

          {(event.subjectMemberName || event.subjectMemberId) && (
            <View style={styles.scheduleBox}>
              <Text style={styles.scheduleTitle}>သက်ဆိုင်သည့် အသင်းဝင်</Text>
              <Text style={styles.scheduleText}>အမည်: {event.subjectMemberName || "-"}</Text>
              <Text style={styles.scheduleText}>အသင်းဝင်အမှတ်: {event.subjectMemberId || "-"}</Text>
            </View>
          )}

          <Text style={styles.summaryTitle}>အပြည့်အစုံ</Text>
          <Text style={styles.description}>{event.detail || event.description}</Text>

          {(event.eventDate || event.eventTime || event.eventLocation) && (
            <View style={styles.scheduleBox}>
              <Text style={styles.scheduleTitle}>ကျင်းပမှုအချက်အလက်</Text>
              <Text style={styles.scheduleText}>နေ့ရက်: {event.eventDate || "-"}</Text>
              <Text style={styles.scheduleText}>အချိန်: {event.eventTime || "-"}</Text>
              <Text style={styles.scheduleText}>နေရာ: {event.eventLocation || "-"}</Text>
              <Text style={styles.scheduleText}>Map URL: {event.eventLocationMapUrl || "-"}</Text>
            </View>
          )}

          {topic.includes("ကျန်းမာရေး") && (
            <View style={styles.scheduleBox}>
              <Text style={styles.scheduleTitle}>ကျန်းမာရေးအခြေအနေအသေးစိတ်</Text>
              <Text style={styles.scheduleText}>တော်စပ်ပုံ: {event.healthRelation || "-"}</Text>
              <Text style={styles.scheduleText}>နာမကျန်းဖြစ်သူအမည်: {event.healthPatientName || "-"}</Text>
              <Text style={styles.scheduleText}>အသင်းဝင်အမှတ်: {event.healthPatientMemberId || "-"}</Text>
              <Text style={styles.scheduleText}>အသက်: {event.healthPatientAge || "-"}</Text>
              <Text style={styles.scheduleText}>ရောဂါအမျိုးဖြစ်စဉ်အကျဉ်း: {event.healthIllnessSummary || "-"}</Text>
              <Text style={styles.scheduleText}>ရောဂါအခြေအနေ: {event.healthCondition || "-"}</Text>
              <Text style={styles.scheduleText}>
                ကုသမှုအခြေအနေ: {event.healthTreatmentType === "clinic_home" ? "ဆေးခန်း/အိမ်တွင်ကုသ" : "ဆေးရုံတက်ရောက်"}
              </Text>
              <Text style={styles.scheduleText}>ဆေးရုံ/ဆေးခန်းအမည်: {event.healthFacilityName || "-"}</Text>
              <Text style={styles.scheduleText}>တည်နေရာ: {event.healthFacilityLocation || "-"}</Text>
              <Text style={styles.scheduleText}>Map URL: {event.healthFacilityMapUrl || "-"}</Text>
              <Text style={styles.scheduleText}>စတင်ကုသသည့်နေ့: {event.healthStartDate || "-"}</Text>
              <Text style={styles.scheduleText}>အခြေအနေ: {event.healthProgressStatus || "-"}</Text>
              <Text style={styles.scheduleText}>ပြီးဆုံး/ဆင်းသည့်နေ့: {event.healthEndDate || "-"}</Text>
            </View>
          )}

          {topic.includes("နာရေး") && (
            <View style={styles.scheduleBox}>
              <Text style={styles.scheduleTitle}>နာရေးအသေးစိတ်</Text>
              <Text style={styles.scheduleText}>တော်စပ်ပုံ: {event.funeralRelation || "-"}</Text>
              <Text style={styles.scheduleText}>ကွယ်လွန်သူအမည်: {event.funeralDeceasedName || "-"}</Text>
              <Text style={styles.scheduleText}>အသက်: {event.funeralAge || "-"}</Text>
              <Text style={styles.scheduleText}>ကွယ်လွန်သည့်နေ့ရက်: {event.funeralDeceasedDate || "-"}</Text>
              <Text style={styles.scheduleText}>ရောဂါအမျိုးအစားဖြစ်စဉ်အကျဉ်း: {event.funeralIllnessSummary || "-"}</Text>
              <Text style={styles.scheduleText}>သင်္ဂြိုလ်မည့်နေ့ရက်: {event.funeralBurialDate || "-"}</Text>
              <Text style={styles.scheduleText}>သင်္ဂြိုလ်မည့်အချိန်: {event.funeralBurialTime || "-"}</Text>
              <Text style={styles.scheduleText}>သင်္ဂြိုလ်မည့်သုဿာန်: {event.funeralCemetery || "-"}</Text>
              <Text style={styles.scheduleText}>သုဿာန် Map URL: {event.funeralCemeteryMapUrl || "-"}</Text>
              <Text style={styles.scheduleText}>ကြို/ပို့ယာဉ်ထွက်ခွာနေရာ: {event.funeralTransportLocation || "-"}</Text>
              <Text style={styles.scheduleText}>ကြို/ပို့ Map URL: {event.funeralTransportMapUrl || "-"}</Text>
              <Text style={styles.scheduleText}>ကြို/ပို့ယာဉ်နေ့ရက်: {event.funeralTransportDate || "-"}</Text>
              <Text style={styles.scheduleText}>ကြို/ပို့ယာဉ်အချိန်: {event.funeralTransportTime || "-"}</Text>
              <Text style={styles.scheduleText}>ရက်လည်ကျင်းပမည့်နေရာ: {event.funeralMemorialLocation || "-"}</Text>
              <Text style={styles.scheduleText}>ရက်လည် Map URL: {event.funeralMemorialMapUrl || "-"}</Text>
              <Text style={styles.scheduleText}>ရက်လည်နေ့ရက်: {event.funeralMemorialDate || "-"}</Text>
              <Text style={styles.scheduleText}>ရက်လည်အချိန်: {event.funeralMemorialTime || "-"}</Text>
            </View>
          )}

          <View style={styles.senderBox}>
            <Text style={styles.senderText}>သတင်းပေးပို့သူ: {event.senderName || "-"}</Text>
            <Text style={styles.senderText}>အဖွဲ့ဝင် ID: {event.senderMemberId || "-"}</Text>
            <Text style={styles.senderText}>ဖုန်း: {event.senderPhone || "-"}</Text>
          </View>

          <View style={styles.scheduleBox}>
            <Text style={styles.scheduleTitle}>Reactions</Text>
            <View style={styles.reactionRow}>
              <Pressable style={[styles.reactBtn, reactionSummary.mine === "like" && styles.reactBtnActive]} onPress={() => void handleReact("like")}>
                <Text style={styles.reactText}>👍 {reactionSummary.like}</Text>
              </Pressable>
              <Pressable style={[styles.reactBtn, reactionSummary.mine === "love" && styles.reactBtnActive]} onPress={() => void handleReact("love")}>
                <Text style={styles.reactText}>❤️ {reactionSummary.love}</Text>
              </Pressable>
              <Pressable style={[styles.reactBtn, reactionSummary.mine === "sad" && styles.reactBtnActive]} onPress={() => void handleReact("sad")}>
                <Text style={styles.reactText}>😢 {reactionSummary.sad}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.scheduleBox}>
            <Text style={styles.scheduleTitle}>Comments</Text>
            {replyTarget && (
              <View style={styles.replyBox}>
                <Text style={styles.replyText}>Reply to: {replyTarget.displayName || replyTarget.userId}</Text>
                <Pressable onPress={() => setReplyTarget(null)}>
                  <Text style={styles.replyCancel}>Cancel</Text>
                </Pressable>
              </View>
            )}
            {editingCommentId ? (
              <View style={styles.editBox}>
                <Text style={styles.replyText}>Editing comment...</Text>
                <Pressable onPress={cancelEditComment}>
                  <Text style={styles.replyCancel}>Cancel Edit</Text>
                </Pressable>
              </View>
            ) : null}
            {commentImage ? (
              <View style={styles.commentPreviewRow}>
                <Image source={{ uri: commentImage }} style={styles.commentPreviewImage} />
                <Pressable onPress={() => setCommentImage("")}>
                  <Text style={styles.replyCancel}>Remove Image</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.commentInputRow}>
              <Pressable style={styles.commentImageBtn} onPress={() => void pickCommentImage()}>
                <Ionicons name="image-outline" size={16} color={Colors.light.tint} />
              </Pressable>
              <TextInput
                style={styles.commentInput}
                value={commentText}
                onChangeText={setCommentText}
                placeholder={
                  editingCommentId
                    ? "Caption/မှတ်ချက် ပြင်ရန်..."
                    : commentImage
                      ? "Caption (optional)"
                      : replyTarget
                        ? "Reply ကိုရေးပါ..."
                        : "မှတ်ချက်ရေးပါ..."
                }
              />
              <Pressable
                style={[styles.commentSendBtn, isSendingComment && styles.commentSendBtnDisabled]}
                onPress={() => void handleSendComment()}
                disabled={isSendingComment}
              >
                {isSendingComment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name={editingCommentId ? "checkmark" : "send"} size={16} color="#fff" />
                )}
              </Pressable>
            </View>
            {(event.comments || []).length === 0 ? (
              <Text style={styles.scheduleText}>မှတ်ချက်မရှိသေးပါ။</Text>
            ) : (
              (event.comments || []).map((comment) => (
                <View key={comment.id} style={styles.commentItem}>
                  <Text style={styles.commentAuthor}>{comment.displayName || comment.memberId || comment.userId}</Text>
                  {comment.replyToDisplayName ? (
                    <Text style={styles.commentReplyTo}>Reply to: {comment.replyToDisplayName}</Text>
                  ) : null}
                  <Text style={[styles.commentBody, comment.isDeleted && styles.deletedCommentBody]}>{comment.message}</Text>
                  {comment.image ? <Image source={{ uri: comment.image }} style={styles.commentImage} resizeMode="cover" /> : null}
                  <Text style={styles.commentDate}>{new Date(comment.createdAt).toLocaleString()}</Text>
                  {comment.editedAt ? <Text style={styles.commentEditMeta}>Edited</Text> : null}
                  {!comment.isDeleted ? (
                    comment.userId !== actorUserId ? (
                      <Pressable
                        style={styles.replyBtn}
                        onPress={() => setReplyTarget({
                          commentId: comment.id,
                          userId: comment.userId,
                          displayName: comment.displayName || comment.memberId || comment.userId,
                        })}
                      >
                        <Text style={styles.replyBtnText}>Reply</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.commentActionRow}>
                        <Pressable style={styles.replyBtn} onPress={() => startEditComment(comment)}>
                          <Text style={styles.replyBtnText}>Edit</Text>
                        </Pressable>
                        <Pressable style={styles.deleteBtn} onPress={() => void handleDeleteComment(comment)}>
                          <Text style={styles.deleteBtnText}>Delete</Text>
                        </Pressable>
                      </View>
                    )
                  ) : null}
                </View>
              ))
            )}
          </View>

          <View style={styles.scheduleBox}>
            <Text style={styles.scheduleTitle}>ဖတ်ရှု့မှုအခြေအနေ (Members)</Text>
            {readStatusRows.length === 0 ? (
              <Text style={styles.scheduleText}>အသင်းဝင်စာရင်း မရှိသေးပါ။</Text>
            ) : (
              readStatusRows.map((row: any) => (
                <View key={row.memberId} style={styles.readRow}>
                  <Text style={styles.scheduleText}>{row.name}</Text>
                  <Text style={[styles.scheduleText, { color: row.readAt ? "#16A34A" : "#F59E0B" }]}>
                    {row.readAt ? `Read: ${new Date(row.readAt).toLocaleString()}` : "Unread"}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerBackBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  content: { paddingBottom: 40 },
  imageRow: { flexDirection: "row", gap: 10, padding: 12 },
  image: { width: 280, height: 180, borderRadius: 12 },
  body: { padding: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, maxWidth: "72%" },
  badgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  date: { fontSize: 13, color: Colors.light.textSecondary },
  summaryTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.light.text, marginTop: 8, marginBottom: 6 },
  summaryText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text, lineHeight: 24 },
  description: { fontSize: 15, lineHeight: 23, color: Colors.light.text, marginTop: 2 },
  scheduleBox: { marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: Colors.light.border },
  scheduleTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 6 },
  scheduleText: { fontSize: 13, color: Colors.light.textSecondary, lineHeight: 20 },
  senderBox: { marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: "#ECFEFF", borderWidth: 1, borderColor: "#A5F3FC" },
  senderText: { fontSize: 13, color: "#0F766E", lineHeight: 20 },
  reactionRow: { flexDirection: "row", gap: 8 },
  reactBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  reactBtnActive: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
  },
  reactText: { fontSize: 13, color: Colors.light.text, fontFamily: "Inter_600SemiBold" },
  editBox: {
    borderWidth: 1,
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  commentPreviewRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  commentPreviewImage: { width: 64, height: 48, borderRadius: 8 },
  commentInputRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  commentImageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  commentSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  commentSendBtnDisabled: { opacity: 0.7 },
  commentItem: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  replyBox: {
    borderWidth: 1,
    borderColor: "#BAE6FD",
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  replyText: { fontSize: 12, color: "#1D4ED8", fontFamily: "Inter_600SemiBold" },
  replyCancel: { fontSize: 12, color: "#DC2626", fontFamily: "Inter_600SemiBold" },
  commentAuthor: { fontSize: 12, color: Colors.light.text, fontFamily: "Inter_600SemiBold" },
  commentReplyTo: { fontSize: 11, color: "#1D4ED8", marginTop: 2 },
  commentBody: { fontSize: 13, color: Colors.light.text, marginTop: 2 },
  deletedCommentBody: { color: Colors.light.textSecondary, fontStyle: "italic" },
  commentImage: { width: 160, height: 120, borderRadius: 8, marginTop: 6 },
  commentDate: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 2 },
  commentEditMeta: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 2 },
  commentActionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  replyBtn: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#EEF2FF" },
  replyBtnText: { fontSize: 11, color: "#3730A3", fontFamily: "Inter_600SemiBold" },
  deleteBtn: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FEE2E2" },
  deleteBtnText: { fontSize: 11, color: "#B91C1C", fontFamily: "Inter_600SemiBold" },
  readRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  errorText: { fontSize: 16, color: Colors.light.textSecondary, marginBottom: 10 },
  backButton: { padding: 10 },
  backButtonText: { color: Colors.light.tint, fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
