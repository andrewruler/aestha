import React, { useState } from "react";
import { Button, Text, View, ScrollView, Image, Alert, ActivityIndicator, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { BACKEND_URL } from "../src/config";

export default function HomeScreen() {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!res.canceled) {
      const asset = res.assets[0];
      setPhotoUri(asset.uri);
      setPhotoFile("file" in asset && asset.file ? asset.file : null);
      setResult(null);
    }
  };

  const upload = async () => {
    if (!photoUri) return Alert.alert("Hold up", "Pick a photo first!");
    
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    if (Platform.OS === "web" && photoFile) {
      formData.append("image", photoFile);
    } else {
      formData.append("image", {
        uri: photoUri,
        name: "upload.jpg",
        type: "image/jpeg",
      } as any);
    }

    try {
      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
          // Do NOT set Content-Type: fetch sets multipart/form-data with boundary automatically
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        setResult({ error: `HTTP ${response.status}`, details: errorText });
        return;
      }

      const json = await response.json();
      setResult(json);
    } catch (e) {
      setResult({ error: "Network request failed", details: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, padding: 20, paddingTop: 60 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 10 }}>Aestha Phase 1</Text>
      
      <Button title="1. Pick Image" onPress={pickImage} color="#6200ee" />
      <View style={{ height: 10 }} />
      <Button title="2. Analyze" onPress={upload} disabled={loading || !photoUri} color="#03dac6" />

      {loading && <ActivityIndicator size="large" style={{ marginTop: 20 }} />}

      {photoUri && (
        <Image source={{ uri: photoUri }} style={{ width: '100%', height: 300, borderRadius: 10, marginTop: 20 }} />
      )}

      {result?.analysis?.detected_outfit && (
  <View style={{ marginTop: 20, padding: 15, backgroundColor: "#fff", borderRadius: 15, elevation: 3 }}>
    <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>Detected Outfit</Text>
    
    {/* Map through the items Gemini found */}
    {result.analysis.detected_outfit.items.map((item: any, index: number) => (
      <View key={index} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#eee" }}>
        <Text style={{ fontWeight: "600", textTransform: "capitalize" }}>{item.label}</Text>
        <Text style={{ color: "#666" }}>{item.color} ({item.type})</Text>
      </View>
    ))}

    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 15 }}>
      {result.analysis.detected_outfit.style_tags.map((tag: string, index: number) => (
        <View key={index} style={{ backgroundColor: "#6200ee", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginRight: 8, marginBottom: 8 }}>
          <Text style={{ color: "#fff", fontSize: 12 }}>#{tag}</Text>
        </View>
      ))}
    </View>
  </View>
)}
    </ScrollView>
  );
}