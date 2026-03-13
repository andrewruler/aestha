import React, { useState } from "react";
import {
  Button,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  TouchableOpacity,
  useWindowDimensions,
  StyleSheet,
  Platform,
} from "react-native";
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
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [selectedOutfit, setSelectedOutfit] = useState<string | null>(null);
  const [tryOnError, setTryOnError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const { width } = useWindowDimensions();
  const isWideLayout = width >= 900;

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString().split("T")[1]?.split(".")[0] || "";
    const line = `[${timestamp}] ${message}`;
    console.log(line);
    setDebugLogs((prev) => [...prev.slice(-59), line]);
  };

  const showError = (title: string, message: string) => {
    addLog(`[error] ${title}: ${message}`);
    Alert.alert(title, message);
    if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
      window.alert(`${title}: ${message}`);
    }
  };

  // Initial Analysis Upload: receives the captured photo URI and spatial ratio from SpatialCamera
  const handleCaptureAndUpload = async (uri: string | null, ratio: string | null) => {
    addLog(
      `[analyze] capture received | uri=${uri ? "yes" : "no"} | ratio=${ratio ?? "null"} | platform=${Platform.OS}`
    );
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
    setTryOnError(null);

    const formData = new FormData();

    if (Platform.OS === "web") {
      // On web, convert the captured URI (blob/data URL) into a real File/Blob
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        addLog(`[analyze] web blob prepared | type=${blob.type || "unknown"} size=${blob.size}`);
        const webFile =
          typeof File !== "undefined"
            ? new File([blob], "spatial_capture.jpg", {
                type: blob.type || "image/jpeg",
              })
            : blob;
        formData.append("image", webFile as any);
      } catch (e) {
        Alert.alert("Upload Error", "Could not read captured image in browser.");
        return;
      }
    } else {
      // On native, React Native's fetch understands the { uri, name, type } pattern
      formData.append("image", {
        uri,
        name: "spatial_capture.jpg",
        type: "image/jpeg",
      } as any);
    }
    if (ratio) {
      formData.append("body_ratio", ratio);
    }
    if (gender) {
      formData.append("gender", gender);
    }

    try {
      addLog("[analyze] request start -> /analyze");
      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      });
      const raw = await response.text();
      addLog(`[analyze] response status=${response.status} body=${raw.slice(0, 260)}`);
      const json = raw ? JSON.parse(raw) : {};
      setResult(json);
    } catch (e) {
      showError("Analysis Error", String(e));
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
    setTryOnError(null);
    try {
      addLog(
        `[try-on] start | item=${itemLabel} | hasImage=${capturedImageUri ? "yes" : "no"} | platform=${Platform.OS}`
      );
      const formData = new FormData();
      if (Platform.OS === "web") {
        try {
          const response = await fetch(capturedImageUri);
          const blob = await response.blob();
          addLog(`[try-on] web blob prepared | type=${blob.type || "unknown"} size=${blob.size}`);
          const webFile =
            typeof File !== "undefined"
              ? new File([blob], "tryon.jpg", {
                  type: blob.type || "image/jpeg",
                })
              : blob;
          formData.append("user_image", webFile as any);
        } catch (e) {
          showError("Try-On Error", "Could not read captured image in browser.");
          return;
        }
      } else {
        formData.append("user_image", {
          uri: capturedImageUri,
          name: "tryon.jpg",
          type: "image/jpeg",
        } as any);
      }
      formData.append("clothing_item", String(itemLabel));

      addLog("[try-on] request start -> /try-on");
      const response = await fetch(`${BACKEND_URL}/try-on`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      });
      const raw = await response.text();
      addLog(`[try-on] response status=${response.status} body=${raw.slice(0, 300)}`);

      let json: any = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Non-JSON /try-on response: ${raw.slice(0, 180)}`);
      }

      if (!response.ok || json?.status !== "completed" || !json?.result_image_url) {
        const message = json?.message || json?.details?.message || `Try-on failed (HTTP ${response.status})`;
        setTryOnError(message);
        throw new Error(message);
      }

      setTryOnImage(json.result_image_url);
      addLog(`[try-on] completed | result=${json.result_image_url}`);
      Alert.alert("Try-On Ready", `Here’s your look for ${itemLabel}.`);
    } catch (e) {
      const errMsg = String(e);
      setTryOnError(errMsg);
      showError("Try-On Failed", errMsg);
    } finally {
      setTryOnLoading(false);
    }
  };

  if (isCameraActive) {
    return <SpatialCamera onCapture={handleCaptureAndUpload} />;
  }

  const outfits: any[] = result?.analysis?.detected_outfit?.items ?? [];

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Aestha</Text>
          <Text style={styles.subtitle}>
            Asian fashion & K-style virtual try-on
          </Text>
        </View>

        <View
          style={[
            styles.mainContent,
            isWideLayout ? styles.mainContentRow : styles.mainContentColumn,
          ]}
        >
          {/* Left: capture + analysis */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Upload or Capture Your Photo</Text>
            <Text style={styles.cardSubtitle}>
              Use your webcam or phone camera to create a personalized style profile.
            </Text>

            <View style={styles.captureRow}>
              <Button
                title="📸 Open Spatial Camera"
                onPress={() => setIsCameraActive(true)}
                color="#8338ec"
              />
            </View>

            {capturedImageUri && (
              <View style={styles.previewWrapper}>
                <Image
                  source={{ uri: capturedImageUri }}
                  style={styles.previewImage}
                />
                <Text style={styles.previewLabel}>Latest capture</Text>
              </View>
            )}

            {/* Gender selection */}
            <View style={styles.genderSection}>
              <Text style={styles.genderTitle}>Gender Selection</Text>
              <View style={styles.genderButtons}>
                <TouchableOpacity
                  style={[
                    styles.genderButton,
                    gender === "male" && styles.genderButtonSelected,
                  ]}
                  onPress={() => setGender("male")}
                >
                  <Text style={styles.genderEmoji}>👨</Text>
                  <Text style={styles.genderText}>Male</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.genderButton,
                    gender === "female" && styles.genderButtonSelected,
                  ]}
                  onPress={() => setGender("female")}
                >
                  <Text style={styles.genderEmoji}>👩</Text>
                  <Text style={styles.genderText}>Female</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.genderHint}>
                Used to fine-tune recommendations and silhouettes.
              </Text>
            </View>

            {loading && (
              <View style={styles.loadingBlock}>
                <ActivityIndicator size="large" color="#8338ec" />
                <Text style={styles.loadingText}>
                  Analyzing proportions & style…
                </Text>
              </View>
            )}

            {/* Spatial analysis */}
            {result?.analysis?.spatial_analysis && (
              <View style={styles.analysisCard}>
                <Text style={styles.analysisTitle}>Your Style Analysis</Text>
                <Text style={styles.analysisChip}>
                  Shape: {result.analysis.spatial_analysis.body_shape}
                </Text>
                <Text style={styles.analysisBody}>
                  {result.analysis.spatial_analysis.fit_advice}
                </Text>
              </View>
            )}

            {/* 3D avatar */}
            {result?.analysis?.spatial_analysis && (
              <View style={styles.avatarSection}>
                <Text style={styles.avatarTitle}>3D Spatial Profile</Text>
                <Avatar3D rawRatio={lastRatio} />
                <Text style={styles.avatarCaption}>
                  Real-time mannequin driven by your shoulder–hip ratio.
                </Text>
              </View>
            )}

            {!loading && !result && (
              <Text style={styles.emptyState}>
                No analysis yet. Capture a photo to begin.
              </Text>
            )}
          </View>

          {/* Right: outfits + try-on */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Celebrity Outfits</Text>
            <Text style={styles.cardSubtitle}>
              Select a look to virtually try on with your captured photo.
            </Text>

            <View style={styles.outfitGrid}>
              {outfits.map((item: any, index: number) => {
                const isSelected = selectedOutfit === item.label;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.outfitCard,
                      isSelected && styles.outfitCardSelected,
                    ]}
                    onPress={() => setSelectedOutfit(item.label)}
                    disabled={tryOnLoading}
                  >
                    <View style={styles.outfitImageStub}>
                      <Text style={styles.outfitEmoji}>👗</Text>
                    </View>
                    <Text style={styles.outfitLabel} numberOfLines={2}>
                      {item.label}
                    </Text>
                    <Text style={styles.outfitMeta}>
                      {item.confidence}% match
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {!outfits.length && (
                <Text style={styles.outfitPlaceholder}>
                  Once we analyze your look, we will surface K-style outfits
                  tailored to your proportions.
                </Text>
              )}
            </View>

            <View style={styles.tryOnButtonWrapper}>
              <Button
                title={
                  !capturedImageUri
                    ? "Capture a photo first"
                    : selectedOutfit
                    ? tryOnLoading
                      ? "Processing look…"
                      : "Try on selected outfit"
                    : "Select an outfit"
                }
                color="#ff006e"
                onPress={() => {
                  if (capturedImageUri && selectedOutfit && !tryOnLoading) {
                    handleTryOn(selectedOutfit);
                  }
                }}
                disabled={
                  !capturedImageUri || !selectedOutfit || tryOnLoading
                }
              />
            </View>

            {!!tryOnError && (
              <Text style={styles.tryOnErrorText}>
                Try-on error: {tryOnError}
              </Text>
            )}

            {tryOnImage && (
              <View style={styles.tryOnPreview}>
                <Text style={styles.tryOnTitle}>Your New Look</Text>
                <Image
                  source={{ uri: tryOnImage }}
                  style={styles.tryOnImage}
                />
              </View>
            )}

            <View style={styles.debugPanel}>
              <View style={styles.debugHeaderRow}>
                <Text style={styles.debugTitle}>Debug Logs</Text>
                <TouchableOpacity onPress={() => setDebugLogs([])}>
                  <Text style={styles.debugClear}>Clear</Text>
                </TouchableOpacity>
              </View>
              {!debugLogs.length ? (
                <Text style={styles.debugEmpty}>No logs yet.</Text>
              ) : (
                debugLogs.slice(-12).map((line, idx) => (
                  <Text key={`${idx}-${line}`} style={styles.debugLine}>
                    {line}
                  </Text>
                ))
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#05050a",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -1,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: "#a0a0b8",
  },
  mainContent: {
    gap: 20,
  },
  mainContentRow: {
    flexDirection: "row",
  },
  mainContentColumn: {
    flexDirection: "column",
  },
  card: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#aaaacc",
    marginBottom: 16,
  },
  captureRow: {
    marginBottom: 16,
  },
  previewWrapper: {
    marginTop: 16,
    alignItems: "center",
  },
  previewImage: {
    width: 220,
    height: 320,
    borderRadius: 16,
    backgroundColor: "#111122",
  },
  previewLabel: {
    marginTop: 8,
    fontSize: 12,
    color: "#8888aa",
  },
  genderSection: {
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  genderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 12,
  },
  genderButtons: {
    flexDirection: "row",
    gap: 12,
  },
  genderButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  genderButtonSelected: {
    backgroundColor: "rgba(131,56,236,0.25)",
    borderColor: "#ff006e",
  },
  genderEmoji: {
    fontSize: 18,
  },
  genderText: {
    fontSize: 13,
    color: "#ffffff",
    fontWeight: "600",
  },
  genderHint: {
    marginTop: 8,
    fontSize: 11,
    color: "#7c7c98",
  },
  loadingBlock: {
    marginTop: 20,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: "#bbbbdd",
  },
  analysisCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  analysisTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ff80b5",
    marginBottom: 10,
  },
  analysisChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    fontSize: 12,
    color: "#ffffff",
    marginBottom: 8,
  },
  analysisBody: {
    fontSize: 13,
    color: "#ddddf0",
  },
  avatarSection: {
    marginTop: 24,
  },
  avatarTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 10,
  },
  avatarCaption: {
    marginTop: 8,
    fontSize: 11,
    color: "#8a8ab0",
    textAlign: "center",
  },
  emptyState: {
    marginTop: 24,
    fontSize: 12,
    color: "#8080a0",
    textAlign: "center",
  },
  outfitGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
  },
  outfitCard: {
    width: "47%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  outfitCardSelected: {
    borderColor: "#ff006e",
    backgroundColor: "rgba(255,0,110,0.15)",
  },
  outfitImageStub: {
    height: 80,
    borderRadius: 10,
    backgroundColor: "#151528",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  outfitEmoji: {
    fontSize: 28,
  },
  outfitLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  outfitMeta: {
    marginTop: 4,
    fontSize: 11,
    color: "#a0a0c0",
  },
  outfitPlaceholder: {
    fontSize: 12,
    color: "#8080a0",
  },
  tryOnButtonWrapper: {
    marginTop: 20,
  },
  tryOnPreview: {
    marginTop: 24,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#101020",
  },
  tryOnTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 10,
  },
  tryOnImage: {
    width: "100%",
    height: 320,
  },
  tryOnErrorText: {
    marginTop: 10,
    color: "#ff8aa0",
    fontSize: 12,
  },
  debugPanel: {
    marginTop: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 10,
  },
  debugHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  debugTitle: {
    color: "#d5d5ff",
    fontSize: 12,
    fontWeight: "700",
  },
  debugClear: {
    color: "#9c9cff",
    fontSize: 12,
  },
  debugEmpty: {
    color: "#8080a0",
    fontSize: 11,
  },
  debugLine: {
    color: "#9ca3c7",
    fontSize: 10,
    marginBottom: 4,
  },
});