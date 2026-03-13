import React, { useState } from "react";
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Link } from "expo-router";

export default function SettingsScreen() {
  const [notifications, setNotifications] = useState(true);
  const [qualityMode, setQualityMode] = useState(true);
  const [saveHistory, setSaveHistory] = useState(true);

  const handleSave = () => {
    Alert.alert("Settings saved", "Your local app preferences have been updated.");
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.card}>
        <SettingRow
          label="AI processing notifications"
          value={notifications}
          onValueChange={setNotifications}
        />
        <SettingRow
          label="High-fidelity synthesis mode"
          value={qualityMode}
          onValueChange={setQualityMode}
        />
        <SettingRow
          label="Save local wardrobe history"
          value={saveHistory}
          onValueChange={setSaveHistory}
        />
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
        <Text style={styles.primaryText}>SAVE PREFERENCES</Text>
      </TouchableOpacity>
      <Link href="/" asChild>
        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>BACK TO STUDIO</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

function SettingRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingText}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
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
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#242438",
    backgroundColor: "#101018",
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingText: {
    color: "#dcdcf5",
    fontSize: 13,
    flex: 1,
    marginRight: 10,
  },
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
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#3a3a58",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    height: 46,
  },
  secondaryText: { color: "#d4d4f5", fontSize: 12, fontWeight: "700", letterSpacing: 1 },
});
