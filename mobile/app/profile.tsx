import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Link, router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function ProfileScreen() {
  const { user, signOut, hasSeenTutorial } = useAuth();

  if (!user) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.info}>You are browsing as guest.</Text>
        <Link href="/login" asChild>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryText}>LOG IN</Text>
          </TouchableOpacity>
        </Link>
      </View>
    );
  }

  const handleSignOut = () => {
    signOut();
    Alert.alert("Signed out", "You are now in guest mode.");
    router.replace("/");
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{user.name}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user.email}</Text>
        <Text style={styles.label}>Tutorial</Text>
        <Text style={styles.value}>{hasSeenTutorial ? "Completed" : "Not completed"}</Text>
      </View>
      <Link href="/settings" asChild>
        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>OPEN SETTINGS</Text>
        </TouchableOpacity>
      </Link>
      <TouchableOpacity style={styles.primaryButton} onPress={handleSignOut}>
        <Text style={styles.primaryText}>SIGN OUT</Text>
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
  title: { color: "#fff", fontSize: 28, fontWeight: "800", marginBottom: 18 },
  info: { color: "#a1a1c0", fontSize: 13, marginBottom: 18 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#242438",
    backgroundColor: "#101018",
    padding: 14,
    gap: 4,
    marginBottom: 14,
  },
  label: { color: "#8f8fb1", fontSize: 11, marginTop: 6 },
  value: { color: "#ececff", fontSize: 14, fontWeight: "600" },
  primaryButton: {
    marginTop: 8,
    backgroundColor: "#A990FF",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    height: 46,
  },
  primaryText: { color: "#000", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#3a3a58",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    height: 46,
  },
  secondaryText: { color: "#d4d4f5", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
});
