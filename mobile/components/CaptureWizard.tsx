import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Button,
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
  Image,
  Platform,
  TouchableOpacity,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { initializeValidationEngine, validateCapturedShot } from "../utils/visionValidation";
import LiveScanner from "./LiveScanner";
import { BodyMeasurements, calculateBodyMath } from "../utils/bodyMath";
import * as ImagePicker from "expo-image-picker";

const STEPS = [
  { id: "front", label: "Front Scan", desc: "Stand straight facing the camera, head to toe." },
  { id: "side", label: "Side Scan (Optional)", desc: "Turn 90 degrees and keep one full side silhouette in frame." },
  { id: "face", label: "Face Scan (Optional)", desc: "Move closer: face and shoulders centered with good light." },
  { id: "measurements", label: "Exact Measurements", desc: "Optional: enter measurements (cm) for precision." },
  { id: "survey", label: "Style Survey (Optional)", desc: "Help us refine recommendations to your taste." },
] as const;

type ScanStepId = "front" | "side" | "face";

export type UserMeasurements = { height: string; chest: string; waist: string; hips: string };
export type StyleSurvey = {
  preferredFit: "baggy" | "regular" | "slim" | "";
  preferredPalette: "neutrals" | "darks" | "pastels" | "";
  preferredAesthetic: "streetwear" | "minimalist" | "techwear" | "";
};
export type CapturePayload = {
  front: string | null;
  side: string | null;
  face: string | null;
  measurements: UserMeasurements;
  calculatedMath: BodyMeasurements | null;
  survey: StyleSurvey;
};

interface Props {
  onComplete: (payload: CapturePayload) => void;
  mode?: "scan" | "upload";
}

export default function CaptureWizard({ onComplete, mode = "scan" }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [photos, setPhotos] = useState<{ front: string | null; side: string | null; face: string | null }>({
    front: null,
    side: null,
    face: null,
  });
  const [measurements, setMeasurements] = useState<UserMeasurements>({
    height: "",
    chest: "",
    waist: "",
    hips: "",
  });
  const [survey, setSurvey] = useState<StyleSurvey>({
    preferredFit: "",
    preferredPalette: "",
    preferredAesthetic: "",
  });
  const [captureMode, setCaptureMode] = useState<"scan" | "upload">(mode);
  const [engineLoading, setEngineLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [captureError, setCaptureError] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        await initializeValidationEngine();
      } finally {
        setEngineLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" && !permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const currentStep = STEPS[stepIndex];
  const isMeasurementStep = currentStep.id === "measurements";
  const isSurveyStep = currentStep.id === "survey";

  const applyValidationError = (message: string) => {
    setValidationError(message);
    Alert.alert("Scan rejected", message);
    if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
      window.alert(`Scan rejected: ${message}`);
    }
  };

  const handleScan = async () => {
    const currentStepId = currentStep.id as ScanStepId;

    if (!cameraRef.current) {
      setCaptureError("Camera not ready yet. Please wait a second.");
      return;
    }

    setCaptureError("");
    setValidationError("");
    setValidating(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });
      const uri = photo?.uri;
      if (!uri) {
        throw new Error("Scan did not return an image URI.");
      }

      const validation = await validateCapturedShot(uri, currentStepId);
      if (!validation.valid) {
        applyValidationError(validation.error || "Invalid scan.");
        return;
      }

      setPhotos((prev) => ({ ...prev, [currentStepId]: uri }));
      setStepIndex((prev) => prev + 1);
    } catch (err) {
      const message = `Failed to capture scan: ${String(err)}`;
      setCaptureError(message);
      Alert.alert("Capture Error", message);
    } finally {
      setValidating(false);
    }
  };

  const handleWebScanComplete = (uri: string) => {
    const currentStepId = currentStep.id as ScanStepId;
    setValidationError("");
    setCaptureError("");
    setPhotos((prev) => ({ ...prev, [currentStepId]: uri }));
    setStepIndex((prev) => prev + 1);
  };

  const handleUploadImage = async () => {
    const currentStepId = currentStep.id as ScanStepId;
    setValidationError("");
    setCaptureError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const uri = result.assets[0].uri;
      setValidating(true);
      const validation = await validateCapturedShot(uri, currentStepId);
      if (!validation.valid) {
        applyValidationError(validation.error || "Invalid image.");
        return;
      }
      setPhotos((prev) => ({ ...prev, [currentStepId]: uri }));
      setStepIndex((prev) => prev + 1);
    } catch (err) {
      setCaptureError(`Upload failed: ${String(err)}`);
    } finally {
      setValidating(false);
    }
  };

  const handleSkipCurrent = () => {
    if (currentStep.id === "front") return;
    setStepIndex((prev) => prev + 1);
  };

  const handleFinish = async () => {
    if (!photos.front) {
      Alert.alert("Front scan required", "Please capture at least the front scan.");
      return;
    }

    if (!measurements.height) {
      Alert.alert(
        "Height Required",
        "Please enter your height so we can calculate your true proportions."
      );
      return;
    }

    const parsedHeight = Number(measurements.height);
    if (!isFinite(parsedHeight) || parsedHeight <= 0) {
      Alert.alert("Invalid Height", "Please enter a valid numeric height in centimeters.");
      return;
    }

    let computedBodyMath: BodyMeasurements | null = null;
    setIsCalculating(true);
    try {
      if (photos.front) {
        computedBodyMath = await calculateBodyMath(photos.front, parsedHeight);
      }
      onComplete({ ...photos, measurements, calculatedMath: computedBodyMath, survey });
    } catch {
      Alert.alert("Math Error", "Failed to calculate proportions. Please try again.");
    } finally {
      setIsCalculating(false);
    }
  };

  if (engineLoading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#ff006e" />
        <Text style={styles.loaderText}>Loading AI validation engine…</Text>
      </View>
    );
  }

  if (Platform.OS !== "web" && !permission) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#ff006e" />
        <Text style={styles.loaderText}>Requesting camera permissions…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.stepCount}>Step {stepIndex + 1} of {STEPS.length}</Text>
      <Text style={styles.title}>{currentStep.label}</Text>
      <Text style={styles.desc}>{currentStep.desc}</Text>

      {validating ? (
        <View style={styles.validatingBox}>
          <ActivityIndicator color="#8338ec" size="large" />
          <Text style={styles.validatingText}>Validating pose & lighting…</Text>
        </View>
      ) : isMeasurementStep ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Height (cm)"
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={measurements.height}
            onChangeText={(t) => setMeasurements({ ...measurements, height: t })}
          />
          <TextInput
            style={styles.input}
            placeholder="Chest (cm)"
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={measurements.chest}
            onChangeText={(t) => setMeasurements({ ...measurements, chest: t })}
          />
          <TextInput
            style={styles.input}
            placeholder="Waist (cm)"
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={measurements.waist}
            onChangeText={(t) => setMeasurements({ ...measurements, waist: t })}
          />
          <TextInput
            style={styles.input}
            placeholder="Hips (cm)"
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={measurements.hips}
            onChangeText={(t) => setMeasurements({ ...measurements, hips: t })}
          />
          <View style={styles.optionalHintWrap}>
            <Text style={styles.optionalHintText}>
              Side and face scans are optional. Height is required for accurate body math.
            </Text>
          </View>
          {isCalculating ? (
            <View style={styles.calculatingWrap}>
              <ActivityIndicator color="#A990FF" />
              <Text style={styles.calculatingText}>Extracting measurements...</Text>
            </View>
          ) : (
            <Button title="Continue to Style Survey" onPress={() => setStepIndex((prev) => prev + 1)} color="#A990FF" />
          )}
        </View>
      ) : isSurveyStep ? (
        <View style={styles.form}>
          <Text style={styles.surveyLabel}>Preferred Fit</Text>
          <View style={styles.choiceRow}>
            {(["baggy", "regular", "slim"] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.choiceChip, survey.preferredFit === opt && styles.choiceChipSelected]}
                onPress={() => setSurvey((prev) => ({ ...prev, preferredFit: opt }))}
              >
                <Text style={styles.choiceChipText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.surveyLabel}>Favorite Palette</Text>
          <View style={styles.choiceRow}>
            {(["neutrals", "darks", "pastels"] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.choiceChip, survey.preferredPalette === opt && styles.choiceChipSelected]}
                onPress={() => setSurvey((prev) => ({ ...prev, preferredPalette: opt }))}
              >
                <Text style={styles.choiceChipText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.surveyLabel}>Go-to Aesthetic</Text>
          <View style={styles.choiceRow}>
            {(["streetwear", "minimalist", "techwear"] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.choiceChip, survey.preferredAesthetic === opt && styles.choiceChipSelected]}
                onPress={() => setSurvey((prev) => ({ ...prev, preferredAesthetic: opt }))}
              >
                <Text style={styles.choiceChipText}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {isCalculating ? (
            <View style={styles.calculatingWrap}>
              <ActivityIndicator color="#A990FF" />
              <Text style={styles.calculatingText}>Extracting measurements...</Text>
            </View>
          ) : (
            <Button title="Submit Profile" onPress={handleFinish} color="#A990FF" />
          )}
        </View>
      ) : (
        <View style={styles.scanBlock}>
          {captureMode === "scan" && Platform.OS === "web" ? (
            <LiveScanner
              stepId={currentStep.id as "front" | "side" | "face"}
              onCaptureSuccess={handleWebScanComplete}
            />
          ) : captureMode === "scan" && (!permission || !permission.granted) ? (
            <View style={styles.permissionBox}>
              <Text style={styles.errorText}>Camera permission is required for live scanning.</Text>
              <Button title="Enable camera access" onPress={requestPermission} color="#8338ec" />
            </View>
          ) : captureMode === "scan" ? (
            <>
              <View style={styles.cameraViewport}>
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing={currentStep.id === "side" ? "back" : "front"}
                />
              </View>
              <Button title={`Scan ${currentStep.label}`} onPress={handleScan} color="#8338ec" />
            </>
          ) : (
            <Button title={`Upload ${currentStep.label}`} onPress={handleUploadImage} color="#8338ec" />
          )}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeChip, captureMode === "scan" && styles.modeChipActive]}
              onPress={() => setCaptureMode("scan")}
            >
              <Text style={styles.modeChipText}>Live Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeChip, captureMode === "upload" && styles.modeChipActive]}
              onPress={() => setCaptureMode("upload")}
            >
              <Text style={styles.modeChipText}>Upload Photos</Text>
            </TouchableOpacity>
            {currentStep.id !== "front" && (
              <TouchableOpacity style={styles.skipChip} onPress={handleSkipCurrent}>
                <Text style={styles.skipChipText}>Skip</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {!!validationError && <Text style={styles.errorText}>{validationError}</Text>}
      {!!captureError && <Text style={styles.errorText}>{captureError}</Text>}

      <View style={styles.previewRow}>
        {(["front", "side", "face"] as const).map((shot) => (
          <View key={shot} style={styles.previewCell}>
            {photos[shot] ? (
              <Image source={{ uri: photos[shot] as string }} style={styles.previewThumb} />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Text style={styles.previewPlaceholderText}>—</Text>
              </View>
            )}
            <Text style={styles.previewLabel}>{shot}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stepCount: { color: "#ff006e", fontWeight: "bold", marginBottom: 4 },
  title: { fontSize: 20, color: "#fff", fontWeight: "bold", marginBottom: 8 },
  desc: { color: "#aaaacc", marginBottom: 16 },
  loaderWrap: { alignItems: "center", paddingVertical: 20 },
  loaderText: { color: "#d6d6f0", marginTop: 8 },
  validatingBox: { alignItems: "center", paddingVertical: 20 },
  validatingText: { color: "#fff", marginTop: 10 },
  scanBlock: { gap: 12 },
  modeRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  modeChip: {
    borderWidth: 1,
    borderColor: "#2e2e44",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#121223",
  },
  modeChipActive: {
    borderColor: "#A990FF",
    backgroundColor: "rgba(169,144,255,0.18)",
  },
  modeChipText: {
    color: "#d6d6f0",
    fontSize: 11,
    fontWeight: "600",
  },
  skipChip: {
    borderWidth: 1,
    borderColor: "#5a3340",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(120,40,56,0.25)",
    marginLeft: "auto",
  },
  skipChipText: {
    color: "#ffb3c5",
    fontSize: 11,
    fontWeight: "700",
  },
  cameraViewport: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  camera: { width: "100%", height: 320, backgroundColor: "#090914" },
  permissionBox: { gap: 10 },
  form: { gap: 12 },
  surveyLabel: {
    color: "#c9c9e6",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
  },
  choiceRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: "#32324a",
    backgroundColor: "#151526",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  choiceChipSelected: {
    borderColor: "#A990FF",
    backgroundColor: "rgba(169,144,255,0.2)",
  },
  choiceChipText: {
    color: "#e5e5f7",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  optionalHintWrap: {
    marginTop: 4,
    marginBottom: 4,
  },
  optionalHintText: {
    color: "#9ca3c4",
    fontSize: 11,
  },
  input: {
    backgroundColor: "rgba(0,0,0,0.5)",
    color: "#fff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  errorText: {
    color: "#ff8aa0",
    marginTop: 10,
    fontSize: 12,
  },
  previewRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 8,
  },
  previewCell: {
    flex: 1,
    alignItems: "center",
  },
  previewThumb: {
    width: "100%",
    height: 70,
    borderRadius: 8,
    backgroundColor: "#121224",
  },
  previewPlaceholder: {
    width: "100%",
    height: 70,
    borderRadius: 8,
    backgroundColor: "#111122",
    alignItems: "center",
    justifyContent: "center",
  },
  previewPlaceholderText: {
    color: "#666",
  },
  previewLabel: {
    marginTop: 4,
    color: "#aaaacc",
    fontSize: 11,
    textTransform: "capitalize",
  },
  calculatingWrap: {
    alignItems: "center",
    marginTop: 20,
  },
  calculatingText: {
    color: "#fff",
    marginTop: 10,
    fontSize: 12,
  },
});