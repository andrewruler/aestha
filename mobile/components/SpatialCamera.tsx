import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Button, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// In a full implementation, you would import and use a pose/landmark detector here.

type SpatialCameraProps = {
  // Called with the captured image URI (if any) and the computed ratio.
  onCapture: (uri: string | null, bodyRatio: string | null) => void;
};

// ---------- Web implementation (uses expo-camera/webcam) ----------

function WebSpatialCamera({ onCapture }: SpatialCameraProps) {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [bodyRatio, setBodyRatio] = useState<string | null>('1.0');

  useEffect(() => {
    if (!permission) {
      // Initial permission request
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (!permission) {
    return (
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ marginBottom: 8 }}>Camera permission not granted.</Text>
        <Button title="Enable webcam" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
      />

      <View style={styles.overlay}>
        <Text style={styles.dataText}>
          Shoulder/Hip Ratio: {bodyRatio}
        </Text>
        <View style={styles.buttonRow}>
          <Button title="Wider Hips" onPress={() => setBodyRatio('0.8')} />
          <Button title="Balanced" onPress={() => setBodyRatio('1.0')} />
          <Button title="Broad Shoulders" onPress={() => setBodyRatio('1.3')} />
        </View>
        <Button
          title="Capture & Analyze"
          onPress={async () => {
            try {
              if (!cameraRef.current) {
                onCapture(null, bodyRatio);
                return;
              }
              const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
              });
              const uri = photo?.uri ?? null;
              onCapture(uri, bodyRatio);
            } catch (e) {
              console.warn('Web capture failed', e);
              onCapture(null, bodyRatio);
            }
          }}
        />
      </View>
    </View>
  );
}

// ---------- Native implementation (Android/iOS, react-native-vision-camera) ----------

// Dynamically require VisionCamera only on native platforms (Android/iOS),
// since it does not support web.
let VisionCamera: any = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  VisionCamera = require('react-native-vision-camera');
}

function NativeSpatialCamera({ onCapture }: SpatialCameraProps) {
  const { Camera, useCameraDevice } = VisionCamera;

  const device = useCameraDevice('front');
  const cameraRef = useRef<any>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [bodyRatio, setBodyRatio] = useState<string | null>('1.0');

  useEffect(() => {
    (async () => {
      const status = await Camera.requestCameraPermission();
      setHasPermission(status === 'granted');
    })();
  }, []);

  if (!hasPermission || !device) return <Text>No Camera Access</Text>;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
      />
      
      <View style={styles.overlay}>
        <Text style={styles.dataText}>
          Shoulder/Hip Ratio: {bodyRatio}
        </Text>
        <View style={styles.buttonRow}>
          <Button title="Wider Hips" onPress={() => setBodyRatio('0.8')} />
          <Button title="Balanced" onPress={() => setBodyRatio('1.0')} />
          <Button title="Broad Shoulders" onPress={() => setBodyRatio('1.3')} />
        </View>
        <Button
          title="Capture & Analyze"
          onPress={async () => {
            try {
              if (!cameraRef.current) {
                onCapture(null, bodyRatio);
                return;
              }
              const photo = await cameraRef.current.takePhoto?.();
              const uri = photo?.path ? `file://${photo.path}` : null;
              onCapture(uri, bodyRatio);
            } catch (e) {
              console.warn('Capture failed', e);
              onCapture(null, bodyRatio);
            }
          }}
        />
      </View>
    </View>
  );
}

// ---------- Platform switcher ----------

export default function SpatialCamera(props: SpatialCameraProps) {
  if (Platform.OS === 'web') {
    return <WebSpatialCamera {...props} />;
  }

  return <NativeSpatialCamera {...props} />;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  dataText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  }
});