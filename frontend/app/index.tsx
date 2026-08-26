import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts } from "@/src/theme";

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
  return <Redirect href={user ? "/(tabs)/debug" : "/login"} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontFamily: fonts.sansBold,
    fontWeight: "700",
    fontSize: 40,
    color: colors.onBackground,
    letterSpacing: 1,
  },
});
