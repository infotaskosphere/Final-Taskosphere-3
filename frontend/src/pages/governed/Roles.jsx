// Roles.jsx — thin wrapper around GovernedListPage. See
// frontend/src/components/governance/GovernedListPage.jsx for the shared
// implementation and backend/governed_modules.py for the matching API.
import React from "react";
import GovernedListPage from "@/components/governance/GovernedListPage";

export default function Roles() {
  return (
    <GovernedListPage
      title="Roles"
      description="Custom role definitions."
      apiPath="/roles"
      module="admin"
      pageFlag="can_view_roles"
    />
  );
}
