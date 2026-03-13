import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

const REQUIRED_SHOTS = ['front', 'side', 'face'];

export default function CaptureWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [photos, setPhotos] = useState({
    front: null,
    side: null,
    face: null
  });
  const [validationError, setValidationError] = useState("");

  const handleNext = () => {
    if (currentStep < REQUIRED_SHOTS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      console.log("All photos captured! Ready to upload:", photos);
      // Here is where we will call submitAllPhotos() later
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Step {currentStep + 1}: Capture your {REQUIRED_SHOTS[currentStep]}
      </Text>
      
      {/* We will put the Camera or Image Picker here next */}
      <View style={styles.placeholderBox}>
        <Text>Camera Area</Text>
      </View>

      <Button title="Next Step" onPress={handleNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  placeholderBox: { height: 300, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }
});