import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import CaptureWizard, { CapturePayload } from "../components/CaptureWizard";
import { BACKEND_URL } from "../src/config";
import Avatar3D from "../components/Avatar3D";

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width > 800;
  const [catalog, setCatalog] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [hasScanned, setHasScanned] = useState(false);
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardMode, setWizardMode] = useState<"scan" | "upload">("scan");
  const [capturedPayload, setCapturedPayload] = useState<CapturePayload | null>(null);
  const [selectedGarment, setSelectedGarment] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [tryOnResult, setTryOnResult] = useState<string | null>(null);
  const [tryOnError, setTryOnError] = useState<string | null>(null);

  const primaryImageUri =
    capturedPayload?.front ?? capturedPayload?.side ?? capturedPayload?.face ?? null;

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/catalog`);
        const data = await response.json();
        if (data?.status === "success" && Array.isArray(data.catalog)) {
          setCatalog(data.catalog);
        }
      } catch (error) {
        console.error("Failed to load catalog:", error);
      } finally {
        setCatalogLoading(false);
      }
    };
    fetchCatalog();
  }, []);

  const handleStartScan = (mode: "scan" | "upload" = "scan") => {
    setWizardMode(mode);
    setWizardActive(true);
    setHasScanned(false);
    setCapturedPayload(null);
    setSelectedGarment(null);
    setAnalysisResult(null);
    setTryOnResult(null);
    setTryOnError(null);
  };

  const handleScanComplete = async (payload: CapturePayload) => {
    setCapturedPayload(payload);
    setWizardActive(false);
    setHasScanned(true);
    setTryOnResult(null);
    setTryOnError(null);

    const primaryUri = payload.front ?? payload.side ?? payload.face ?? null;
    if (!primaryUri) return;

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      const appendImage = async (uri: string, filename: string, key: string) => {
        if (Platform.OS === "web") {
          const response = await fetch(uri);
          const blob = await response.blob();
          const file =
            typeof File !== "undefined"
              ? new File([blob], filename, { type: blob.type || "image/jpeg" })
              : blob;
          formData.append(key, file as any);
        } else {
          formData.append(key, {
            uri,
            name: filename,
            type: "image/jpeg",
          } as any);
        }
      };

      await appendImage(primaryUri, "profile.jpg", "image");
      if (payload.front) await appendImage(payload.front, "front.jpg", "front_image");
      if (payload.side) await appendImage(payload.side, "side.jpg", "side_image");
      if (payload.face) await appendImage(payload.face, "face.jpg", "face_image");

      if (payload.measurements.height) formData.append("height_cm", payload.measurements.height);
      if (payload.measurements.chest) formData.append("chest_cm", payload.measurements.chest);
      if (payload.measurements.waist) formData.append("waist_cm", payload.measurements.waist);
      if (payload.calculatedMath?.shoulderCm) formData.append("shoulder_cm", String(payload.calculatedMath.shoulderCm));
      if (payload.calculatedMath?.hipCm) formData.append("hip_cm", String(payload.calculatedMath.hipCm));
      formData.append("gender", "unknown");
      if (payload.survey?.preferredFit) formData.append("fit_preference", payload.survey.preferredFit);
      if (payload.survey?.preferredAesthetic) formData.append("aesthetic", payload.survey.preferredAesthetic);
      if (payload.survey?.preferredFit) formData.append("preferred_fit", payload.survey.preferredFit);
      if (payload.survey?.preferredPalette) formData.append("preferred_palette", payload.survey.preferredPalette);
      if (payload.survey?.preferredAesthetic) formData.append("preferred_aesthetic", payload.survey.preferredAesthetic);

      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const raw = await response.text();
      const json = raw ? JSON.parse(raw) : {};
      setAnalysisResult(json);
    } catch (e) {
      Alert.alert("Analysis Failed", String(e));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateTryOn = async () => {
    if (!capturedPayload?.front || !selectedGarment) return;
    setTryOnError(null);
    setIsProcessing(true);
    try {
      const formData = new FormData();
      if (Platform.OS === "web") {
        const response = await fetch(capturedPayload.front);
        const blob = await response.blob();
        const file =
          typeof File !== "undefined"
            ? new File([blob], "tryon.jpg", { type: blob.type || "image/jpeg" })
            : blob;
        formData.append("user_image", file as any);
      } else {
        formData.append("user_image", {
          uri: primaryImageUri,
          name: "tryon.jpg",
          type: "image/jpeg",
        } as any);
      }
      formData.append("clothing_item", selectedGarment.label);

      const response = await fetch(`${BACKEND_URL}/try-on`, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const raw = await response.text();
      const json = raw ? JSON.parse(raw) : {};

      if (!response.ok || json?.status !== "completed" || !json?.result_image_url) {
        const message =
          json?.message ||
          json?.details?.message ||
          `Try-on failed (HTTP ${response.status})`;
        throw new Error(message);
      }

      setTryOnResult(json.result_image_url);
    } catch (e) {
      const msg = String(e);
      setTryOnError(msg);
      Alert.alert("Try-On Failed", msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Ionicons name="menu-outline" size={28} color="#FFFFFF" />
        <Text style={styles.logo}>A E S T H A</Text>
        <Ionicons name="person-circle-outline" size={28} color="#FFFFFF" />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mainContainer, isDesktop && styles.mainContainerDesktop]}>
          <View style={styles.column}>
            {!hasScanned ? (
              <View style={styles.heroScanner}>
                <View style={styles.scannerReticle}>
                  <Ionicons name="scan-outline" size={48} color="#A990FF" />
                </View>
                <Text style={styles.heroTitle}>Initialize Studio</Text>
                <Text style={styles.heroSub}>
                  Calibrate your 3D geometry for perfect tailoring.
                </Text>
                <TouchableOpacity
                  style={styles.heroButton}
                  onPress={() => handleStartScan("scan")}
                  activeOpacity={0.8}
                >
                  <Text style={styles.heroButtonText}>START SCAN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.altHeroButton}
                  onPress={() => handleStartScan("upload")}
                  activeOpacity={0.8}
                >
                  <Text style={styles.altHeroButtonText}>OR UPLOAD PHOTOS MANUALLY</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.profileCard}>
                <View style={styles.profileHeader}>
                  <Text style={styles.sectionTitle}>SPATIAL PROFILE</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setHasScanned(false);
                      setWizardActive(false);
                      setCapturedPayload(null);
                      setSelectedGarment(null);
                      setAnalysisResult(null);
                      setTryOnResult(null);
                      setTryOnError(null);
                    }}
                  >
                    <Text style={styles.recalText}>Recalibrate</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.avatarPlaceholder}>
                  {primaryImageUri ? (
                    <Image source={{ uri: primaryImageUri }} style={styles.profilePreview} />
                  ) : (
                    <Ionicons name="body-outline" size={80} color="#333" />
                  )}
                  <Text style={styles.avatarLabel}>Mesh Locked: Active</Text>
                </View>

                <View style={styles.mathRow}>
                  <View style={styles.mathStat}>
                    <Text style={styles.mathLabel}>HEIGHT</Text>
                    <Text style={styles.mathValue}>
                      {capturedPayload?.measurements.height || "--"} cm
                    </Text>
                  </View>
                  <View style={styles.mathStat}>
                    <Text style={styles.mathLabel}>SHOULDER</Text>
                    <Text style={styles.mathValue}>
                      {capturedPayload?.calculatedMath?.shoulderCm || "--"} cm
                    </Text>
                  </View>
                  <View style={styles.mathStat}>
                    <Text style={styles.mathLabel}>WAIST</Text>
                    <Text style={styles.mathValue}>
                      {capturedPayload?.measurements.waist || "--"} cm
                    </Text>
                  </View>
                  <View style={styles.mathStat}>
                    <Text style={styles.mathLabel}>HIP</Text>
                    <Text style={styles.mathValue}>
                      {capturedPayload?.calculatedMath?.hipCm || "--"} cm
                    </Text>
                  </View>
                </View>
                {!capturedPayload?.calculatedMath && (
                  <View style={styles.mathWarningBadge}>
                    <Ionicons name="warning-outline" size={14} color="#ffc57a" />
                    <Text style={styles.mathWarningText}>
                      Could not extract shoulder/hip math from this scan. Recalibrate in brighter light for more accurate tailoring.
                    </Text>
                  </View>
                )}

                <View style={{ marginTop: 16 }}>
                  <Avatar3D
                    shoulderCm={capturedPayload?.calculatedMath?.shoulderCm}
                    hipCm={capturedPayload?.calculatedMath?.hipCm}
                  />
                </View>

                {isAnalyzing && (
                  <View style={{ marginTop: 12, alignItems: "center" }}>
                    <ActivityIndicator color="#A990FF" />
                    <Text style={{ color: "#8a8a99", marginTop: 6, fontSize: 12 }}>
                      Running stylist intelligence...
                    </Text>
                  </View>
                )}

                {analysisResult?.analysis?.spatial_analysis && (
                  <View style={styles.analysisCard}>
                    <Text style={styles.analysisTitle}>
                      {analysisResult.analysis.spatial_analysis.body_shape}
                    </Text>
                    <Text style={styles.analysisText}>
                      {analysisResult.analysis.spatial_analysis.fit_advice}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {wizardActive && (
              <View style={styles.wizardCard}>
                <CaptureWizard onComplete={handleScanComplete} mode={wizardMode} />
              </View>
            )}

            {tryOnResult && (
              <View style={styles.resultCard}>
                <Text style={styles.sectionTitle}>SYNTHESIS COMPLETE</Text>
                <Image source={{ uri: tryOnResult }} style={styles.resultImage} />
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setTryOnResult(null)}
                >
                  <Text style={styles.secondaryButtonText}>Discard & Try Another</Text>
                </TouchableOpacity>
              </View>
            )}

            {!!tryOnError && <Text style={styles.errorText}>{tryOnError}</Text>}
          </View>

          <View
            style={[styles.column, { opacity: hasScanned ? 1 : 0.4 }]}
            pointerEvents={hasScanned ? "auto" : "none"}
          >
            <Text style={[styles.sectionTitle, { marginLeft: 10, marginTop: isDesktop ? 0 : 20 }]}>
              THE ARCHIVE
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselContainer}
            >
              {catalogLoading ? (
                <ActivityIndicator color="#A990FF" style={{ margin: 20 }} />
              ) : catalog.length ? (
                catalog.map((item) => {
                  const isSelected = selectedGarment?.id === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.garmentCard, isSelected && styles.garmentCardSelected]}
                      onPress={() => setSelectedGarment(item)}
                      activeOpacity={0.9}
                    >
                      <Image source={{ uri: item.image }} style={styles.garmentImage} />
                      <View style={styles.garmentInfo}>
                        <Text style={styles.garmentBrand}>{item.brand}</Text>
                        <Text style={styles.garmentName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.garmentPrice}>{item.price}</Text>
                      </View>
                      {isSelected && (
                        <View style={styles.selectedBadge}>
                          <Ionicons name="checkmark" size={16} color="#000" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.catalogErrorText}>
                  Could not load inventory right now. Please refresh.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </ScrollView>

      {hasScanned && selectedGarment && !tryOnResult && (
        <View style={styles.floatingActionArea}>
          <TouchableOpacity
            style={styles.primaryAction}
            onPress={handleGenerateTryOn}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons
                  name="sparkles"
                  size={20}
                  color="#000"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.primaryActionText}>GENERATE SYNTHESIS</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "web" ? 24 : 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
  },
  logo: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", letterSpacing: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 170 },
  mainContainer: { gap: 24 },
  mainContainerDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    maxWidth: 1200,
    alignSelf: "center",
    width: "100%",
  },
  column: { flex: 1, gap: 24 },
  sectionTitle: {
    color: "#666666",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 12,
  },
  heroScanner: {
    backgroundColor: "#121212",
    borderRadius: 24,
    padding: 40,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#222",
  },
  scannerReticle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(169, 144, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(169, 144, 255, 0.3)",
  },
  heroTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "600", marginBottom: 8 },
  heroSub: { color: "#888888", fontSize: 14, textAlign: "center", marginBottom: 32 },
  heroButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 100,
  },
  heroButtonText: { color: "#000000", fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  altHeroButton: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#3a3a4f",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  altHeroButtonText: {
    color: "#d7d7ef",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  wizardCard: {
    backgroundColor: "#121212",
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: "#222",
  },
  profileCard: {
    backgroundColor: "#121212",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#222",
  },
  profileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  recalText: { color: "#A990FF", fontSize: 12, fontWeight: "600" },
  avatarPlaceholder: {
    height: 220,
    backgroundColor: "#0A0A0A",
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    overflow: "hidden",
  },
  profilePreview: { width: "100%", height: "100%", resizeMode: "cover" },
  avatarLabel: {
    color: "#444",
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 12,
    textTransform: "uppercase",
    position: "absolute",
    bottom: 12,
  },
  mathRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#0A0A0A",
    padding: 16,
    borderRadius: 16,
  },
  mathStat: { alignItems: "center" },
  mathLabel: { color: "#666", fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  mathValue: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  carouselContainer: { paddingHorizontal: 10, gap: 16 },
  catalogErrorText: {
    color: "#8f8fa8",
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  garmentCard: {
    width: 220,
    backgroundColor: "#121212",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#222",
  },
  garmentCardSelected: { borderColor: "#A990FF" },
  garmentImage: { width: "100%", height: 260, backgroundColor: "#1A1A1A" },
  garmentInfo: { padding: 16 },
  garmentBrand: {
    color: "#A990FF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
  },
  garmentName: { color: "#FFFFFF", fontSize: 14, fontWeight: "500", marginBottom: 8 },
  garmentPrice: { color: "#888888", fontSize: 13 },
  selectedBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#A990FF",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  resultCard: {
    backgroundColor: "#121212",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#222",
    alignItems: "center",
  },
  resultImage: { width: "100%", height: 450, borderRadius: 16, marginBottom: 20 },
  secondaryButton: { paddingVertical: 12 },
  secondaryButtonText: { color: "#888", fontSize: 14, fontWeight: "600" },
  floatingActionArea: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 28 : 40,
    alignSelf: "center",
    width: "100%",
    maxWidth: 400,
    paddingHorizontal: 24,
  },
  primaryAction: {
    backgroundColor: "#A990FF",
    flexDirection: "row",
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#A990FF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  primaryActionText: { color: "#000000", fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  errorText: { color: "#ff8aa0", fontSize: 12, marginTop: -8 },
  mathWarningBadge: {
    marginTop: 10,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "rgba(255,197,122,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,197,122,0.25)",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  mathWarningText: {
    flex: 1,
    color: "#f7cf97",
    fontSize: 11,
    lineHeight: 16,
  },
  analysisCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a38",
    backgroundColor: "#0d0d15",
  },
  analysisTitle: {
    color: "#A990FF",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 1,
  },
  analysisText: {
    color: "#d6d6e8",
    fontSize: 12,
    lineHeight: 18,
  },
});