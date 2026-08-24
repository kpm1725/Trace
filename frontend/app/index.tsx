import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, type } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center} testID="root-loading">
        <Text style={styles.brand}>Trace</Text>
        <ActivityIndicator color={colors.brand} style={{ marginTop: 16 }} />
      </View>
    );
  }
  return <Redirect href={user ? "/home" : "/login"} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontFamily: fonts.sansBold,
    fontSize: type.hero,
    color: colors.onSurface,
    letterSpacing: 2,
  },
});
