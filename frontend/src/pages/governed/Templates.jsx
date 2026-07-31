// Templates.jsx — thin wrapper around GovernedListPage. See
// frontend/src/components/governance/GovernedListPage.jsx for the shared
// implementation and backend/governed_modules.py for the matching API.
import React from "react";
import GovernedListPage from "@/components/governance/GovernedListPage";

export default function Templates() {
  return (
    <GovernedListPage
      title="Templates"
      description="Document and letter templates."
      apiPath="/templates"
      module="records"
      pageFlag="can_view_templates"
    />
  );
}
