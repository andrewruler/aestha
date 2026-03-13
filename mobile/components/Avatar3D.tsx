import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber/native';
import { View } from 'react-native';

// The actual 3D Mannequin component
const Mannequin = ({ bodyRatio }: { bodyRatio: number }) => {
  const groupRef = useRef<any>(null);

  // Slowly rotate the mannequin so the user can see it in 3D space
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.01;
    }
  });

  // Default scales
  const baseHipWidth = 1.5;
  const baseShoulderWidth = 1.5;

  // Apply the math! If the ratio is > 1.0 (broad shoulders), scale the chest up.
  // If the ratio is < 1.0 (wider hips), scale the chest down relative to the hips.
  const dynamicShoulderWidth = baseShoulderWidth * bodyRatio;

  return (
    <group ref={groupRef} position={[0, -1, 0]}>
      {/* Head */}
      <mesh position={[0, 2.5, 0]}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial color="#b0bec5" roughness={0.3} />
      </mesh>

      {/* Torso / Shoulders (Dynamically Scaled) */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[dynamicShoulderWidth, 1.5, 0.8]} />
        <meshStandardMaterial color="#6200ee" roughness={0.5} />
      </mesh>

      {/* Hips (Static base to show the contrast) */}
      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[baseHipWidth, 1.0, 0.9]} />
        <meshStandardMaterial color="#03dac6" roughness={0.5} />
      </mesh>
    </group>
  );
};

// The wrapper that provides the WebGL Canvas to React Native
export default function Avatar3D({ rawRatio }: { rawRatio: string | null }) {
  // Convert the string ratio from Phase 2 back into a safe float, default to 1.0
  const ratioFloat = rawRatio && !isNaN(parseFloat(rawRatio)) ? parseFloat(rawRatio) : 1.0;

  return (
    <View style={{ height: 350, width: '100%', backgroundColor: '#121212', borderRadius: 15, overflow: 'hidden' }}>
      <Canvas camera={{ position: [0, 1, 5] }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={0.8} />
        <pointLight position={[-10, -10, -10]} intensity={0.3} />
        
        <Mannequin bodyRatio={ratioFloat} />
      </Canvas>
    </View>
  );
}