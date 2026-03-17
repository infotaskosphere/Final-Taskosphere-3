import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { ScreenContainer } from '@/components/screen-container';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await login(email, password);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="justify-center p-6">
        <View className="gap-8">
          {/* Header */}
          <View className="items-center gap-2">
            <Text className="text-4xl font-bold text-foreground">Taskosphere</Text>
            <Text className="text-base text-muted">Sign in to your account</Text>
          </View>

          {/* Error Message */}
          {error ? (
            <View className="bg-error/10 border border-error rounded-lg p-4">
              <Text className="text-error text-sm">{error}</Text>
            </View>
          ) : null}

          {/* Email Input */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Email</Text>
            <TextInput
              className="border border-border rounded-lg px-4 py-3 text-foreground bg-surface"
              placeholder="Enter your email"
              placeholderTextColor="#9BA1A6"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Password Input */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Password</Text>
            <TextInput
              className="border border-border rounded-lg px-4 py-3 text-foreground bg-surface"
              placeholder="Enter your password"
              placeholderTextColor="#9BA1A6"
              value={password}
              onChangeText={setPassword}
              editable={!loading}
              secureTextEntry
            />
          </View>

          {/* Login Button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            className="bg-primary rounded-lg py-4 items-center"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-semibold text-base">Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Register Link */}
          <View className="flex-row justify-center gap-2">
            <Text className="text-muted">Don't have an account?</Text>
            <TouchableOpacity onPress={() => router.push('/register')} disabled={loading}>
              <Text className="text-primary font-semibold">Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
