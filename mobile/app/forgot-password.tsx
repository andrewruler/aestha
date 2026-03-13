import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Link } from "expo-router";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");

  const handleReset = () => {
    if (!email.trim()) {
      Alert.alert("Missing email", "Please enter your account email.");
      return;
    }
    Alert.alert("Reset link sent", `A password reset email was sent to ${email.trim()}.`);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.subtitle}>
        Enter your email and we will send a secure reset link.
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#777"
        autoCapitalize="none"
        style={styles.input}
      />
      <TouchableOpacity style={styles.button} onPress={handleReset}>
        <Text style={styles.buttonText}>SEND RESET LINK</Text>
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
