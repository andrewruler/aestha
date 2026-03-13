import React, { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Link, router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setLoading(true);
    try {
      await signUp(name, email, password);
      router.replace("/tutorial");
    } catch (error) {
      Alert.alert("Sign up failed", String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Set up your account to save style DNA, wardrobe, and synthesis history.</Text>
      <View style={styles.form}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Full name"
          placeholderTextColor="#777"
          style={styles.input}
        />
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
          placeholder="Password (min 6 chars)"
          placeholderTextColor="#777"
          secureTextEntry
          style={styles.input}
        />
        <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>CREATE ACCOUNT</Text>}
        </TouchableOpacity>
      </View>
      <Link href="/login" asChild>
        <TouchableOpacity>
          <Text style={styles.linkText}>Already have an account? Log in</Text>
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
});
