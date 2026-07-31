import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';

/**
 * Wraps a route element and only renders it if the current user's role has
 * the corresponding module master flag switched on. Admin always passes
 * (handled inside useAuth().hasPermission). Everyone else is bounced back to
 * /dashboard — the Dashboard route is intentionally left out of the module
 * hierarchy (see backend/permission_governance.py) so this can never create
 * a redirect loop.
 *
 * `module` must be one of the keys below, matching backend/permission_governance.py's
 * MODULE_HIERARCHY (note: "peopleMatrix" here maps to the backend's "people_matrix").
 */
const MODULE_FLAGS = {
  taskosphere: 'can_access_taskosphere',
  finix: 'can_access_finix',
  compliance: 'can_access_compliance',
  records: 'can_access_records',
  proposals: 'can_access_proposals',
  peopleMatrix: 'can_access_people_matrix',
};

function ModuleGate({ module, children }) {
  const { hasPermission } = useAuth();

  const flag = MODULE_FLAGS[module];
  // Unknown module key — fail closed rather than silently granting access.
  const granted = flag ? hasPermission(flag) : false;

  if (!granted) return <Navigate to="/dashboard" replace />;

  return children;
}

export default ModuleGate;
