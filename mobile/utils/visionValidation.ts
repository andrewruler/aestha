import { Platform } from "react-native";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import * as poseDetection from "@tensorflow-models/pose-detection";

export type StepId = "front" | "side" | "face" | "measurements";
export type ValidationResult = { valid: boolean; error?: string; meta?: Record<string, number> };

let detectorPromise: Promise<poseDetection.PoseDetector | null> | null = null;

const MIN_CONFIDENCE = 0.5;
const DARK_THRESHOLD = 40;
const BRIGHT_THRESHOLD = 240;

const loadImage = (imageUri: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUri;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to read image data."));
  });

const getScore = (keypoints: any[], name: string, fallbackIndex: number) =>
  keypoints.find((kp) => kp.name === name)?.score ?? keypoints[fallbackIndex]?.score ?? 0;

const validateKeypointsForStep = (keypoints: any[], stepId: StepId): ValidationResult => {
  const nose = getScore(keypoints, "nose", 0);
  const leftEye = getScore(keypoints, "left_eye", 1);
  const rightEye = getScore(keypoints, "right_eye", 2);
  const leftShoulder = getScore(keypoints, "left_shoulder", 5);
  const rightShoulder = getScore(keypoints, "right_shoulder", 6);
  const leftWrist = getScore(keypoints, "left_wrist", 9);
  const rightWrist = getScore(keypoints, "right_wrist", 10);
  const leftHip = getScore(keypoints, "left_hip", 11);
  const rightHip = getScore(keypoints, "right_hip", 12);
  const leftAnkle = getScore(keypoints, "left_ankle", 15);
  const rightAnkle = getScore(keypoints, "right_ankle", 16);

  if (stepId === "front" || stepId === "side") {
    if (nose < MIN_CONFIDENCE) {
      return { valid: false, error: "Head is cut off. Please frame your entire body." };
    }
    if (leftAnkle < MIN_CONFIDENCE || rightAnkle < MIN_CONFIDENCE) {
      return { valid: false, error: "Both feet must be visible to calculate height accurately." };
    }
    if (
      leftShoulder < MIN_CONFIDENCE ||
      rightShoulder < MIN_CONFIDENCE ||
      leftHip < MIN_CONFIDENCE ||
      rightHip < MIN_CONFIDENCE
    ) {
      return {
        valid: false,
        error: "Torso is partially hidden. Stand clear of obstacles and keep shoulders/hips visible.",
      };
    }
    if (leftWrist < MIN_CONFIDENCE || rightWrist < MIN_CONFIDENCE) {
      return { valid: false, error: "Keep both arms visible and relaxed at your sides." };
    }
  }

  if (stepId === "face") {
    if (nose < MIN_CONFIDENCE || (leftEye < MIN_CONFIDENCE && rightEye < MIN_CONFIDENCE)) {
      return { valid: false, error: "Face is not clear. Move closer and keep your face centered." };
    }
  }

  return {
    valid: true,
    meta: {
      nose,
      leftEye,
      rightEye,
      leftShoulder,
      rightShoulder,
      leftWrist,
      rightWrist,
      leftHip,
      rightHip,
      leftAnkle,
      rightAnkle,
    },
  };
};

const computeAverageLuminance = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
): number => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to initialize canvas context.");
  }

  const targetWidth = 256;
  const ratio = sourceHeight / sourceWidth;
  canvas.width = targetWidth;
  canvas.height = Math.max(1, Math.round(targetWidth * ratio));

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let totalLuminance = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return totalLuminance / (data.length / 4);
};

const ensureDetector = async (): Promise<poseDetection.PoseDetector | null> => {
  if (Platform.OS !== "web") return null;
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await tf.ready();
      if (tf.getBackend() !== "webgl") {
        await tf.setBackend("webgl");
      }
      return poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          enableSmoothing: true,
        }
      );
    })();
  }
  return detectorPromise;
};

export const initializeValidationEngine = async () => {
  await ensureDetector();
};

export const validatePose = async (imageUri: string, stepId: StepId): Promise<ValidationResult> => {
  if (Platform.OS !== "web" || stepId === "measurements") return { valid: true };

  try {
    const detector = await ensureDetector();
    if (!detector) return { valid: true };

    const img = await loadImage(imageUri);
    const poses = await detector.estimatePoses(img);

    if (!poses?.length) {
      return { valid: false, error: "No person detected. Please step into frame." };
    }

    const keypoints = poses[0].keypoints ?? [];
    return validateKeypointsForStep(keypoints, stepId);
  } catch (err) {
    return { valid: false, error: `Pose validation failed: ${String(err)}` };
  }
};

export const validateLighting = async (imageUri: string): Promise<ValidationResult> => {
  if (Platform.OS !== "web") return { valid: true };

  try {
    const img = await loadImage(imageUri);
    const avgLuminance = computeAverageLuminance(img, img.width, img.height);

    if (avgLuminance < DARK_THRESHOLD) {
      return { valid: false, error: "Photo is too dark. Turn on lights and try again.", meta: { avgLuminance } };
    }

    if (avgLuminance > BRIGHT_THRESHOLD) {
      return { valid: false, error: "Photo is too bright or washed out. Reduce direct light.", meta: { avgLuminance } };
    }

    return { valid: true, meta: { avgLuminance } };
  } catch (err) {
    return { valid: false, error: `Lighting validation failed: ${String(err)}` };
  }
};

export const validateLiveVideoFrame = async (
  videoEl: HTMLVideoElement,
  stepId: StepId
): Promise<ValidationResult> => {
  if (Platform.OS !== "web") return { valid: true };
  if (videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) {
    return { valid: false, error: "Waiting for camera stream..." };
  }

  try {
    const detector = await ensureDetector();
    if (!detector) return { valid: true };

    const poses = await detector.estimatePoses(videoEl);
    if (!poses?.length) {
      return { valid: false, error: "No person detected. Step fully into frame." };
    }

    const poseResult = validateKeypointsForStep(poses[0].keypoints ?? [], stepId);
    if (!poseResult.valid) return poseResult;

    const avgLuminance = computeAverageLuminance(videoEl, videoEl.videoWidth, videoEl.videoHeight);
    if (avgLuminance < DARK_THRESHOLD) {
      return { valid: false, error: "Too dark. Add light to continue.", meta: { avgLuminance } };
    }
    if (avgLuminance > BRIGHT_THRESHOLD) {
      return { valid: false, error: "Too bright. Reduce harsh light.", meta: { avgLuminance } };
    }

    return {
      valid: true,
      meta: {
        ...(poseResult.meta ?? {}),
        avgLuminance,
      },
    };
  } catch (err) {
    return { valid: false, error: `Live scan error: ${String(err)}` };
  }
};

export const validateCapturedShot = async (
  imageUri: string,
  stepId: StepId
): Promise<ValidationResult> => {
  const poseResult = await validatePose(imageUri, stepId);
  if (!poseResult.valid) return poseResult;

  const lightResult = await validateLighting(imageUri);
  if (!lightResult.valid) return lightResult;

  return {
    valid: true,
    meta: {
      ...(poseResult.meta ?? {}),
      ...(lightResult.meta ?? {}),
    },
  };
};