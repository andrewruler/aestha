import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Link, router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace("/");
    } catch (error) {
      Alert.alert("Login failed", String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Welcome Back</Text>
      <Text style={styles.subtitle}>Log in to save looks, sync preferences, and continue your studio flow.</Text>
      <View style={styles.form}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#777"
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#777"
          secureTextEntry
          style={styles.input}
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>LOG IN</Text>}
        </TouchableOpacity>
      </View>
      <Link href="/forgot-password" asChild>
        <TouchableOpacity>
          <Text style={styles.linkText}>Forgot password?</Text>
        </TouchableOpacity>
      </Link>
      <Link href="/signup" asChild>
        <TouchableOpacity>
          <Text style={styles.linkText}>Create account</Text>
        </TouchableOpacity>
      </Link>
      <Link href="/" asChild>
        <TouchableOpacity>
          <Text style={styles.subtleLink}>Continue as guest</Text>
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
  title: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 10,
  },
  subtitle: {
    color: "#9fa0bd",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 24,
  },
  form: {
    gap: 10,
    marginBottom: 14,
  },
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
    marginTop: 6,
    backgroundColor: "#A990FF",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    height: 48,
  },
  buttonText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  linkText: {
    color: "#d5cfff",
    fontSize: 13,
    marginTop: 14,
    fontWeight: "600",
  },
  subtleLink: {
    color: "#8e8ea9",
    fontSize: 12,
    marginTop: 12,
  },
});
