// HR.jsx — thin wrapper around GovernedListPage. See
// frontend/src/components/governance/GovernedListPage.jsx for the shared
// implementation and backend/governed_modules.py for the matching API.
import React from "react";
import GovernedListPage from "@/components/governance/GovernedListPage";

export default function HR() {
  return (
    <GovernedListPage
      title="HR"
      description="General HR records and actions."
      apiPath="/hr"
      module="people_matrix"
      pageFlag="can_view_hr"
    />
  );
}
