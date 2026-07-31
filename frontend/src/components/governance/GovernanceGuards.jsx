// GovernanceGuards.jsx — PageGuard and ActionGuard, siblings of the existing
// ModuleGate.jsx. Use ModuleGate for whole-module routes (as before);
// use PageGuard for individual pages within an already-accessible module;
// use ActionGuard to conditionally render a button/control inline.

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useGovernance } from '@/hooks/useGovernance';

/** Wraps a route element; redirects to /dashboard unless the page is reachable
 * (module flag AND page flag both on, or admin). */
export function PageGuard({ module, page, children }) {
  const { hasPageAccess } = useGovernance();
  if (!hasPageAccess(module, page)) return <Navigate to="/dashboard" replace />;
  return children;
}

/** Conditionally renders children only if the user can perform `action`
 * (view/create/edit/delete/export/approve/print/share) on this page.
 * Renders `fallback` (default: nothing) otherwise — use to hide buttons,
 * e.g. <ActionGuard module="finix" page="can_view_sale" action="delete"><DeleteButton/></ActionGuard> */
export function ActionGuard({ module, page, action, fallback = null, children }) {
  const { hasActionAccess } = useGovernance();
  if (!hasActionAccess(module, page, action)) return fallback;
  return children;
}
