import React, { useState } from "react";
import { StyleSheet, Text, View, Button, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
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
    // QR Code ထဲမှာ Member ID ပါတယ်လို့ ယူဆပြီး Detail ကို ပို့ပါမယ်
    router.replace({ pathname: "/member-detail", params: { id: data } } as any);
  };

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
            <Text style={styles.instruction}>Member Card QR Code ကို ဖတ်ပါ</Text>
            <View style={styles.scanFrame}>
                <View style={styles.cornerTL} />
                <View style={styles.cornerTR} />
                <View style={styles.cornerBL} />
                <View style={styles.cornerBR} />
            </View>
        </View>
      </View>

      {scanned && (
        <View style={styles.rescanContainer}>
            <Button title={"Tap to Scan Again"} onPress={() => setScanned(false)} />
        </View>
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
  }
});