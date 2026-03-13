import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

const STEPS = [
  {
    title: "Capture With Precision",
    body: "Use live scan or upload mode. Keep full body in frame and strong lighting to unlock accurate body math.",
  },
  {
    title: "Use AI Insights",
    body: "After analysis, open Insights for body geometry guidance, color season hints, and stylist suggestions.",
  },
  {
    title: "Synthesize & Save",
    body: "Select items from the Archive, run try-on synthesis, and save your favorite looks in Wardrobe.",
  },
] as const;

export default function TutorialScreen() {
  const { markTutorialSeen } = useAuth();
  const [step, setStep] = useState(0);
  const current = useMemo(() => STEPS[step], [step]);

  const completeTutorial = () => {
    markTutorialSeen();
    router.replace("/");
  };

  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>Quick Tutorial</Text>
      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.body}>{current.body}</Text>

      <View style={styles.dotsRow}>
        {STEPS.map((_, idx) => (
          <View key={idx} style={[styles.dot, idx === step && styles.dotActive]} />
        ))}
      </View>

      {step < STEPS.length - 1 ? (
        <TouchableOpacity style={styles.primaryButton} onPress={() => setStep((prev) => prev + 1)}>
          <Text style={styles.primaryText}>NEXT</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.primaryButton} onPress={completeTutorial}>
          <Text style={styles.primaryText}>ENTER STUDIO</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={completeTutorial}>
        <Text style={styles.skipText}>Skip tutorial</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#060609",
    padding: 24,
    justifyContent: "center",
  },
  kicker: {
    color: "#A990FF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 12,
  },
  body: {
    color: "#a9a9c0",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2e2e44",
  },
  dotActive: {
    backgroundColor: "#A990FF",
  },
  primaryButton: {
    backgroundColor: "#A990FF",
    borderRadius: 999,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  skipText: {
    marginTop: 14,
    color: "#8d8da9",
    fontSize: 12,
    textAlign: "center",
  },
});
