<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Add New Client - Modal</title>
  <style>
    :root {
      --primary: #6366f1;
      --primary-dark: #4f46e5;
      --gray: #6b7280;
      --light: #f3f4f6;
      --border: #d1d5db;
    }

    * { box-sizing: border-box; margin:0; padding:0; }
    body {
      font-family: -apple-system, BlinkMacOSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f1f5f9;
      padding: 40px;
    }

    /* Modal Overlay */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: white;
      border-radius: 12px;
      width: 100%;
      max-width: 780px;
      max-height: 92vh;
      overflow-y: auto;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
    }

    .modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-title {
      font-size: 1.35rem;
      font-weight: 600;
      color: #111827;
    }

    .close-btn {
      font-size: 1.6rem;
      color: var(--gray);
      cursor: pointer;
      line-height: 1;
    }

    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
    }

    .tab {
      padding: 14px 24px;
      font-weight: 500;
      color: var(--gray);
      cursor: pointer;
      border-bottom: 3px solid transparent;
      transition: all 0.15s;
    }

    .tab.active {
      color: var(--primary-dark);
      border-bottom-color: var(--primary);
      background: rgba(99,102,241,0.04);
    }

    .tab-content {
      padding: 24px;
    }

    .hidden { display: none; }

    /* Form styling */
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px 24px;
    }

    .form-group.full {
      grid-column: 1 / -1;
    }

    label {
      display: block;
      margin-bottom: 6px;
      font-size: 0.9rem;
      font-weight: 500;
      color: #374151;
    }

    .required::after {
      content: " *";
      color: #ef4444;
    }

    input, select, textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.95rem;
    }

    input:focus, select:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
    }

    .services-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 8px;
    }

    .service-chip {
      padding: 8px 14px;
      background: var(--light);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.9rem;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s;
    }

    .service-chip.selected {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }

    .csv-area {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 60px 20px;
      text-align: center;
      margin: 20px 0;
      background: #f9fafb;
    }

    .csv-area:hover {
      border-color: var(--primary);
    }

    .btn {
      padding: 10px 20px;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      font-size: 0.95rem;
    }

    .btn-primary {
      background: var(--primary);
      color: white;
    }

    .btn-primary:hover {
      background: var(--primary-dark);
    }

    .btn-secondary {
      background: #e5e7eb;
      color: #374151;
    }

    .btn-secondary:hover {
      background: #d1d5db;
    }

    .btn-outline {
      background: white;
      border: 1px solid #4b5563;
      color: #4b5563;
    }

    .btn-outline:hover {
      background: #f3f4f6;
    }

    .modal-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    .add-contact-btn, .add-dsc-btn {
      color: var(--primary);
      background: none;
      border: 1px solid var(--primary);
      margin-top: 12px;
    }
  </style>
</head>
<body>

<!-- Trigger button (for demo) -->
<button class="btn btn-primary" onclick="openModal()">Open Add Client Modal</button>

<!-- Modal -->
<div id="clientModal" class="modal-overlay" style="display:none;">
  <div class="modal">
    <div class="modal-header">
      <h2 class="modal-title">Add New Client</h2>
      <span class="close-btn" onclick="closeModal()">×</span>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="single">Add Client</div>
      <div class="tab" data-tab="csv">Add via CSV</div>
    </div>

    <!-- Single Client Form -->
    <div id="single-tab" class="tab-content">

      <h3 style="margin:0 0 16px; font-size:1.15rem;">Basic Information</h3>
      <div class="form-grid">
        <div class="form-group">
          <label class="required">Company Name</label>
          <input type="text" placeholder="ABC Enterprises" value="ABC Enterprises" />
        </div>
        <div class="form-group">
          <label class="required">Client Type</label>
          <select>
            <option>Proprietor</option>
            <option>Partnership</option>
            <option>Pvt Ltd</option>
            <option>LLP</option>
            <option>Others</option>
          </select>
        </div>
        <div class="form-group">
          <label class="required">Company Email</label>
          <input type="email" placeholder="company@example.com" />
        </div>
        <div class="form-group">
          <label class="required">Company Phone</label>
          <input type="tel" placeholder="+1234567890" />
        </div>
        <div class="form-group full">
          <label>Company Birthday / Anniversary</label>
          <input type="date" />
        </div>
      </div>

      <hr style="margin:28px 0; border-color:#e5e7eb;" />

      <h3 style="margin:0 0 16px; font-size:1.15rem;">Contact Persons</h3>
      <div style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" placeholder="Full Name" />
          </div>
          <div class="form-group">
            <label>Designation</label>
            <input type="text" placeholder="Designation" />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" placeholder="Email" />
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input type="tel" placeholder="Phone" />
          </div>
        </div>
        <button class="btn add-contact-btn">+ Add Another Contact</button>
      </div>

      <hr style="margin:28px 0; border-color:#e5e7eb;" />

      <h3 style="margin:0 0 16px; font-size:1.15rem;">DSC Details</h3>
      <button class="btn add-dsc-btn">+ Add DSC</button>

      <hr style="margin:28px 0; border-color:#e5e7eb;" />

      <h3 style="margin:0 0 12px; font-size:1.15rem;">Services *</h3>
      <div class="services-grid">
        <div class="service-chip selected">GST</div>
        <div class="service-chip">Trademark</div>
        <div class="service-chip">Income Tax</div>
        <div class="service-chip">ROC</div>
        <div class="service-chip">Audit</div>
        <div class="service-chip">Compliance</div>
        <div class="service-chip">Company Registration</div>
        <div class="service-chip">Tax Planning</div>
        <div class="service-chip">Accounting</div>
        <div class="service-chip">Payroll</div>
        <div class="service-chip">Other</div>
      </div>

      <div style="margin:24px 0;">
        <label>Assign To</label>
        <select>
          <option>Unassigned</option>
          <option>John Doe</option>
          <option>Jane Smith</option>
        </select>
      </div>

      <div class="form-group full">
        <label>Notes</label>
        <textarea rows="4" placeholder="Any additional notes..."></textarea>
      </div>

    </div>

    <!-- CSV Tab -->
    <div id="csv-tab" class="tab-content hidden">

      <h3 style="margin-bottom:16px;">Bulk Add Clients via CSV</h3>
      
      <div class="csv-area">
        <p style="font-size:1.1rem; margin-bottom:8px; color:#4b5563;">
          Drag & drop your CSV file here
        </p>
        <p style="color:var(--gray); margin:8px 0 16px;">
          or
        </p>
        <button class="btn btn-primary">Choose CSV File</button>
      </div>

      <p style="color:var(--gray); font-size:0.9rem; margin:16px 0;">
        Download <a href="#" style="color:var(--primary);">sample CSV format</a> to see the required columns.
      </p>

    </div>

    <div class="modal-footer">
      <button class="btn btn-outline csv-only">CSV Format</button>
      <button class="btn btn-secondary csv-only">Add CSV</button>
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary single-only">Add Client</button>
    </div>
  </div>
</div>

<script>
  const modal = document.getElementById('clientModal');
  const tabs = document.querySelectorAll('.tab');
  const contents = {
    single: document.getElementById('single-tab'),
    csv: document.getElementById('csv-tab')
  };
  const singleOnly = document.querySelectorAll('.single-only');
  const csvOnly = document.querySelectorAll('.csv-only');

  function openModal() {
    modal.style.display = 'flex';
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  function updateFooter(tab) {
    if (tab === 'single') {
      singleOnly.forEach(el => el.style.display = 'inline-block');
      csvOnly.forEach(el => el.style.display = 'none');
    } else {
      singleOnly.forEach(el => el.style.display = 'none');
      csvOnly.forEach(el => el.style.display = 'inline-block');
    }
  }

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      Object.values(contents).forEach(c => c.classList.add('hidden'));
      contents[tab.dataset.tab].classList.remove('hidden');

      updateFooter(tab.dataset.tab);
    });
  });

  // Initial footer state
  updateFooter('single');

  // Service chip toggle (demo)
  document.querySelectorAll('.service-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
    });
  });

  // Close when clicking overlay
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });

  // Demo logs (console only, as per "same logs")
  console.log('Modal initialized');
</script>
</body>
</html>
