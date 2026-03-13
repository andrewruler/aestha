import React, { useState } from "react";
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

const CATALOG = [
  {
    id: "1",
    label: "white t-shirt",
    brand: "WOOYOUNGMI",
    name: "Oversized Wool Blazer",
    price: "$850",
    image:
      "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=400",
  },
  {
    id: "2",
    label: "blue jeans",
    brand: "ANDERSSON BELL",
    name: "Pleated Wide Trousers",
    price: "$280",
    image:
      "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&q=80&w=400",
  },
  {
    id: "3",
    label: "black hoodie",
    brand: "JUUN.J",
    name: "Techwear Cargo Vest",
    price: "$450",
    image:
      "https://images.unsplash.com/photo-1622470953794-aa9c70b0fb9d?auto=format&fit=crop&q=80&w=400",
  },
  {
    id: "4",
    label: "floral dress",
    brand: "AESTHA CORE",
    name: "Mohair Distressed Knit",
    price: "$120",
    image:
      "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&q=80&w=400",
  },
];

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width > 800;

  const [hasScanned, setHasScanned] = useState(false);
  const [wizardActive, setWizardActive] = useState(false);
  const [capturedPayload, setCapturedPayload] = useState<CapturePayload | null>(null);
  const [selectedGarment, setSelectedGarment] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tryOnResult, setTryOnResult] = useState<string | null>(null);
  const [tryOnError, setTryOnError] = useState<string | null>(null);

  const primaryImageUri =
    capturedPayload?.front ?? capturedPayload?.side ?? capturedPayload?.face ?? null;

  const handleStartScan = () => {
    setWizardActive(true);
    setTryOnResult(null);
    setTryOnError(null);
  };

  const handleScanComplete = (payload: CapturePayload) => {
    setCapturedPayload(payload);
    setWizardActive(false);
    setHasScanned(true);
  };

  const handleGenerateTryOn = async () => {
    if (!primaryImageUri || !selectedGarment) return;
    setTryOnError(null);
    setIsProcessing(true);
    try {
      const garment = CATALOG.find((c) => c.id === selectedGarment);
      if (!garment) throw new Error("Selected garment not found.");

      const formData = new FormData();
      if (Platform.OS === "web") {
        const response = await fetch(primaryImageUri);
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
      formData.append("clothing_item", garment.label);

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
              <TouchableOpacity
                style={styles.heroScanner}
                onPress={handleStartScan}
                activeOpacity={0.8}
              >
                <View style={styles.scannerReticle}>
                  <Ionicons name="scan-outline" size={48} color="#A990FF" />
                </View>
                <Text style={styles.heroTitle}>Initialize Studio</Text>
                <Text style={styles.heroSub}>
                  Calibrate your 3D geometry for perfect tailoring.
                </Text>
                <View style={styles.heroButton}>
                  <Text style={styles.heroButtonText}>START SCAN</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.profileCard}>
                <View style={styles.profileHeader}>
                  <Text style={styles.sectionTitle}>SPATIAL PROFILE</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setHasScanned(false);
                      setWizardActive(false);
                      setCapturedPayload(null);
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
                    <Text style={styles.mathLabel}>CHEST</Text>
                    <Text style={styles.mathValue}>
                      {capturedPayload?.measurements.chest || "--"} cm
                    </Text>
                  </View>
                  <View style={styles.mathStat}>
                    <Text style={styles.mathLabel}>WAIST</Text>
                    <Text style={styles.mathValue}>
                      {capturedPayload?.measurements.waist || "--"} cm
                    </Text>
                  </View>
                  <View style={styles.mathStat}>
                    <Text style={styles.mathLabel}>HIPS</Text>
                    <Text style={styles.mathValue}>
                      {capturedPayload?.measurements.hips || "--"} cm
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {wizardActive && (
              <View style={styles.wizardCard}>
                <CaptureWizard onComplete={handleScanComplete} />
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
              {CATALOG.map((item) => {
                const isSelected = selectedGarment === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.garmentCard, isSelected && styles.garmentCardSelected]}
                    onPress={() => setSelectedGarment(item.id)}
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
              })}
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
  scrollContent: { padding: 20, paddingBottom: 120 },
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
    bottom: 40,
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
});