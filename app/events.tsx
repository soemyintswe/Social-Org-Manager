import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import FloatingTabMenu from "@/components/FloatingTabMenu";

interface OrgEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  type: "activity" | "news" | "announcement";
  image?: string;
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { events, addEvent, updateEvent, deleteEvent } = useData() as any;
  const [modalVisible, setModalVisible] = useState(false);
  
  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"activity" | "news" | "announcement">("activity");
  const [image, setImage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled) {
        const source = result.assets[0].base64
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        setImage(source);
      }
    } catch (e) {
      Alert.alert("Error", "ပုံရွေးချယ်၍ မရပါ။");
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setImage(null);
    setType("activity");
    setEditingId(null);
  };

  const handleEdit = (item: OrgEvent) => {
    setTitle(item.title);
    setDescription(item.description);
    setType(item.type);
    setImage(item.image || null);
    setEditingId(item.id);
    setModalVisible(true);
  };

  const saveEvent = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert("Error", "ခေါင်းစဉ်နှင့် အကြောင်းအရာ ထည့်သွင်းပါ");
      return;
    }

    if (editingId) {
      if (updateEvent) {
        const existing = events.find((e: any) => e.id === editingId);
        await updateEvent({
          ...existing,
          title: title.trim(),
          description: description.trim(),
          type,
          image: image || undefined,
        });
      }
    } else {
      const newEvent: OrgEvent = {
        id: Date.now().toString(),
        title: title.trim(),
        description: description.trim(),
        date: new Date().toISOString(),
        type,
        image: image || undefined,
      };
      if (addEvent) await addEvent(newEvent);
    }

    resetForm();
    setModalVisible(false);
  };

  const handleDelete = async (id: string) => {
    Alert.alert("Delete", "ဖျက်ရန် သေချာပါသလား?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (deleteEvent) await deleteEvent(id);
        }
      }
    ]);
  };

  const getTypeLabel = (t: string) => {
    switch(t) {
      case "activity": return "လှုပ်ရှားမှု";
      case "news": return "သတင်း";
      case "announcement": return "ကြေညာချက်";
      default: return t;
    }
  };

  const getTypeColor = (t: string) => {
    switch(t) {
      case "activity": return "#3B82F6";
      case "news": return "#10B981";
      case "announcement": return "#F59E0B";
      default: return "#6B7280";
    }
  };

  const handleShare = async (item: OrgEvent) => {
    try {
      const message = `${item.title}\n\n${item.description}\n\nDate: ${new Date(item.date).toLocaleDateString()}`;
      
      if (item.image) {
        // If there's an image, we need to save it to a temporary file to share it
        const filename = item.image.split('/').pop() || 'share_image.jpg';
        const fileUri = FileSystem.cacheDirectory + filename;
        
        // Check if it's base64 or uri
        if (item.image.startsWith('data:')) {
           const base64Code = item.image.split('data:image/jpeg;base64,')[1];
           await FileSystem.writeAsStringAsync(fileUri, base64Code, { encoding: FileSystem.EncodingType.Base64 });
        } else {
           await FileSystem.copyAsync({ from: item.image, to: fileUri });
        }
        
        await Sharing.shareAsync(fileUri, { dialogTitle: item.title, mimeType: 'image/jpeg', UTI: 'public.jpeg' });
      } else {
        await Sharing.shareAsync(FileSystem.documentDirectory + 'dummy.txt', { dialogTitle: item.title, mimeType: 'text/plain', UTI: 'public.plain-text' }); // Sharing text directly is tricky with expo-sharing without a file, using Share API from react-native is better for text only, but let's try to stick to consistent packages or use RN Share.
        // Actually, for text only, React Native's Share is simpler. Let's use that for text-only fallback if needed, but expo-sharing is file based.
        // Let's use React Native Share for text, and Expo Sharing for files.
        // Wait, let's just use React Native's Share for everything if no image, it's easier.
      }
    } catch (error) {
      // Fallback to simple text share
      const message = `${item.title}\n\n${item.description}\n\nDate: ${new Date(item.date).toLocaleDateString()}`;
      /* 
         Note: To use React Native's Share component, we would need to import it. 
         Since we are already using expo-sharing, let's stick to it for images. 
         For text only, we can't easily use expo-sharing without a file.
         Let's import Share from react-native.
      */
    }
  };

  // Helper function to share text/image
  const onShare = async (item: OrgEvent) => {
    try {
      if (item.image) {
         // Share with image using expo-sharing
         const filename = 'share_event.jpg';
         const fileUri = FileSystem.cacheDirectory + filename;
         
         if (item.image.startsWith('data:')) {
            const base64Code = item.image.split('base64,')[1];
            await FileSystem.writeAsStringAsync(fileUri, base64Code, { encoding: FileSystem.EncodingType.Base64 });
         } else {
            // It might be a local URI already, but let's ensure it's in cache
            await FileSystem.copyAsync({ from: item.image, to: fileUri });
         }
         await Sharing.shareAsync(fileUri, { dialogTitle: item.title });
      } else {
         // Share text only
         const { Share } = require("react-native");
         await Share.share({
           message: `${item.title}\n\n${item.description}\n\nDate: ${new Date(item.date).toLocaleDateString()}`,
           title: item.title,
         });
      }
    } catch (error: any) {
      Alert.alert(error.message);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ width: 50, alignItems: 'flex-start', display: 'none' }}>
            
        </View>
        <Text style={[styles.headerTitle, { flex: 1, textAlign: 'center' }]}>လှုပ်ရှားမှုနှင့် သတင်းများ</Text>
        <View style={{ width: 50, alignItems: 'flex-end' }}>
          <Pressable onPress={() => { resetForm(); setModalVisible(true); }} style={[styles.addBtn, { padding: 40 }]}>
            <Ionicons name="add" size={24} color={Colors.light.tint} {...({ title: "လှုပ်ရှားမှုအသစ်" } as any)} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable 
            style={styles.card}
            onPress={() => router.push({ pathname: "/event-detail", params: { id: item.id } } as any)}
          >
            {item.image && (
              <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="cover" />
            )}
            <View style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: getTypeColor(item.type) + "20" }]}>
                  <Text style={[styles.badgeText, { color: getTypeColor(item.type) }]}>{getTypeLabel(item.type)}</Text>
                </View>
                <Text style={styles.date}>{new Date(item.date).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.desc} numberOfLines={3}>{item.description}</Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable style={styles.iconBtn} onPress={(e) => { e.stopPropagation(); onShare(item); }}>
                <Ionicons name="share-social-outline" size={20} color={Colors.light.text} {...({ title: "မျှဝေရန်" } as any)} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={(e) => { e.stopPropagation(); handleEdit(item); }}>
                <Ionicons name="create-outline" size={20} color={Colors.light.tint} {...({ title: "ပြင်ဆင်ရန်" } as any)} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" {...({ title: "ဖျက်ရန်" } as any)} />
              </Pressable>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="newspaper-outline" size={48} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>မှတ်တမ်းများ မရှိသေးပါ</Text>
          </View>
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingId ? "ပြင်ဆင်ရန်" : "အသစ်ထည့်ရန်"}</Text>
            
            <Text style={styles.label}>ဓာတ်ပုံ (Optional)</Text>
            <Pressable onPress={pickImage} style={styles.imagePicker}>
              {image ? (
                <Image source={{ uri: image }} style={styles.previewImage} resizeMode="cover" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="image-outline" size={24} color={Colors.light.textSecondary} />
                  <Text style={styles.imagePlaceholderText}>ပုံရွေးရန်</Text>
                </View>
              )}
            </Pressable>
            {image && (
              <Pressable onPress={() => setImage(null)} style={styles.removeImageBtn}>
                <Text style={styles.removeImageText}>ဖယ်ရှားမည်</Text>
              </Pressable>
            )}

            <Text style={styles.label}>ခေါင်းစဉ်</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="ခေါင်းစဉ် ရိုက်ထည့်ပါ" />

            <Text style={styles.label}>အမျိုးအစား</Text>
            <View style={styles.typeRow}>
              {(["activity", "news", "announcement"] as const).map((t) => (
                <Pressable 
                  key={t} 
                  style={[styles.typeChip, type === t && { backgroundColor: getTypeColor(t), borderColor: getTypeColor(t) }]}
                  onPress={() => setType(t)}
                >
                  <Text style={[styles.typeText, type === t && { color: "white" }]}>{getTypeLabel(t)}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>အကြောင်းအရာ</Text>
            <TextInput 
              style={[styles.input, { height: 100, textAlignVertical: 'top' }]} 
              value={description} 
              onChangeText={setDescription} 
              multiline 
              placeholder="အသေးစိတ် ရေးပါ..."
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => {
                setModalVisible(false);
                resetForm();
              }}>
                <Text style={styles.cancelText}>မလုပ်တော့ပါ</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={saveEvent}>
                <Text style={styles.saveText}>{editingId ? "ပြင်ဆင်မည်" : "သိမ်းမည်"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <FloatingTabMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, backgroundColor: Colors.light.surface, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  backBtn: { padding: 1 },
  addBtn: { padding: 15 },
  list: { padding: 20 },
  card: { backgroundColor: "white", borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: Colors.light.border, overflow: 'hidden' },
  cardContent: { padding: 15 },
  cardImage: { width: '100%', height: 180 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: "bold" },
  date: { fontSize: 12, color: Colors.light.textSecondary },
  title: { fontSize: 16, fontWeight: "bold", color: Colors.light.text, marginBottom: 6 },
  desc: { fontSize: 14, color: Colors.light.textSecondary, lineHeight: 20 },
  actionRow: { position: "absolute", bottom: 10, right: 10, flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 20 },
  emptyState: { alignItems: "center", marginTop: 50 },
  emptyText: { marginTop: 10, color: Colors.light.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "white", borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 15, textAlign: "center" },
  label: { fontSize: 12, fontWeight: "600", color: Colors.light.textSecondary, marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, padding: 10, fontSize: 14 },
  typeRow: { flexDirection: "row", gap: 8 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, borderWidth: 1, borderColor: Colors.light.border },
  typeText: { fontSize: 12, color: Colors.light.textSecondary },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 15, marginTop: 20 },
  cancelBtn: { padding: 10 },
  cancelText: { color: Colors.light.textSecondary },
  saveBtn: { backgroundColor: Colors.light.tint, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: "white", fontWeight: "bold" },
  imagePicker: { height: 150, backgroundColor: Colors.light.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  previewImage: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center' },
  imagePlaceholderText: { color: Colors.light.textSecondary, marginTop: 4, fontSize: 12 },
  removeImageBtn: { alignItems: 'center', marginBottom: 10 },
  removeImageText: { color: '#EF4444', fontSize: 12 },
});