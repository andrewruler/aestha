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
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { initializeValidationEngine, validateCapturedShot } from "../utils/visionValidation";
import LiveScanner from "./LiveScanner";
import { BodyMeasurements, calculateBodyMath } from "../utils/bodyMath";

const STEPS = [
  { id: "front", label: "Front Scan", desc: "Stand straight facing the camera, head to toe." },
  { id: "side", label: "Side Scan", desc: "Turn 90 degrees and keep your full body in frame." },
  { id: "face", label: "Face Scan", desc: "Move closer: face and shoulders centered with good light." },
  { id: "measurements", label: "Exact Measurements", desc: "Optional: enter measurements (cm) for precision." },
] as const;

type ShotId = (typeof STEPS)[number]["id"];

export type UserMeasurements = { height: string; chest: string; waist: string; hips: string };
export type CapturePayload = {
  front: string | null;
  side: string | null;
  face: string | null;
  measurements: UserMeasurements;
  calculatedMath: BodyMeasurements | null;
};

interface Props { onComplete: (payload: CapturePayload) => void; }

export default function CaptureWizard({ onComplete }: Props) {
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

  const applyValidationError = (message: string) => {
    setValidationError(message);
    Alert.alert("Scan rejected", message);
    if (Platform.OS === "web" && typeof window !== "undefined" && window.alert) {
      window.alert(`Scan rejected: ${message}`);
    }
  };

  const handleScan = async () => {
    const currentStepId = currentStep.id as ShotId;

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
    const currentStepId = currentStep.id as ShotId;
    setValidationError("");
    setCaptureError("");
    setPhotos((prev) => ({ ...prev, [currentStepId]: uri }));
    setStepIndex((prev) => prev + 1);
  };

  const handleFinish = async () => {
    if (!photos.front || !photos.side || !photos.face) {
      Alert.alert("Missing scans", "Please complete all 3 scans before submitting.");
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
      onComplete({ ...photos, measurements, calculatedMath: computedBodyMath });
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
      <Text style={styles.stepCount}>Step {stepIndex + 1} of 4</Text>
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
          {Platform.OS === "web" ? (
            <LiveScanner
              stepId={currentStep.id as "front" | "side" | "face"}
              onCaptureSuccess={handleWebScanComplete}
            />
          ) : !permission || !permission.granted ? (
            <View style={styles.permissionBox}>
              <Text style={styles.errorText}>Camera permission is required for live scanning.</Text>
              <Button title="Enable camera access" onPress={requestPermission} color="#8338ec" />
            </View>
          ) : (
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
          )}
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
  cameraViewport: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  camera: { width: "100%", height: 320, backgroundColor: "#090914" },
  permissionBox: { gap: 10 },
  form: { gap: 12 },
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