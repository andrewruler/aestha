import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StepId, initializeValidationEngine, validateLiveVideoFrame } from "../utils/visionValidation";

type ScannerStep = Exclude<StepId, "measurements" | "survey">;

type Props = {
  stepId: ScannerStep;
  onCaptureSuccess: (imageDataUrl: string) => void;
};

const REQUIRED_FRAMES = 30; // ~2 seconds lock-on at ~15 fps checks
const MIN_SCAN_INTERVAL_MS = 66; // ~15 fps processing cadence

export default function LiveScanner({ stepId, onCaptureSuccess }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stabilityFramesRef = useRef(0);
  const lastScanAtRef = useRef(0);
  const mountedRef = useRef(true);

  const [feedback, setFeedback] = useState("Initializing camera...");
  const [progress, setProgress] = useState(0);
  const [initializing, setInitializing] = useState(true);
  const [outlineColor, setOutlineColor] = useState("#ef4444");

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const cancelLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const captureFrame = useCallback((video: HTMLVideoElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.85);
    setFeedback("Scan locked. Capturing...");
    cancelLoop();
    stopStream();
    onCaptureSuccess(image);
  }, [cancelLoop, onCaptureSuccess, stopStream]);

  const drawOverlay = useCallback(
    (keypoints: { x: number; y: number; score: number }[] | undefined, color: string) => {
      const canvas = overlayCanvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      if (!video.videoWidth || !video.videoHeight) return;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!keypoints?.length) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.fillStyle = color;

      // MoveNet skeleton indices (17 keypoints).
      const pairs = [
        [5, 6],   // shoulders
        [5, 7],   // left upper arm
        [7, 9],   // left lower arm
        [6, 8],   // right upper arm
        [8, 10],  // right lower arm
        [5, 11],  // left torso
        [6, 12],  // right torso
        [11, 12], // hips
        [11, 13], // left upper leg
        [13, 15], // left lower leg
        [12, 14], // right upper leg
        [14, 16], // right lower leg
      ];

      const minScore = 0.25;
      pairs.forEach(([a, b]) => {
        const p1 = keypoints[a];
        const p2 = keypoints[b];
        if (!p1 || !p2) return;
        if (p1.score < minScore || p2.score < minScore) return;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });

      keypoints.forEach((p) => {
        if (p.score < minScore) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;

    const start = async () => {
      try {
        await initializeValidationEngine();

        const preferredFacingMode = stepId === "side" ? "environment" : "user";
        const getStream = async (facingMode: "user" | "environment") =>
          navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });

        let stream: MediaStream;
        try {
          stream = await getStream(preferredFacingMode);
        } catch {
          // Fallback to default webcam if requested facing mode isn't available.
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        if (!mountedRef.current) return;
        setFeedback("Position yourself in frame...");
        setInitializing(false);

        const scanLoop = async (now: number) => {
          if (!mountedRef.current) return;
          const videoEl = videoRef.current;
          if (!videoEl) return;

          if (now - lastScanAtRef.current >= MIN_SCAN_INTERVAL_MS) {
            lastScanAtRef.current = now;
            const validation = await validateLiveVideoFrame(videoEl, stepId);
            const validColor = validation.valid ? "#22c55e" : "#ef4444";
            setOutlineColor(validColor);
            drawOverlay(validation.overlay, validColor);

            if (validation.valid) {
              stabilityFramesRef.current += 1;
              const pct = Math.min(100, (stabilityFramesRef.current / REQUIRED_FRAMES) * 100);
              setProgress(pct);
              setFeedback(validation.hint || "Perfect. Hold still...");

              if (stabilityFramesRef.current >= REQUIRED_FRAMES) {
                captureFrame(videoEl);
                return;
              }
            } else {
              stabilityFramesRef.current = 0;
              setProgress(0);
              setFeedback(validation.hint || validation.error || "Adjust your position and try again.");
            }
          }

          rafRef.current = requestAnimationFrame(scanLoop);
        };

        rafRef.current = requestAnimationFrame(scanLoop);
      } catch (err) {
        setInitializing(false);
        setFeedback(`Camera initialization failed: ${String(err)}`);
      }
    };

    start();

    return () => {
      mountedRef.current = false;
      cancelLoop();
      stopStream();
    };
  }, [cancelLoop, captureFrame, drawOverlay, stepId, stopStream]);

  return (
    <View style={styles.container}>
      {/* Web-only raw video element for low-latency live scanning */}
      <video ref={videoRef} style={styles.video as any} muted playsInline />
      <canvas ref={overlayCanvasRef} style={styles.overlayCanvas as any} />

      <View style={styles.overlay}>
        {initializing && <ActivityIndicator color="#fff" style={{ marginBottom: 8 }} />}
        <Text style={styles.feedbackText}>{feedback}</Text>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: outlineColor }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#090914",
  },
  video: {
    width: "100%",
    height: 340,
    objectFit: "cover",
    backgroundColor: "#090914",
  },
  overlayCanvas: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: 340,
    pointerEvents: "none",
  },
  overlay: {
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  feedbackText: {
    color: "#fff",
    fontSize: 13,
    marginBottom: 10,
  },
  progressBarBg: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#8338ec",
  },
});
