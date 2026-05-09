'use strict';

module.exports = {
  BACKEND_URL: process.env.TASKOSPHERE_BACKEND_URL || 'https://final-taskosphere-backend.onrender.com',
  AGENT_PORT: 7432,
  ACTIVITY_COLLECT_INTERVAL: 5000,
  ACTIVITY_PUSH_INTERVAL: 60000,
};
