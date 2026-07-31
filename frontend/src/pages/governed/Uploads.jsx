// Uploads.jsx — thin wrapper around GovernedListPage. See
// frontend/src/components/governance/GovernedListPage.jsx for the shared
// implementation and backend/governed_modules.py for the matching API.
import React from "react";
import GovernedListPage from "@/components/governance/GovernedListPage";

export default function Uploads() {
  return (
    <GovernedListPage
      title="Uploads"
      description="Uploaded files register."
      apiPath="/uploads"
      module="records"
      pageFlag="can_view_uploads"
    />
  );
}
