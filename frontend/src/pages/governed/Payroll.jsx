// Payroll.jsx — thin wrapper around GovernedListPage. See
// frontend/src/components/governance/GovernedListPage.jsx for the shared
// implementation and backend/governed_modules.py for the matching API.
import React from "react";
import GovernedListPage from "@/components/governance/GovernedListPage";

export default function Payroll() {
  return (
    <GovernedListPage
      title="Payroll"
      description="Payroll records."
      apiPath="/payroll"
      module="people_matrix"
      pageFlag="can_view_payroll"
    />
  );
}
