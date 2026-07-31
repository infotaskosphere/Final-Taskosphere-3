// MasterData.jsx — thin wrapper around GovernedListPage. See
// frontend/src/components/governance/GovernedListPage.jsx for the shared
// implementation and backend/governed_modules.py for the matching API.
import React from "react";
import GovernedListPage from "@/components/governance/GovernedListPage";

export default function MasterData() {
  return (
    <GovernedListPage
      title="Master Data"
      description="Organization-wide master data (departments, categories, etc)."
      apiPath="/master-data"
      module="admin"
      pageFlag="can_view_master_data"
    />
  );
}
