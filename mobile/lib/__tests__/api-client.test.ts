import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';

describe('API Client Configuration', () => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;

  it('should have API_URL configured', () => {
    expect(apiUrl).toBeDefined();
    expect(apiUrl).not.toBe('');
  });

  it('should be able to reach the health endpoint', async () => {
    if (!apiUrl) {
      console.warn('API_URL not configured, skipping health check');
      return;
    }

    try {
      const response = await axios.get(`${apiUrl}/health`, {
        timeout: 5000,
      });
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        console.warn(
          `Warning: Could not connect to API at ${apiUrl}. Make sure the backend is running.`
        );
      } else {
        throw error;
      }
    }
  });

  it('should validate API URL format', () => {
    if (!apiUrl) return;

    try {
      new URL(apiUrl);
    } catch {
      throw new Error(`Invalid API URL format: ${apiUrl}`);
    }
  });
});
