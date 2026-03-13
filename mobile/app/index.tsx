import React, { useEffect, useMemo, useState } from "react";
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
import { router } from "expo-router";
import CaptureWizard, { CapturePayload } from "../components/CaptureWizard";
import { BACKEND_URL } from "../src/config";
import Avatar3D from "../components/Avatar3D";
import { useAuth } from "@/context/AuthContext";

type CatalogItem = {
  id: string;
  brand: string;
  name: string;
  price: string;
  image: string;
  label: string;
  category?: "tops" | "bottoms" | "one-pieces";
};

type SavedLook = {
  id: string;
  image: string;
  garmentName: string;
  createdAt: number;
};

type ActivityEntry = {
  id: string;
  text: string;
  tone: "info" | "success" | "error";
  createdAt: number;
};

type AppTab = "studio" | "insights" | "wardrobe";

type AnalysisResponse = {
  status?: string;
  analysis?: {
    spatial_analysis?: {
      body_shape?: string;
      color_season?: string;
      geometry_advice?: string;
      fit_advice?: string;
    };
    style_synthesis?: {
      overall_vibe?: string;
      stylist_rationale?: string;
      outfit?: { category?: string; description?: string; search_term?: string }[];
    };
  };
};

const parseJsonSafe = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export default function HomeScreen() {
  const { user, accessToken, isAuthReady, hasSeenTutorial } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width > 980;
  const [activeTab, setActiveTab] = useState<AppTab>("studio");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [hasScanned, setHasScanned] = useState(false);
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardMode, setWizardMode] = useState<"scan" | "upload">("scan");
  const [capturedPayload, setCapturedPayload] = useState<CapturePayload | null>(null);
  const [selectedGarment, setSelectedGarment] = useState<CatalogItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [tryOnResult, setTryOnResult] = useState<string | null>(null);
  const [tryOnError, setTryOnError] = useState<string | null>(null);
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const primaryImageUri =
    capturedPayload?.front ?? capturedPayload?.side ?? capturedPayload?.face ?? null;

  const addActivity = (text: string, tone: ActivityEntry["tone"] = "info") => {
    setActivity((prev) =>
      [{ id: `${Date.now()}-${Math.random()}`, text, tone, createdAt: Date.now() }, ...prev].slice(
        0,
        12
      )
    );
  };

  useEffect(() => {
    const fetchCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const response = await fetch(`${BACKEND_URL}/catalog`);
        const data = await response.json();
        if (data?.status === "success" && Array.isArray(data.catalog)) {
          setCatalog(data.catalog as CatalogItem[]);
          addActivity("Catalog synced from server.", "success");
        } else {
          setCatalogError("Catalog response was invalid.");
          addActivity("Catalog payload was invalid.", "error");
        }
      } catch (error) {
        setCatalogError(`Failed to load catalog: ${String(error)}`);
        addActivity("Catalog fetch failed.", "error");
      } finally {
        setCatalogLoading(false);
      }
    };
    fetchCatalog();
  }, []);

  const resetSession = () => {
    setHasScanned(false);
    setWizardActive(false);
    setCapturedPayload(null);
    setSelectedGarment(null);
    setAnalysisResult(null);
    setTryOnResult(null);
    setTryOnError(null);
  };

  const handleStartScan = (mode: "scan" | "upload" = "scan") => {
    setWizardMode(mode);
    resetSession();
    setWizardActive(true);
    setActiveTab("studio");
    addActivity(mode === "scan" ? "Started live scan wizard." : "Started upload-based wizard.");
  };

  const appendImage = async (
    formData: FormData,
    uri: string,
    filename: string,
    key: string
  ) => {
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

  const handleScanComplete = async (payload: CapturePayload) => {
    setCapturedPayload(payload);
    setWizardActive(false);
    setHasScanned(true);
    setTryOnResult(null);
    setTryOnError(null);
    addActivity("Spatial profile captured.", "success");

    if (!user || !accessToken) {
      Alert.alert("Login required", "Please log in to run AI analysis.");
      router.push("/login");
      addActivity("Analysis paused until login.");
      return;
    }

    const primaryUri = payload.front ?? payload.side ?? payload.face ?? null;
    if (!primaryUri) return;

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      await appendImage(formData, primaryUri, "profile.jpg", "image");
      if (payload.front) await appendImage(formData, payload.front, "front.jpg", "front_image");
      if (payload.side) await appendImage(formData, payload.side, "side.jpg", "side_image");
      if (payload.face) await appendImage(formData, payload.face, "face.jpg", "face_image");

      if (payload.measurements.height) formData.append("height_cm", payload.measurements.height);
      if (payload.measurements.chest) formData.append("chest_cm", payload.measurements.chest);
      if (payload.measurements.waist) formData.append("waist_cm", payload.measurements.waist);
      if (payload.calculatedMath?.shoulderCm) {
        formData.append("shoulder_cm", String(payload.calculatedMath.shoulderCm));
      }
      if (payload.calculatedMath?.hipCm) {
        formData.append("hip_cm", String(payload.calculatedMath.hipCm));
      }
      formData.append("gender", "unknown");
      if (payload.survey?.preferredFit) {
        formData.append("fit_preference", payload.survey.preferredFit);
        formData.append("preferred_fit", payload.survey.preferredFit);
      }
      if (payload.survey?.preferredPalette) {
        formData.append("preferred_palette", payload.survey.preferredPalette);
      }
      if (payload.survey?.preferredAesthetic) {
        formData.append("aesthetic", payload.survey.preferredAesthetic);
        formData.append("preferred_aesthetic", payload.survey.preferredAesthetic);
      }

      const response = await fetch(`${BACKEND_URL}/analyze`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const raw = await response.text();
      const parsed = parseJsonSafe(raw) as AnalysisResponse;
      setAnalysisResult(parsed);
      addActivity("AI stylist analysis completed.", "success");
      setActiveTab("insights");
    } catch (e) {
      Alert.alert("Analysis Failed", String(e));
      addActivity("AI analysis failed.", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateTryOn = async () => {
    if (!user || !accessToken) {
      Alert.alert("Login required", "Please log in to run secure try-on synthesis.");
      router.push("/login");
      return;
    }
    if (!capturedPayload?.front || !selectedGarment) {
      Alert.alert("Missing Data", "Please complete your scan and select an item from the archive.");
      return;
    }
    setTryOnError(null);
    setTryOnResult(null);
    setIsProcessing(true);
    addActivity(`Starting try-on for ${selectedGarment.name}.`);
    try {
      const formData = new FormData();
      await appendImage(formData, capturedPayload.front, "user_highres.jpg", "user_image");
      formData.append("garment_image_url", selectedGarment.image);
      formData.append("category", selectedGarment.category || "tops");
      formData.append("clothing_item", selectedGarment.label); // compatibility fallback

      const response = await fetch(`${BACKEND_URL}/try-on`, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const raw = await response.text();
      const json = parseJsonSafe(raw);

      if (!response.ok || json?.status !== "completed" || !json?.result_image_url) {
        const message =
          json?.message ||
          json?.details?.message ||
          `Try-on failed (HTTP ${response.status})`;
        throw new Error(message);
      }

      setTryOnResult(json.result_image_url as string);
      addActivity(`Try-on completed for ${selectedGarment.name}.`, "success");
      setActiveTab("wardrobe");
    } catch (e) {
      const msg = String(e);
      setTryOnError(msg);
      Alert.alert("Synthesis Failed", msg);
      addActivity("Try-on synthesis failed.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const spatial = analysisResult?.analysis?.spatial_analysis;
  const synthesis = analysisResult?.analysis?.style_synthesis;
  const completionScore = [
    !!capturedPayload?.front,
    !!analysisResult,
    !!selectedGarment,
    !!tryOnResult,
  ].filter(Boolean).length;

  const milestoneText = useMemo(() => {
    if (completionScore >= 4) return "Studio cycle complete";
    if (completionScore >= 2) return "Profile in progress";
    return "Setup pending";
  }, [completionScore]);

  const handleOpenMenu = () => {
    router.push("/settings");
  };

  const handleOpenProfile = () => {
    if (user) {
      router.push("/profile");
      return;
    }
    router.push("/login");
  };

  const handleSaveCurrentLook = () => {
    if (!tryOnResult) return;
    const garmentName = selectedGarment?.name || "Untitled Look";
    setSavedLooks((prev) => [
      { id: `${Date.now()}`, image: tryOnResult, garmentName, createdAt: Date.now() },
      ...prev,
    ]);
    addActivity(`Saved look: ${garmentName}.`, "success");
  };

  const pickFromInsights = (category: "tops" | "bottoms" | "one-pieces") => {
    const match = catalog.find((item) => (item.category || "tops") === category);
    if (!match) {
      Alert.alert("No match", `No ${category} items are available in the archive right now.`);
      return;
    }
    setSelectedGarment(match);
    setActiveTab("studio");
    addActivity(`Selected ${match.name} from AI insights.`);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleOpenMenu}>
          <Ionicons name="menu-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.logo}>A E S T H A</Text>
        <TouchableOpacity onPress={handleOpenProfile}>
          <Ionicons
            name={user ? "person-circle" : "person-circle-outline"}
            size={24}
            color={user ? "#A990FF" : "#FFFFFF"}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.authStrip}>
        <Text style={styles.authStripText}>
          {!isAuthReady
            ? "Loading secure session..."
            : user
            ? `Signed in as ${user.name}${hasSeenTutorial ? "" : " • tutorial recommended"}`
            : "Guest mode active. Log in to persist wardrobe and profile preferences."}
        </Text>
        <TouchableOpacity
          style={styles.authStripButton}
          onPress={() => {
            if (!user) {
              router.push("/login");
              return;
            }
            if (!hasSeenTutorial) {
              router.push("/tutorial");
              return;
            }
            router.push("/profile");
          }}
        >
          <Text style={styles.authStripButtonText}>
            {!user ? "LOGIN" : !hasSeenTutorial ? "TUTORIAL" : "PROFILE"}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.topNav}>
        {[
          { id: "studio", icon: "cube-outline", label: "Studio" },
          { id: "insights", icon: "bulb-outline", label: "Insights" },
          { id: "wardrobe", icon: "shirt-outline", label: "Wardrobe" },
        ].map((tab) => {
          const selected = activeTab === (tab.id as AppTab);
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.navPill, selected && styles.navPillActive]}
              onPress={() => setActiveTab(tab.id as AppTab)}
            >
              <Ionicons
                name={tab.icon as any}
                size={14}
                color={selected ? "#000" : "#d2d2ea"}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.navPillText, selected && styles.navPillTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Workflow</Text>
            <Text style={styles.kpiValue}>{milestoneText}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Completion</Text>
            <Text style={styles.kpiValue}>{completionScore}/4</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Saved Looks</Text>
            <Text style={styles.kpiValue}>{savedLooks.length}</Text>
          </View>
        </View>

        <View style={[styles.mainContainer, isDesktop && styles.mainContainerDesktop]}>
          <View style={styles.column}>
            {!hasScanned ? (
              <View style={styles.heroScanner}>
                <View style={styles.scannerReticle}>
                  <Ionicons name="scan-outline" size={46} color="#A990FF" />
                </View>
                <Text style={styles.heroTitle}>Initialize Studio</Text>
                <Text style={styles.heroSub}>
                  Capture your body geometry and style profile for high-fidelity synthesis.
                </Text>
                <TouchableOpacity
                  style={styles.heroButton}
                  onPress={() => handleStartScan("scan")}
                  activeOpacity={0.85}
                >
                  <Text style={styles.heroButtonText}>START LIVE SCAN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.altHeroButton}
                  onPress={() => handleStartScan("upload")}
                  activeOpacity={0.85}
                >
                  <Text style={styles.altHeroButtonText}>OR UPLOAD PHOTOS MANUALLY</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.profileCard}>
                <View style={styles.profileHeader}>
                  <Text style={styles.sectionTitle}>SPATIAL PROFILE</Text>
                  <TouchableOpacity onPress={resetSession}>
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
                    <Text style={styles.mathValue}>{capturedPayload?.measurements.height || "--"} cm</Text>
                  </View>
                  <View style={styles.mathStat}>
                    <Text style={styles.mathLabel}>SHOULDER</Text>
                    <Text style={styles.mathValue}>
                      {capturedPayload?.calculatedMath?.shoulderCm || "--"} cm
                    </Text>
                  </View>
                  <View style={styles.mathStat}>
                    <Text style={styles.mathLabel}>WAIST</Text>
                    <Text style={styles.mathValue}>{capturedPayload?.measurements.waist || "--"} cm</Text>
                  </View>
                  <View style={styles.mathStat}>
                    <Text style={styles.mathLabel}>HIP</Text>
                    <Text style={styles.mathValue}>{capturedPayload?.calculatedMath?.hipCm || "--"} cm</Text>
                  </View>
                </View>

                {!capturedPayload?.calculatedMath && (
                  <View style={styles.mathWarningBadge}>
                    <Ionicons name="warning-outline" size={14} color="#ffc57a" />
                    <Text style={styles.mathWarningText}>
                      Shoulder/hip math is missing. Recalibrate in brighter light and keep full body visible.
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
                  <View style={styles.loadingInline}>
                    <ActivityIndicator color="#A990FF" />
                    <Text style={styles.loadingInlineText}>Running stylist intelligence...</Text>
                  </View>
                )}

                {!!spatial && (
                  <View style={styles.analysisCard}>
                    <Text style={styles.analysisTitle}>{spatial.body_shape || "Body Profile"}</Text>
                    {!!spatial.color_season && (
                      <Text style={styles.analysisChip}>Color Season: {spatial.color_season}</Text>
                    )}
                    <Text style={styles.analysisText}>
                      {spatial.geometry_advice || spatial.fit_advice || "No geometry advice generated yet."}
                    </Text>
                  </View>
                )}

                {!!synthesis && (
                  <View style={styles.analysisCard}>
                    <Text style={styles.analysisTitle}>{synthesis.overall_vibe || "Style Synthesis"}</Text>
                    {(synthesis.outfit || []).map((item, idx) => (
                      <Text key={`${item.category}-${idx}`} style={styles.analysisText}>
                        • {item.category || "item"}: {item.description || item.search_term || "suggestion"}
                      </Text>
                    ))}
                    {!!synthesis.stylist_rationale && (
                      <Text style={[styles.analysisText, { marginTop: 8 }]}>
                        {synthesis.stylist_rationale}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {wizardActive && (
              <View style={styles.wizardCard}>
                <CaptureWizard onComplete={handleScanComplete} mode={wizardMode} />
              </View>
            )}

            {!!tryOnError && <Text style={styles.errorText}>{tryOnError}</Text>}

            {!!tryOnResult && (
              <View style={styles.resultCard}>
                <Text style={styles.sectionTitle}>SYNTHESIS COMPLETE</Text>
                <Image source={{ uri: tryOnResult }} style={styles.resultImage} />
                <TouchableOpacity style={styles.secondaryButton} onPress={handleSaveCurrentLook}>
                  <Text style={styles.secondaryButtonText}>Save to Wardrobe</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setTryOnResult(null)}>
                  <Text style={styles.secondaryButtonText}>Discard & Try Another</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={[styles.column, { opacity: hasScanned ? 1 : 0.9 }]}>
            {activeTab === "studio" && (
              <>
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
                      {catalogError || "Could not load inventory right now. Please refresh."}
                    </Text>
                  )}
                </ScrollView>

                <View style={styles.actionCard}>
                  <Text style={styles.actionHint}>
                    {!isAuthReady
                      ? "Checking session..."
                      : !user
                        ? "Login required before synthesis."
                        : hasScanned
                      ? selectedGarment
                        ? "Ready to synthesize your selected archive item."
                        : "Select an archive item to begin synthesis."
                      : "Complete your scan profile first to unlock synthesis."}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.primaryAction,
                      (!isAuthReady ||
                        !user ||
                        !hasScanned ||
                        !selectedGarment ||
                        isProcessing) &&
                        styles.primaryActionDisabled,
                    ]}
                    onPress={handleGenerateTryOn}
                    disabled={!isAuthReady || !user || !hasScanned || !selectedGarment || isProcessing}
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
              </>
            )}

            {activeTab === "insights" && (
              <View style={styles.workspaceCard}>
                <Text style={styles.workspaceTitle}>AI Command Center</Text>
                <Text style={styles.workspaceSub}>
                  Use your profile analysis to jump directly into curated categories.
                </Text>
                <View style={styles.quickActionRow}>
                  <TouchableOpacity style={styles.quickActionChip} onPress={() => pickFromInsights("tops")}>
                    <Text style={styles.quickActionText}>Pick Top</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickActionChip} onPress={() => pickFromInsights("bottoms")}>
                    <Text style={styles.quickActionText}>Pick Bottom</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickActionChip}
                    onPress={() => pickFromInsights("one-pieces")}
                  >
                    <Text style={styles.quickActionText}>Pick One-Piece</Text>
                  </TouchableOpacity>
                </View>
                {!!synthesis?.outfit?.length ? (
                  synthesis.outfit.map((item, idx) => (
                    <View key={`${item.category}-${idx}`} style={styles.workspaceLine}>
                      <Text style={styles.workspaceLineTitle}>
                        {(item.category || "item").toUpperCase()}
                      </Text>
                      <Text style={styles.workspaceLineText}>
                        {item.description || item.search_term || "No recommendation text provided."}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.workspaceEmpty}>
                    Run a scan and analysis first to unlock AI recommendations.
                  </Text>
                )}
              </View>
            )}

            {activeTab === "wardrobe" && (
              <>
                <View style={styles.workspaceCard}>
                  <Text style={styles.workspaceTitle}>Saved Wardrobe Looks</Text>
                  {!!savedLooks.length ? (
                    <View style={styles.savedGrid}>
                      {savedLooks.map((look) => (
                        <View key={look.id} style={styles.savedItem}>
                          <Image source={{ uri: look.image }} style={styles.savedItemImage} />
                          <Text style={styles.savedItemText} numberOfLines={1}>
                            {look.garmentName}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.workspaceEmpty}>
                      No saved looks yet. Generate a synthesis, then save it here.
                    </Text>
                  )}
                </View>
                <View style={styles.workspaceCard}>
                  <Text style={styles.workspaceTitle}>Recent Activity</Text>
                  {!!activity.length ? (
                    activity.map((entry) => (
                      <View key={entry.id} style={styles.activityLine}>
                        <View
                          style={[
                            styles.activityDot,
                            entry.tone === "success"
                              ? styles.activityDotSuccess
                              : entry.tone === "error"
                                ? styles.activityDotError
                                : styles.activityDotInfo,
                          ]}
                        />
                        <Text style={styles.activityText}>{entry.text}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.workspaceEmpty}>No activity yet in this session.</Text>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
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
  topNav: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#101018",
  },
  authStrip: {
    borderBottomWidth: 1,
    borderBottomColor: "#171726",
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authStripText: {
    color: "#9b9bb6",
    fontSize: 11,
    flex: 1,
  },
  authStripButton: {
    borderWidth: 1,
    borderColor: "#3a3a58",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#11111b",
  },
  authStripButtonText: {
    color: "#dcdcff",
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  navPill: {
    borderWidth: 1,
    borderColor: "#2c2c44",
    backgroundColor: "#11111b",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  navPillActive: {
    backgroundColor: "#A990FF",
    borderColor: "#A990FF",
  },
  navPillText: {
    color: "#d2d2ea",
    fontSize: 12,
    fontWeight: "700",
  },
  navPillTextActive: {
    color: "#000",
  },
  logo: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", letterSpacing: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 36 },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  kpiCard: {
    backgroundColor: "#111118",
    borderWidth: 1,
    borderColor: "#202036",
    borderRadius: 14,
    padding: 12,
    minWidth: 160,
    flexGrow: 1,
  },
  kpiLabel: {
    color: "#8f8fb4",
    fontSize: 11,
    marginBottom: 6,
  },
  kpiValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
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
    padding: 12,
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
    paddingHorizontal: 10,
    paddingVertical: 14,
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
    padding: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#A990FF",
    alignItems: "center",
  },
  resultImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: "#050505",
    marginBottom: 16,
  },
  secondaryButton: { paddingVertical: 12 },
  secondaryButtonText: { color: "#888", fontSize: 14, fontWeight: "600" },
  actionCard: {
    backgroundColor: "#111118",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#26263b",
    padding: 14,
    marginTop: 12,
  },
  actionHint: {
    color: "#a6a6be",
    fontSize: 12,
    marginBottom: 10,
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
  primaryActionDisabled: {
    opacity: 0.45,
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
  analysisChip: {
    color: "#c6c6ea",
    fontSize: 11,
    marginBottom: 8,
  },
  loadingInline: {
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingInlineText: {
    color: "#8a8a99",
    marginTop: 6,
    fontSize: 12,
  },
  workspaceCard: {
    backgroundColor: "#101018",
    borderWidth: 1,
    borderColor: "#26263b",
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  workspaceTitle: {
    color: "#f0f0ff",
    fontSize: 14,
    fontWeight: "700",
  },
  workspaceSub: {
    color: "#9ea0bf",
    fontSize: 12,
    lineHeight: 18,
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  quickActionChip: {
    borderWidth: 1,
    borderColor: "#3a3a58",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#1a1a28",
  },
  quickActionText: {
    color: "#dcdcff",
    fontSize: 11,
    fontWeight: "700",
  },
  workspaceLine: {
    borderTopWidth: 1,
    borderTopColor: "#232338",
    paddingTop: 10,
    gap: 4,
  },
  workspaceLineTitle: {
    color: "#bba9ff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  workspaceLineText: {
    color: "#e3e3f6",
    fontSize: 12,
    lineHeight: 18,
  },
  workspaceEmpty: {
    color: "#8b8ba7",
    fontSize: 12,
    lineHeight: 18,
  },
  savedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  savedItem: {
    width: 120,
    gap: 6,
  },
  savedItemImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 10,
    backgroundColor: "#050509",
  },
  savedItemText: {
    color: "#d8d8ee",
    fontSize: 11,
  },
  activityLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activityDotInfo: {
    backgroundColor: "#6f6fff",
  },
  activityDotSuccess: {
    backgroundColor: "#41d98a",
  },
  activityDotError: {
    backgroundColor: "#ff7b92",
  },
  activityText: {
    color: "#d8d8ee",
    fontSize: 12,
    flex: 1,
  },
});
