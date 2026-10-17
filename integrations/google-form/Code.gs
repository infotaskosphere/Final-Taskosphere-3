/**
 * OneNexa Google Form -> Commercial Onboarding API bridge.
 *
 * Install this file in the Apps Script project that owns the actual Google Form.
 * Set Script Properties:
 *   ONENEXA_API_BASE = https://<your-backend-host>/api/v2
 *   ONENEXA_WEBHOOK_SECRET = <same secret configured as COMMERCIAL_ONBOARDING_WEBHOOK_SECRET>
 *
 * Run installOnboardingSubmitTrigger() once. The installable trigger forwards each
 * submitted response into the same pending queue used by the app-native form.
 */

function installOnboardingSubmitTrigger() {
  var form = FormApp.getActiveForm();
  if (!form) throw new Error('Open this script from the Google Form: Extensions > Apps Script.');

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'forwardOnboardingFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('forwardOnboardingFormSubmit')
    .forForm(form)
    .onFormSubmit()
    .create();

  Logger.log('OneNexa onboarding submission trigger installed.');
}

function forwardOnboardingFormSubmit(event) {
  if (!event || !event.response) throw new Error('This handler must run from a Google Form submission trigger.');

  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty('ONENEXA_API_BASE') || '').replace(/\/+$/, '');
  var secret = props.getProperty('ONENEXA_WEBHOOK_SECRET') || '';
  if (!base) throw new Error('Set ONENEXA_API_BASE in Apps Script Project Settings > Script Properties.');
  if (!secret) throw new Error('Set ONENEXA_WEBHOOK_SECRET in Apps Script Project Settings > Script Properties.');

  var answers = {};
  event.response.getItemResponses().forEach(function(itemResponse) {
    answers[String(itemResponse.getItem().getTitle()).trim().toLowerCase()] = itemResponse.getResponse();
  });

  function pick(keys, fallback) {
    for (var i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(answers, keys[i]) && answers[keys[i]] !== '') {
        return answers[keys[i]];
      }
    }
    return fallback === undefined ? '' : fallback;
  }

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    return String(value).split(/[,;\n]/).map(function(v) { return v.trim(); }).filter(Boolean);
  }

  function normalizeModule(value) {
    var map = {
      'taskosphere': 'task_management',
      'task management': 'task_management',
      'task management / taskosphere': 'task_management',
      'accounting / finix': 'finix',
      'finix / accounting': 'finix',
      'gst / tax': 'gst',
      'compliance': 'roc',
      'roc / compliance': 'roc',
      'trademark / ip': 'trademark',
      'crm / leads': 'crm',
      'document management': 'document_management',
      'other': 'task_management'
    };
    var key = String(value || '').trim().toLowerCase();
    return map[key] || key.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  var rawModules = asList(pick(['modules requested', 'modules requested '], []));
  if (rawModules.indexOf('Other') >= 0 && rawModules.length > 1) {
    rawModules = rawModules.filter(function(value) { return value !== 'Other'; });
  }
  var modules = rawModules
    .map(normalizeModule)
    .filter(function(value) { return !!value; });
  var integrations = asList(pick(['required integrations'], []));

  var rawCount = pick(['expected number of users', 'user count'], '10');
  var userCount = parseInt(rawCount, 10);
  if (!Number.isFinite(userCount) || userCount < 1) userCount = 10;

  var declaration = pick(['declaration'], []);
  var declared = Array.isArray(declaration)
    ? declaration.some(function(value) { return /confirm|accurate/i.test(String(value)); })
    : /confirm|accurate|yes/i.test(String(declaration));

  var payload = {
    source: 'google_form',
    legal_name: pick(['legal / registered name', 'legal / registered name ']),
    trade_name: pick(['trade / brand name']),
    constitution: pick(['constitution / entity type', 'constitution / entity type ']),
    pan: String(pick(['pan', 'pan '])).trim().toUpperCase(),
    gstin: String(pick(['gstin', 'gstin '])).trim().toUpperCase() || null,
    registration_no: pick(['cin / llpin / registration no.', 'cin / llpin / registration no.']),
    address: pick(['registered office address', 'registered office address ']),
    city: pick(['city']),
    state: pick(['state']),
    pin: String(pick(['pin code', 'pin code '])).trim(),
    website: pick(['website']) || null,
    contact_name: pick(['contact person name', 'contact person name ']),
    designation: pick(['designation']),
    email: String(pick(['official email', 'official email '])).trim().toLowerCase(),
    mobile: String(pick(['mobile number', 'mobile number '])).trim(),
    alternate_contact: pick(['alternate contact / email']) || null,
    business_type: pick(['primary business type']),
    business_description: pick(['brief description of your business and intended use of onenexa', 'business description and intended use of onenexa']),
    client_count: pick(['approximate number of clients / entities to be managed', 'approximate number of clients / entities']) || null,
    modules: modules,
    license_type: pick(['license model', 'license model '], 'standard'),
    user_count: userCount,
    entity_count: pick(['expected number of companies / entities', 'expected companies / entities']) || null,
    commercial_notes: pick(['additional modules / commercial requirements']) || null,
    deployment: pick(['preferred deployment']) || 'Cloud Hosted',
    migration: pick(['data migration required?', 'data migration required? ']) || 'To be discussed',
    migration_details: pick(['if migration is required, describe current software/database and approximate data volume', 'current software/database and data volume (if migrating)']) || null,
    isolation: pick(['need separate / isolated licensee data environment?', 'separate / isolated licensee data environment']) || 'Yes – Dedicated / Isolated',
    branding: pick(['custom branding required?']) || 'No',
    white_label_name: pick(['preferred product / white-label name', 'preferred white-label name']) || null,
    custom_domain: pick(['custom domain']) || null,
    integrations: integrations,
    go_live_date: pick(['target implementation / go-live date']) || null,
    implementation_notes: pick(['implementation, training, support or special requirements']) || null,
    notes: pick(['additional notes']) || null,
    declaration: declared
  };

  if (!payload.legal_name || !payload.pan || !payload.contact_name || !payload.email ||
      !payload.address || !payload.city || !payload.state || !payload.pin ||
      !payload.business_type || !payload.business_description || !payload.modules.length || !payload.declaration) {
    throw new Error('Google Form response is missing required fields or declaration. Review the form question titles and required settings.');
  }

  var response = UrlFetchApp.fetch(base + '/commercial-onboarding/google-form-submissions', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Onenexa-Onboarding-Secret': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('OneNexa API returned HTTP ' + status + ': ' + response.getContentText().slice(0, 1000));
  }
  Logger.log('OneNexa application accepted: ' + response.getContentText());
}
