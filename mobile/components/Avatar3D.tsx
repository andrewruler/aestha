/* eslint-disable react/no-unknown-property */
import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber/native";
import { View } from "react-native";

interface MannequinProps {
  shoulderCm: number;
  hipCm: number;
}

const Mannequin = ({ shoulderCm, hipCm }: MannequinProps) => {
  const groupRef = useRef<any>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.01;
    }
  });

  // Convert real-world centimeters into Three.js viewport units.
  const scaleFactor = 30;
  const shoulderWidth3D = shoulderCm / scaleFactor;
  const hipWidth3D = hipCm / scaleFactor;

  return (
    <group ref={groupRef} position={[0, -1, 0]}>
      <mesh position={[0, 2.5, 0]}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial color="#d7c8ff" emissive="#5b3ec8" emissiveIntensity={0.45} roughness={0.25} />
      </mesh>

      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[shoulderWidth3D, 1.5, 0.8]} />
        <meshStandardMaterial color="#8be9fd" emissive="#1f6f8b" emissiveIntensity={0.25} roughness={0.35} />
      </mesh>

      <mesh position={[0, -0.2, 0]}>
        <boxGeometry args={[hipWidth3D, 1.0, 0.9]} />
        <meshStandardMaterial color="#50fa7b" emissive="#137333" emissiveIntensity={0.22} roughness={0.35} />
      </mesh>
    </group>
  );
};

export default function Avatar3D({
  shoulderCm,
  hipCm,
}: {
  shoulderCm?: number;
  hipCm?: number;
}) {
  const safeShoulder = shoulderCm || 45;
  const safeHip = hipCm || 45;

  return (
    <View
      style={{
        height: 350,
        width: "100%",
        backgroundColor: "#0A0A0A",
        borderRadius: 16,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#1A1A1A",
      }}
    >
      <Canvas camera={{ position: [0, 1, 5.2] }}>
        <ambientLight intensity={0.9} />
        <pointLight position={[10, 10, 10]} intensity={1.05} />
        <pointLight position={[-10, -10, -10]} intensity={0.45} />

        <Mannequin shoulderCm={safeShoulder} hipCm={safeHip} />
      </Canvas>
    </View>
  );
}