import { initializeMediaPipe } from "./visionValidation";

export type BodyMeasurements = {
  shoulderCm: number;
  hipCm: number;
  calculatedRatio: string;
};

const loadImage = (imageUri: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUri;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for body math."));
  });

const getScore = (keypoints: any[], name: string, fallbackIndex: number) =>
  keypoints.find((kp) => kp.name === name)?.score ?? keypoints[fallbackIndex]?.score ?? 0;

const getPoint = (keypoints: any[], name: string, fallbackIndex: number) =>
  keypoints.find((kp) => kp.name === name) ?? keypoints[fallbackIndex];

export const calculateBodyMath = async (
  imageUri: string,
  userHeightCm: number
): Promise<BodyMeasurements | null> => {
  if (!userHeightCm || !isFinite(userHeightCm) || userHeightCm <= 0) return null;

  const detector = await initializeMediaPipe();
  if (!detector) return null;

  try {
    const img = await loadImage(imageUri);
    const poses = await detector.estimatePoses(img);
    if (!poses?.length) return null;

    const keypoints = poses[0].keypoints ?? [];

    const nose = getPoint(keypoints, "nose", 0);
    const leftAnkle = getPoint(keypoints, "left_ankle", 15);
    const rightAnkle = getPoint(keypoints, "right_ankle", 16);
    const leftShoulder = getPoint(keypoints, "left_shoulder", 5);
    const rightShoulder = getPoint(keypoints, "right_shoulder", 6);
    const leftHip = getPoint(keypoints, "left_hip", 11);
    const rightHip = getPoint(keypoints, "right_hip", 12);

    if (!nose || !leftAnkle || !rightAnkle || !leftShoulder || !rightShoulder || !leftHip || !rightHip) {
      return null;
    }

    const visibilityThreshold = 0.35;
    const noseScore = getScore(keypoints, "nose", 0);
    const leftAnkleScore = getScore(keypoints, "left_ankle", 15);
    const rightAnkleScore = getScore(keypoints, "right_ankle", 16);
    const leftShoulderScore = getScore(keypoints, "left_shoulder", 5);
    const rightShoulderScore = getScore(keypoints, "right_shoulder", 6);
    const leftHipScore = getScore(keypoints, "left_hip", 11);
    const rightHipScore = getScore(keypoints, "right_hip", 12);

    if (
      noseScore < visibilityThreshold ||
      leftAnkleScore < visibilityThreshold ||
      rightAnkleScore < visibilityThreshold ||
      leftShoulderScore < visibilityThreshold ||
      rightShoulderScore < visibilityThreshold ||
      leftHipScore < visibilityThreshold ||
      rightHipScore < visibilityThreshold
    ) {
      return null;
    }

    const ankleY = (leftAnkle.y + rightAnkle.y) / 2;
    const heightPixels = ankleY - nose.y;
    if (!isFinite(heightPixels) || heightPixels <= 0) return null;

    const shoulderWidthPixels = Math.abs(rightShoulder.x - leftShoulder.x);
    const hipWidthPixels = Math.abs(rightHip.x - leftHip.x);
    if (!isFinite(shoulderWidthPixels) || !isFinite(hipWidthPixels) || shoulderWidthPixels <= 0 || hipWidthPixels <= 0) {
      return null;
    }

    const pixelToCmRatio = userHeightCm / heightPixels;
    const shoulderCm = Math.max(1, Math.round(shoulderWidthPixels * pixelToCmRatio));
    const hipCm = Math.max(1, Math.round(hipWidthPixels * pixelToCmRatio));

    return {
      shoulderCm,
      hipCm,
      calculatedRatio: (shoulderCm / hipCm).toFixed(2),
    };
  } catch {
    return null;
  }
};
