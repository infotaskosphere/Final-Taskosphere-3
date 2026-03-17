import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { ScreenContainer } from '@/components/screen-container';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { register } = useAuth();

  const handleRegister = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await register(email, password, fullName, 'staff');
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="justify-center p-6">
        <View className="gap-6">
          {/* Header */}
          <View className="items-center gap-2">
            <Text className="text-4xl font-bold text-foreground">Create Account</Text>
            <Text className="text-base text-muted">Join Taskosphere</Text>
          </View>

          {/* Error Message */}
          {error ? (
            <View className="bg-error/10 border border-error rounded-lg p-4">
              <Text className="text-error text-sm">{error}</Text>
            </View>
          ) : null}

          {/* Full Name Input */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Full Name</Text>
            <TextInput
              className="border border-border rounded-lg px-4 py-3 text-foreground bg-surface"
              placeholder="Enter your full name"
              placeholderTextColor="#9BA1A6"
              value={fullName}
              onChangeText={setFullName}
              editable={!loading}
            />
          </View>

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

          {/* Confirm Password Input */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-foreground">Confirm Password</Text>
            <TextInput
              className="border border-border rounded-lg px-4 py-3 text-foreground bg-surface"
              placeholder="Confirm your password"
              placeholderTextColor="#9BA1A6"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!loading}
              secureTextEntry
            />
          </View>

          {/* Register Button */}
          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading}
            className="bg-primary rounded-lg py-4 items-center"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-semibold text-base">Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Login Link */}
          <View className="flex-row justify-center gap-2">
            <Text className="text-muted">Already have an account?</Text>
            <TouchableOpacity onPress={() => router.push('/login')} disabled={loading}>
              <Text className="text-primary font-semibold">Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
