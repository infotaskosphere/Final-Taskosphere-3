# OneNexa Commercial Licensee Onboarding & Approval

## What this adds

- Public app-native onboarding form at \`/commercial-licensee-onboarding\`.
- Google Forms bridge at \`integrations/google-form/Code.gs\`.
- Platform-owner approval page at \`/commercial-onboarding-approval\` (Admin navigation and Admin dashboard card).
- Pending / Under review / Approved / Rejected queue backed by MongoDB collection \`commercial_onboarding\`.
- Explicit admin decision before tenant, organization, license, and feature flag records are created.
- Approved tenant and license stay in \`pending_activation\`; this change does not create a user or make a tenant active.

## Google Form submissions → app queue

The Google Form bridge uses an installable Apps Script \`onFormSubmit\` trigger to forward native Google Form responses to the backend.

### Backend configuration

Set this Render/backend environment variable to a long random value:

\`COMMERCIAL_ONBOARDING_WEBHOOK_SECRET\`

Set the same value in the Apps Script project's Script Properties as \`ONENEXA_WEBHOOK_SECRET\`.

Also set Script Property \`ONENEXA_API_BASE\` to your backend API root, ending in \`/api/v2\`, for example:

\`https://YOUR-BACKEND-HOST/api/v2\`

Do not publish or share the webhook secret.

### Apps Script setup

1. Open your existing Google Form.
2. Go to **Extensions → Apps Script**.
3. Create \`Code.gs\` and copy \`integrations/google-form/Code.gs\` from this repository.
4. Open **Project Settings → Script Properties** and add the two properties above.
5. Save, select \`installOnboardingSubmitTrigger\`, and click Run; approve the requested Google permissions.
6. Test with a non-production submission.
7. Open the app as a platform-owner admin and navigate to **Admin → Onboarding Approval**.

Question titles are mapped case-insensitively. If your Google Form question labels differ from the bridge's mappings, update the key arrays in \`forwardOnboardingFormSubmit\` before production use.

## App-native form

The application-hosted Google-Forms-style form submits directly to:

\`POST /api/v2/commercial-onboarding/submissions\`

It creates a pending application only. It does not create or activate a tenant/license.

## Platform owner review flow

- **Mark under review** preserves the application without provisioning.
- **Reject** records the reviewer and notes; no tenant/license is created.
- **Approve & provision** records the reviewed license type, module allowlist, user cap, expiration and tenant isolation preference, then creates a tenant, organization, license and feature flag document.
- Tenant/organization/license status is initially \`pending_activation\`; a separate activation step is required.
- The license key is returned to the approver once in the approval UI; store it securely.

## Validation and limitations to review before production

- The application validates required fields, basic PAN/GSTIN formats, declared consent, user counts, and supported module keys.
- Duplicate active applications are checked by email/PAN/GSTIN. Mongo indexes/atomic uniqueness should be added before high-volume use.
- This package does not create the first licensee-admin login account or send an activation email. Configure that onboarding/identity step before selling licenses.
- The existing platform tenant manager uses a shared database with tenant records; the selected \`schema_type\` is metadata. This addition does **not** implement separate physical databases or prove end-to-end data isolation for every existing application collection. Verify tenant-scoped data access before relying on dedicated database isolation.
- Do not enable production traffic until backend/frontend builds and a full test pass with the real Mongo connection have succeeded.
