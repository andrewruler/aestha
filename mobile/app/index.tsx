import React, { useState } from "react";
import { Button, Text, View, ScrollView, ActivityIndicator, Alert, Image } from "react-native";
import SpatialCamera from "../components/SpatialCamera";
import { BACKEND_URL } from "../src/config";
import Avatar3D from "../components/Avatar3D";

export default function HomeScreen() {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tryOnLoading, setTryOnLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [tryOnImage, setTryOnImage] = useState<string | null>(null);
  const [lastRatio, setLastRatio] = useState<string | null>(null);

  // Initial Analysis Upload: receives the captured photo URI and spatial ratio from SpatialCamera
  const handleCaptureAndUpload = async (uri: string | null, ratio: string | null) => {
    setCapturedImageUri(uri);
    if (ratio) setLastRatio(ratio);
    setIsCameraActive(false);

    // Require a valid image; ratio can fall back to "unknown"
    if (!uri) {
      Alert.alert(
        "Capture failed",
        "We couldn't capture a photo from the camera. Please try again."
      );
      return;
    }

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("image", {
      uri,
      name: "spatial_capture.jpg",
      type: "image/jpeg",
    } as any);
    if (ratio) {
      formData.append("body_ratio", ratio);
    }

    try {
      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      });
      const json = await response.json();
      setResult(json);
    } catch (e) {
      Alert.alert("Analysis Error", String(e));
    } finally {
      setLoading(false);
    }
  };
  const startPolling = (jobId: string) => {
    // Polling is no longer needed with the synchronous stub backend.
    // This function is kept for future FASHN integration.
  };
  // Trigger Member B's Try-On Endpoint
  const handleTryOn = async (itemLabel: string) => {
    if (!capturedImageUri) return;

    setTryOnLoading(true);
    try {
      console.log(`Triggering FASHN for item: ${itemLabel}`);
      const formData = new FormData();
      formData.append("user_image", {
        uri: capturedImageUri,
        name: "tryon.jpg",
        type: "image/jpeg",
      } as any);
      formData.append("clothing_item", itemLabel);

      const response = await fetch(`${BACKEND_URL}/try-on`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      });
      
      const json = await response.json();
      if (!response.ok || json?.status !== "completed" || !json?.result_image_url) {
        const message = json?.message || json?.details?.message || `Try-on failed (HTTP ${response.status})`;
        throw new Error(message);
      }

      setTryOnImage(json.result_image_url);
      Alert.alert("Try-On Ready", `Here’s your look for ${itemLabel}.`);
    } catch (e) {
      Alert.alert("Try-On Failed", String(e));
    } finally {
      setTryOnLoading(false);
    }
  };

  if (isCameraActive) {
    return <SpatialCamera onCapture={handleCaptureAndUpload} />;
  }

  return (
    <ScrollView style={{ flex: 1, padding: 20, paddingTop: 60 }}>
      <Text style={{ fontSize: 28, fontWeight: "bold", marginBottom: 10 }}>Aestha</Text>
      
      <Button title="Open Spatial Camera" onPress={() => setIsCameraActive(true)} color="#6200ee" />
      
      {loading && (
        <View style={{ marginTop: 20 }}>
          <ActivityIndicator size="large" color="#6200ee" />
          <Text style={{ textAlign: 'center', marginTop: 10 }}>Analyzing fit & proportions...</Text>
        </View>
      )}
      
      {/* 1. Spatial Analysis Card */}
      {result?.analysis?.spatial_analysis && (
        <View style={{ marginTop: 20, padding: 20, backgroundColor: "#e3f2fd", borderRadius: 15 }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#1565c0", marginBottom: 5 }}>
            📐 Spatial Fit Analysis
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#333" }}>
            Detected Shape: {result.analysis.spatial_analysis.body_shape}
          </Text>
          <Text style={{ fontSize: 14, color: "#555", marginTop: 10, fontStyle: "italic" }}>
            "{result.analysis.spatial_analysis.fit_advice}"
          </Text>
        </View>
      )}
      {/* The 3D Capstone Demonstration */}
      {result?.analysis?.spatial_analysis && (
  <View style={{ marginTop: 20, marginBottom: 40 }}>
    <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 10 }}>
      🌐 Your 3D Spatial Profile
    </Text>
    
        <Avatar3D rawRatio={lastRatio} />
    
    <Text style={{ textAlign: "center", color: "#666", marginTop: 8, fontStyle: "italic" }}>
      Real-time mesh generation based on MediaPipe coordinates.
    </Text>
  </View>
)}
      {/* Try-On Results Section */}
  {tryOnImage && (
    <View style={{ marginTop: 20, borderRadius: 15, overflow: 'hidden' }}>
      <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>Your New Look:</Text>
      <Image 
        source={{ uri: tryOnImage }} 
        style={{ width: '100%', height: 400, resizeMode: 'cover' }} 
      />
    </View>
  )}
      {/* 2. Detected Outfit Mapping & Try-On */}
      {result?.analysis?.detected_outfit?.items && (
        <View style={{ marginTop: 25 }}>
          <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 15 }}>Recommended Styling</Text>
          
          {result.analysis.detected_outfit.items.map((item: any, index: number) => (
            <View 
              key={index} 
              style={{ 
                flexDirection: 'row', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: 15,
                backgroundColor: '#f5f5f5',
                borderRadius: 10,
                marginBottom: 10
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.label}</Text>
                <Text style={{ color: '#666', fontSize: 12 }}>{item.confidence}% match</Text>
              </View>

              <Button 
                title={tryOnLoading ? "..." : "Try Similar"} 
                onPress={() => handleTryOn(item.label)}
                disabled={tryOnLoading}
              />
            </View>
          ))}
        </View>
      )}

      {/* Debug view - hidden if clean */}
      {!loading && !result && (
        <Text style={{ marginTop: 40, color: '#aaa', textAlign: 'center' }}>
          No analysis yet. Capture a photo to begin.
        </Text>
      )}
    </ScrollView>
  );
}