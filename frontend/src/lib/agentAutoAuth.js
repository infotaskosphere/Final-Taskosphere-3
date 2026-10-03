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
const DEBUG_AGENT_AUTO_AUTH =
  import.meta.env?.VITE_DEBUG_AGENT_AUTOAUTH === 'true' ||
  (typeof window !== 'undefined' && window.__TASKOSPHERE_DEBUG_AGENT_AUTOAUTH__ === true);

// Track auth state to avoid duplicate pushes
let isAuthed = false;
let lastAuthTime = 0;
const AUTH_COOLDOWN = 30000; // 30 seconds between auth attempts

// ── Probe throttling ───────────────────────────────────────────────────────
// The desktop agent is optional (Windows only). Every request to a closed
// localhost port makes Chrome print "net::ERR_CONNECTION_REFUSED" in the
// console, and that log cannot be suppressed with try/catch. So we avoid
// sending the request unless it is likely to succeed:
//   • never on non-Windows devices (the agent only exists for Windows)
//   • at most once per page session
//   • after a miss, not again for ABSENT_TTL_MS (stored in localStorage)
//   • users who have the agent are remembered (INSTALLED_KEY) and always probed
const ABSENT_KEY = 'taskosphere_agent_absent_until';
const INSTALLED_KEY = 'taskosphere_agent_installed';
const ABSENT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

let probeInFlight = null;
let absentThisSession = false;

function readFlag(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeFlag(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
function clearFlag(key) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

function shouldSkipProbe() {
  if (typeof window === 'undefined') return true;
  if (absentThisSession) return true;
  if (readFlag(INSTALLED_KEY) === '1') return false;
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (!/Windows/i.test(ua)) return true;
  const until = Number(readFlag(ABSENT_KEY) || 0);
  return until > Date.now();
}

/**
 * Force the next check to hit localhost again (e.g. right after the user
 * installs the agent). Call from a "Connect agent" button if you add one.
 */
export function resetAgentProbeCache() {
  absentThisSession = false;
  clearFlag(ABSENT_KEY);
}

/**
 * Check if agent is running on localhost
 */
export async function isAgentRunning() {
  if (shouldSkipProbe()) return false;
  if (probeInFlight) return probeInFlight;

  probeInFlight = (async () => {
    try {
      const response = await axios.get(`${AGENT_URL}/health`, {
        timeout: 2000,
        validateStatus: () => true,
      });
      const ok = response.status === 200;
      if (ok) {
        writeFlag(INSTALLED_KEY, '1');
        clearFlag(ABSENT_KEY);
      } else {
        absentThisSession = true;
      }
      return ok;
    } catch {
      absentThisSession = true;
      if (readFlag(INSTALLED_KEY) !== '1') {
        writeFlag(ABSENT_KEY, String(Date.now() + ABSENT_TTL_MS));
      }
      return false;
    } finally {
      probeInFlight = null;
    }
  })();

  return probeInFlight;
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
      // The desktop agent is optional. A missing local agent is normal for
      // users running the web app and should not pollute the browser console.
      if (DEBUG_AGENT_AUTO_AUTH) {
        console.debug('[AgentAutoAuth] Agent not detected on localhost:7432');
      }
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
      if (DEBUG_AGENT_AUTO_AUTH) {
        console.debug('[AgentAutoAuth] Agent authenticated successfully');
        console.debug(`[AgentAutoAuth] Agent ID: ${response.data.agent_id}`);
      }
      return true;
    } else {
      if (DEBUG_AGENT_AUTO_AUTH) {
        console.warn('[AgentAutoAuth] Agent auth failed:', response.data);
      }
      return false;
    }
  } catch (error) {
    if (DEBUG_AGENT_AUTO_AUTH) {
      console.warn('[AgentAutoAuth] Failed to push auth to agent:', error.message);
    }
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

  if (DEBUG_AGENT_AUTO_AUTH) {
    console.debug('[AgentAutoAuth] Attempting to auto-authenticate agent...');
  }
  return await pushAuthToAgent(token, userId);
}
