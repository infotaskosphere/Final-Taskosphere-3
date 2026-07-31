// Leave.jsx — thin wrapper around GovernedListPage. See
// frontend/src/components/governance/GovernedListPage.jsx for the shared
// implementation and backend/governed_modules.py for the matching API.
import React from "react";
import GovernedListPage from "@/components/governance/GovernedListPage";

export default function Leave() {
  return (
    <GovernedListPage
      title="Leave"
      description="Leave requests and approvals."
      apiPath="/leave"
      module="people_matrix"
      pageFlag="can_view_leave"
    />
  );
}
