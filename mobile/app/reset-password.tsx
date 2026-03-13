import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Link, router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function ResetPasswordScreen() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const handleUpdate = async () => {
    if (password.length < 6) {
      Alert.alert("Weak password", "Use at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords do not match", "Please re-enter matching passwords.");
      return;
    }
    try {
      await updatePassword(password);
      Alert.alert("Password updated", "You can now log in with your new password.");
      router.replace("/login");
    } catch (error) {
      Alert.alert("Update failed", String(error));
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Set New Password</Text>
      <Text style={styles.subtitle}>Create a secure new password for your Aestha account.</Text>
      <View style={styles.form}>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          placeholderTextColor="#777"
          secureTextEntry
          style={styles.input}
        />
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm password"
          placeholderTextColor="#777"
          secureTextEntry
          style={styles.input}
        />
      </View>
      <TouchableOpacity style={styles.button} onPress={handleUpdate}>
        <Text style={styles.buttonText}>UPDATE PASSWORD</Text>
      </TouchableOpacity>
      <Link href="/login" asChild>
        <TouchableOpacity>
          <Text style={styles.linkText}>Back to login</Text>
        </TouchableOpacity>
      </Link>
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
  title: { color: "#fff", fontSize: 28, fontWeight: "800", marginBottom: 10 },
  subtitle: { color: "#9fa0bd", fontSize: 13, lineHeight: 20, marginBottom: 16 },
  form: { gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#2b2b3f",
    backgroundColor: "#11111a",
    color: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    marginTop: 10,
    backgroundColor: "#A990FF",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    height: 48,
  },
  buttonText: { color: "#000", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  linkText: { color: "#d5cfff", fontSize: 13, marginTop: 14, fontWeight: "600" },
});
