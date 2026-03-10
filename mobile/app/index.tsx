import React, { useState } from "react";
import { Button, Text, View, ScrollView, Image, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { BACKEND_URL } from "../src/config";

export default function HomeScreen() {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!perm.granted) {
      Alert.alert("Permission required", "Allow photo access to pick an image.");
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!res.canceled) {
      setPhotoUri(res.assets[0].uri);
      setResult(null);
    }
  };

  const upload = async () => {
    if (!photoUri) {
      Alert.alert("No photo", "Pick a photo first.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const form = new FormData();

      form.append("image", {
        uri: photoUri,
        name: "photo.jpg",
        type: "image/jpeg",
      } as any);

      const r = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        body: form,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const text = await r.text();

      let json;

      try {
        json = JSON.parse(text);
      } catch {
        json = { error: "Non‑JSON response", status: r.status, body: text };
      }

      setResult(json);

    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20, paddingTop: 60 }}>
      <Text style={{ fontSize: 18, fontWeight: "bold" }}>
        Fashion AI — Phase 1
      </Text>

      <Text style={{ marginTop: 6, color: "#666" }}>
        Backend: {BACKEND_URL}
      </Text>

      <View style={{ height: 16 }} />

      <Button title="Pick photo" onPress={pickImage} />

      <View style={{ height: 10 }} />

      <Button
        title={loading ? "Uploading..." : "Upload to /analyze"}
        onPress={upload}
        disabled={loading}
      />

      {photoUri && (
        <>
          <View style={{ height: 16 }} />
          <Image
            source={{ uri: photoUri }}
            style={{ width: "100%", height: 260, borderRadius: 12 }}
          />
        </>
      )}

      <View style={{ height: 16 }} />

      <Text style={{ fontWeight: "bold" }}>Response:</Text>

      <ScrollView style={{ marginTop: 8 }}>
        <Text selectable>
          {result ? JSON.stringify(result, null, 2) : "(no response yet)"}
        </Text>
      </ScrollView>
    </View>
  );
}