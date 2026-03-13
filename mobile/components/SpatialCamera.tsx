import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Button } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
// In a full implementation, you would import and use a pose/landmark detector here.

type SpatialCameraProps = {
  // Called with the captured image URI (if any) and the computed ratio.
  onCapture: (uri: string | null, bodyRatio: string | null) => void;
};

export default function SpatialCamera({ onCapture }: SpatialCameraProps) {
  const device = useCameraDevice('front');
  const cameraRef = useRef<Camera | null>(null);
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