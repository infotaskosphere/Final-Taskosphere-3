// Performance.jsx — thin wrapper around GovernedListPage. See
// frontend/src/components/governance/GovernedListPage.jsx for the shared
// implementation and backend/governed_modules.py for the matching API.
import React from "react";
import GovernedListPage from "@/components/governance/GovernedListPage";

export default function Performance() {
  return (
    <GovernedListPage
      title="Performance"
      description="Performance reviews and goals."
      apiPath="/performance"
      module="people_matrix"
      pageFlag="can_view_performance"
    />
  );
}
