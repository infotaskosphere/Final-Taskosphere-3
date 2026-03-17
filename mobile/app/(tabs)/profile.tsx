import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { ScreenContainer } from "@/components/screen-container";
import { useState } from "react";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setLoggingOut(false);
    }
  };

  if (!user) {
    return (
      <ScreenContainer className="justify-center items-center">
        <ActivityIndicator size="large" color="#0a7ea4" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-4 gap-6">
        {/* Header */}
        <View className="gap-2">
          <Text className="text-2xl font-bold text-foreground">Profile</Text>
          <Text className="text-sm text-muted">Manage your account</Text>
        </View>

        {/* User Info Card */}
        <View className="bg-surface rounded-2xl p-6 border border-border gap-4">
          <View className="items-center gap-3">
            <View className="w-16 h-16 rounded-full bg-primary items-center justify-center">
              <Text className="text-white text-2xl font-bold">
                {user.full_name?.charAt(0)?.toUpperCase()}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-xl font-bold text-foreground">{user.full_name}</Text>
              <Text className="text-sm text-muted">{user.email}</Text>
            </View>
          </View>

          <View className="border-t border-border pt-4 gap-3">
            <View className="flex-row justify-between items-center">
              <Text className="text-muted">Role</Text>
              <Text className="text-foreground font-semibold capitalize">{user.role}</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-muted">Status</Text>
              <View className="flex-row items-center gap-2">
                <View className="w-2 h-2 rounded-full bg-success" />
                <Text className="text-foreground font-semibold capitalize">{user.status}</Text>
              </View>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-muted">Account</Text>
              <Text className="text-foreground font-semibold">
                {user.is_active ? "Active" : "Inactive"}
              </Text>
            </View>
          </View>
        </View>

        {/* Settings Section */}
        <View className="gap-3">
          <Text className="text-lg font-semibold text-foreground">Settings</Text>

          <TouchableOpacity className="bg-surface rounded-lg p-4 border border-border flex-row justify-between items-center">
            <Text className="text-foreground font-semibold">Notifications</Text>
            <Text className="text-muted">→</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-surface rounded-lg p-4 border border-border flex-row justify-between items-center">
            <Text className="text-foreground font-semibold">Theme</Text>
            <Text className="text-muted">→</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-surface rounded-lg p-4 border border-border flex-row justify-between items-center">
            <Text className="text-foreground font-semibold">Language</Text>
            <Text className="text-muted">→</Text>
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View className="gap-3">
          <Text className="text-lg font-semibold text-foreground">About</Text>

          <TouchableOpacity className="bg-surface rounded-lg p-4 border border-border flex-row justify-between items-center">
            <Text className="text-foreground font-semibold">App Version</Text>
            <Text className="text-muted">1.0.0</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-surface rounded-lg p-4 border border-border flex-row justify-between items-center">
            <Text className="text-foreground font-semibold">Help & Support</Text>
            <Text className="text-muted">→</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-surface rounded-lg p-4 border border-border flex-row justify-between items-center">
            <Text className="text-foreground font-semibold">Privacy Policy</Text>
            <Text className="text-muted">→</Text>
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          onPress={handleLogout}
          disabled={loggingOut}
          className="bg-error rounded-lg py-4 items-center mt-4"
          style={{ opacity: loggingOut ? 0.6 : 1 }}
        >
          {loggingOut ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-semibold text-base">Sign Out</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
