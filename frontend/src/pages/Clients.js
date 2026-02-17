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
      --red: #ef4444;
    }

    * { box-sizing: border-box; margin:0; padding:0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f1f5f9;
      padding: 40px;
      min-height: 100vh;
    }

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
      max-width: 820px;
      max-height: 94vh;
      overflow-y: auto;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
    }

    .modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      background: white;
      z-index: 10;
    }

    .modal-title {
      font-size: 1.4rem;
      font-weight: 600;
      color: #111827;
    }

    .close-btn {
      font-size: 1.8rem;
      color: var(--gray);
      cursor: pointer;
      line-height: 1;
      padding: 4px 8px;
    }

    .close-btn:hover { color: #374151; }

    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
    }

    .tab {
      padding: 14px 28px;
      font-weight: 500;
      color: var(--gray);
      cursor: pointer;
      border-bottom: 3px solid transparent;
      transition: all 0.15s ease;
    }

    .tab.active {
      color: var(--primary-dark);
      border-bottom-color: var(--primary);
      background: rgba(99,102,241,0.05);
    }

    .tab-content {
      padding: 24px;
    }

    .hidden { display: none !important; }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 22px 26px;
    }

    .form-group.full { grid-column: 1 / -1; }

    label {
      display: block;
      margin-bottom: 6px;
      font-size: 0.92rem;
      font-weight: 500;
      color: #374151;
    }

    .required::after { content: " *"; color: var(--red); }

    input, select, textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.97rem;
    }

    input:focus, select:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
    }

    .services-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      margin-top: 10px;
    }

    .service-chip {
      padding: 8px 16px;
      background: var(--light);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.92rem;
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
      border-radius: 10px;
      padding: 70px 20px;
      text-align: center;
      margin: 24px 0;
      background: #fafafa;
      transition: border-color 0.2s;
    }

    .csv-area:hover { border-color: var(--primary); }

    .btn {
      padding: 10px 20px;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      font-size: 0.96rem;
    }

    .btn-primary     { background: var(--primary); color: white; }
    .btn-primary:hover   { background: var(--primary-dark); }
    .btn-secondary   { background: #e5e7eb; color: #374151; }
    .btn-secondary:hover { background: #d1d5db; }
    .btn-outline     { background: white; border: 1px solid #4b5563; color: #4b5563; }
    .btn-outline:hover   { background: #f3f4f6; }

    .modal-footer {
      padding: 18px 24px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      position: sticky;
      bottom: 0;
      background: white;
      z-index: 10;
    }

    .add-more-btn {
      color: var(--primary);
      background: none;
      border: 1px solid var(--primary);
      margin-top: 12px;
      padding: 8px 16px;
    }

    hr { margin: 32px 0; border-color: #e5e7eb; }
  </style>
</head>
<body>

<button class="btn btn-primary" onclick="openModal()">Open Add Client Modal</button>

<div id="clientModal" class="modal-overlay" style="display:none;">
  <div class="modal">
    <div class="modal-header">
      <h2 class="modal-title">Add New Client</h2>
      <span class="close-btn" onclick="closeModal()" title="Close">×</span>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="single">Add Client</div>
      <div class="tab" data-tab="csv">Add via CSV</div>
    </div>

    <div id="single-tab" class="tab-content">
      <h3>Basic Information</h3>
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

      <hr />

      <h3>Contact Persons</h3>
      <div style="margin-bottom:20px;">
        <div class="form-grid">
          <div class="form-group"><label>Full Name</label><input type="text" placeholder="Full Name" /></div>
          <div class="form-group"><label>Designation</label><input type="text" placeholder="Designation" /></div>
          <div class="form-group"><label>Email</label><input type="email" placeholder="Email" /></div>
          <div class="form-group"><label>Phone</label><input type="tel" placeholder="Phone" /></div>
        </div>
        <button class="btn add-more-btn">+ Add Another Contact</button>
      </div>

      <hr />

      <h3>DSC Details</h3>
      <button class="btn add-more-btn">+ Add DSC</button>

      <hr />

      <h3>Services *</h3>
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

      <div style="margin:28px 0 20px;">
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

    <div id="csv-tab" class="tab-content hidden">
      <h3>Bulk Add Clients via CSV</h3>
      <div class="csv-area">
        <p style="font-size:1.15rem; margin-bottom:12px; color:#4b5563;">
          Drag & drop your CSV file here
        </p>
        <p style="color:var(--gray); margin:12px 0 20px;">or</p>
        <button class="btn btn-primary">Choose CSV File</button>
      </div>
      <p style="color:var(--gray); font-size:0.93rem;">
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
  const modal       = document.getElementById('clientModal');
  const tabs        = document.querySelectorAll('.tab');
  const singleTab   = document.getElementById('single-tab');
  const csvTab      = document.getElementById('csv-tab');
  const singleBtns  = document.querySelectorAll('.single-only');
  const csvBtns     = document.querySelectorAll('.csv-only');

  function openModal() {
    if (!modal) return console.error("Modal element not found");
    modal.style.display = 'flex';
    console.log("Modal opened");
  }

  function closeModal() {
    modal.style.display = 'none';
    console.log("Modal closed");
  }

  function updateFooter(tabName) {
    if (tabName === 'single') {
      singleBtns.forEach(b => b.style.display = '');
      csvBtns.forEach(b => b.style.display = 'none');
    } else {
      singleBtns.forEach(b => b.style.display = 'none');
      csvBtns.forEach(b => b.style.display = '');
    }
  }

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      singleTab.classList.toggle('hidden', tab.dataset.tab !== 'single');
      csvTab.classList.toggle('hidden', tab.dataset.tab !== 'csv');

      updateFooter(tab.dataset.tab);
      console.log(`Switched to tab: ${tab.dataset.tab}`);
    });
  });

  // Service chips toggle
  document.querySelectorAll('.service-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
    });
  });

  // Close on overlay click
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });

  // Initial state
  updateFooter('single');
  console.log("Add Client modal script initialized");
</script>
</body>
</html>
