import axios from 'axios';

/**
 * agentAutoAuth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Automatically authenticates the Taskosphere Desktop Agent running on the
 * user's local machine.
 * 
 * Flow:
 * 1. User logs into Taskosphere web app
 * 2. Web app detects local agent at http://localhost:7432
 * 3. Web app pushes JWT token + user_id to agent
 * 4. Agent starts monitoring automatically (no manual login)
 * 
 * This runs silently in the background. User never sees it.
 */

const AGENT_URL = 'http://localhost:7432';
const AUTH_ENDPOINT = '/api/auth';

// Track auth state to avoid duplicate pushes
let isAuthed = false;
let lastAuthTime = 0;
const AUTH_COOLDOWN = 30000; // 30 seconds between auth attempts

/**
 * Check if agent is running on localhost
 */
export async function isAgentRunning() {
  try {
    const response = await axios.get(`${AGENT_URL}/health`, {
      timeout: 2000,
      validateStatus: () => true,
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Push authentication to the local agent
 * @param {string} token - JWT token from web app
 * @param {string} userId - User ID from web app
 * @returns {boolean} Success status
 */
export async function pushAuthToAgent(token, userId) {
  // Prevent spam
  const now = Date.now();
  if (now - lastAuthTime < AUTH_COOLDOWN) {
    return isAuthed;
  }

  try {
    // Check if agent is running
    const agentRunning = await isAgentRunning();
    if (!agentRunning) {
      console.log('[AgentAutoAuth] Agent not detected on localhost:7432');
      return false;
    }

    // Push auth to agent
    const response = await axios.post(
      `${AGENT_URL}${AUTH_ENDPOINT}`,
      { token, user_id: userId },
      {
        timeout: 5000,
        validateStatus: () => true,
      }
    );

    if (response.status === 200 && response.data?.success) {
      isAuthed = true;
      lastAuthTime = now;
      console.log('[AgentAutoAuth] ✓ Agent authenticated successfully');
      console.log(`[AgentAutoAuth] Agent ID: ${response.data.agent_id}`);
      return true;
    } else {
      console.warn('[AgentAutoAuth] Agent auth failed:', response.data);
      return false;
    }
  } catch (error) {
    console.error('[AgentAutoAuth] Failed to push auth to agent:', error.message);
    return false;
  }
}

/**
 * Get agent auth status
 */
export function isAgentAuthed() {
  return isAuthed;
}

/**
 * Reset auth state (for logout)
 */
export function resetAgentAuth() {
  isAuthed = false;
  lastAuthTime = 0;
}

/**
 * Auto-auth hook: Call this after successful login
 * Detects agent and pushes credentials automatically
 * 
 * @param {string} token - JWT token
 * @param {string} userId - User ID
 */
export async function autoAuthenticateAgent(token, userId) {
  if (!token || !userId) {
    console.warn('[AgentAutoAuth] Missing token or userId');
    return false;
  }

  console.log('[AgentAutoAuth] Attempting to auto-authenticate agent...');
  return await pushAuthToAgent(token, userId);
}
