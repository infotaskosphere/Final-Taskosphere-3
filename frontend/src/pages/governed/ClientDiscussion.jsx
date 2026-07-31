// ClientDiscussion.jsx — thin wrapper around GovernedListPage. See
// frontend/src/components/governance/GovernedListPage.jsx for the shared
// implementation and backend/governed_modules.py for the matching API.
import React from "react";
import GovernedListPage from "@/components/governance/GovernedListPage";

export default function ClientDiscussion() {
  return (
    <GovernedListPage
      title="Client Discussion"
      description="Discussion threads with clients."
      apiPath="/client-discussion"
      module="proposals"
      pageFlag="can_view_client_discussion"
    />
  );
}
