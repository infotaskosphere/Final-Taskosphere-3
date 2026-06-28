'use strict';

/**
 * productivityEngine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes productivity metrics from activity data.
 *
 * Generates:
 *   - Focus Time
 *   - Idle Time
 *   - Application Usage breakdown
 *   - Top Applications
 *   - Working Time
 *   - Daily / Weekly / Monthly Productivity Score
 *   - Export reports
 *
 * Classification:
 *   - Productive apps: IDEs, Office, accounting software, browsers with work domains
 *   - Unproductive apps: Social media, games, entertainment
 *   - Neutral: System processes, utilities
 */

// ── App Classification ───────────────────────────────────────────────────────

const PRODUCTIVE_APPS = new Set([
  'chrome', 'firefox', 'msedge', 'edge',
  'code', 'visual studio code', 'vscode',
  'intellij', 'pycharm', 'webstorm', 'phpstorm',
  'excel', 'word', 'powerpoint', 'outlook', 'teams',
  'notepad', 'notepad++', 'notepadpp',
  'slack', 'discord',  // can be work tools
  'tally', 'quickbooks', 'sap',  // accounting
  'photoshop', 'illustrator', 'figma',  // design
  'android studio', 'eclipse', 'netbeans',
  'cmd', 'powershell', 'terminal', 'windows terminal',
  'file explorer', 'explorer',
]);

const UNPRODUCTIVE_APPS = new Set([
  'spotify', 'youtube', 'netflix',
  'steam', 'epic games', 'origin',
  'whatsapp', 'telegram',  // when not working
  'reddit', 'twitter', 'facebook',
  'chrome_youtube', 'chrome_netflix',
]);

const PRODUCTIVE_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'office.com', 'office365.com',
  'github.com', 'gitlab.com', 'bitbucket.org',
  'stackoverflow.com', 'docs.google.com', 'drive.google.com',
  'notion.so', 'confluence.atlassian.com', 'jira.atlassian.com',
  'trello.com', 'asana.com', 'slack.com',
  'figma.com', 'canva.com',
  'in.indeed.com', 'linkedin.com',
  'ca.in', 'incometaxindia.gov.in', 'gst.gov.in', 'mca.gov.in',
  'nsdl.com', 'trACES',
]);

const UNPRODUCTIVE_DOMAINS = new Set([
  'youtube.com', 'netflix.com', 'hotstar.com',
  'instagram.com', 'facebook.com', 'twitter.com',
  'reddit.com', '9gag.com', 'buzzfeed.com',
]);

function classifyApp(appName) {
  if (!appName) return 'neutral';
  const lower = appName.toLowerCase();
  if (PRODUCTIVE_APPS.has(lower)) return 'productive';
  if (UNPRODUCTIVE_APPS.has(lower)) return 'unproductive';
  return 'neutral';
}

function classifyDomain(domain) {
  if (!domain) return 'neutral';
  const lower = domain.toLowerCase();
  if (PRODUCTIVE_DOMAINS.has(lower)) return 'productive';
  if (UNPRODUCTIVE_DOMAINS.has(lower)) return 'unproductive';
  return 'neutral';
}

// ── Compute metrics from activity data ───────────────────────────────────────

/**
 * Compute productivity metrics from activity tracker data.
 * @param {Object} activityReport - from activityTracker.getReport()
 * @param {Object} browserReport  - from browserTracker.getReport()
 * @returns {Object} productivity metrics
 */
function computeMetrics(activityReport, browserReport) {
  const activeSeconds = activityReport.activeSeconds || 0;
  const topApps       = activityReport.topApps || [];
  const topDomains    = (browserReport && browserReport.topDomains) || [];

  // Classify each app
  let productiveSeconds   = 0;
  let unproductiveSeconds = 0;
  let neutralSeconds      = 0;

  const appBreakdown = topApps.map(app => {
    const cls       = classifyApp(app.name);
    const seconds   = app.seconds || 0;

    if (cls === 'productive')   productiveSeconds   += seconds;
    else if (cls === 'unproductive') unproductiveSeconds += seconds;
    else neutralSeconds += seconds;

    return {
      name:      app.name,
      seconds:   seconds,
      human:     app.human || formatSeconds(seconds),
      category:  cls,
    };
  });

  // Add browser domain breakdown
  const domainBreakdown = topDomains.map(d => ({
    domain:   d.domain,
    seconds:  d.seconds,
    count:    d.count,
    category: classifyDomain(d.domain),
  }));

  // Add domain time to productive/unproductive
  for (const d of domainBreakdown) {
    if (d.category === 'productive')   productiveSeconds   += d.seconds;
    else if (d.category === 'unproductive') unproductiveSeconds += d.seconds;
  }

  const totalTrackedSeconds = productiveSeconds + unproductiveSeconds + neutralSeconds;

  // Productivity score: 0–100
  // Formula: (productive / total) * 100, adjusted for active vs idle ratio
  const totalDaySeconds = 8 * 3600; // assume 8-hour workday
  const focusRatio      = totalTrackedSeconds > 0 ? productiveSeconds / totalTrackedSeconds : 0;
  const activeRatio     = totalDaySeconds > 0 ? Math.min(activeSeconds / totalDaySeconds, 1) : 0;

  // Score weighted: 60% productive ratio, 40% active ratio
  const score = Math.round((focusRatio * 0.6 + activeRatio * 0.4) * 100);

  // Top apps sorted by time
  const topApplications = appBreakdown
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10);

  return {
    date:              new Date().toISOString().slice(0, 10),
    focusTime:         productiveSeconds,
    idleTime:          Math.max(0, totalDaySeconds - activeSeconds),
    productiveTime:    productiveSeconds,
    unproductiveTime:  unproductiveSeconds,
    neutralTime:       neutralSeconds,
    totalActiveTime:   activeSeconds,
    score:             Math.max(0, Math.min(100, score)),
    appBreakdown:      topApplications,
    domainBreakdown:   domainBreakdown.sort((a, b) => b.seconds - a.seconds).slice(0, 10),
  };
}

// ── Weekly aggregation ───────────────────────────────────────────────────────

function computeWeekly(dailyReports) {
  if (!dailyReports || dailyReports.length === 0) {
    return { period: 'week', focusTime: 0, score: 0, days: 0 };
  }

  const totalFocus   = dailyReports.reduce((s, r) => s + (r.focusTime || r.productiveTime || 0), 0);
  const totalIdle    = dailyReports.reduce((s, r) => s + (r.idleTime || 0), 0);
  const totalActive  = dailyReports.reduce((s, r) => s + (r.totalActiveTime || r.activeSeconds || 0), 0);
  const avgScore     = dailyReports.reduce((s, r) => s + (r.score || 0), 0) / dailyReports.length;

  return {
    period:         'week',
    days:           dailyReports.length,
    focusTime:      totalFocus,
    idleTime:       totalIdle,
    activeTime:     totalActive,
    avgScore:       Math.round(avgScore),
    topApps:        aggregateTopApps(dailyReports),
  };
}

// ── Monthly aggregation ──────────────────────────────────────────────────────

function computeMonthly(dailyReports) {
  if (!dailyReports || dailyReports.length === 0) {
    return { period: 'month', focusTime: 0, score: 0, days: 0 };
  }

  const totalFocus   = dailyReports.reduce((s, r) => s + (r.focusTime || r.productiveTime || 0), 0);
  const totalIdle    = dailyReports.reduce((s, r) => s + (r.idleTime || 0), 0);
  const totalActive  = dailyReports.reduce((s, r) => s + (r.totalActiveTime || r.activeSeconds || 0), 0);
  const avgScore     = dailyReports.reduce((s, r) => s + (r.score || 0), 0) / dailyReports.length;

  return {
    period:         'month',
    days:           dailyReports.length,
    focusTime:      totalFocus,
    idleTime:       totalIdle,
    activeTime:     totalActive,
    avgScore:       Math.round(avgScore),
    topApps:        aggregateTopApps(dailyReports),
  };
}

function aggregateTopApps(dailyReports) {
  const appMap = {};
  for (const r of dailyReports) {
    for (const app of (r.appBreakdown || [])) {
      const key = app.name.toLowerCase();
      if (!appMap[key]) appMap[key] = { name: app.name, seconds: 0 };
      appMap[key].seconds += app.seconds || 0;
    }
  }
  return Object.values(appMap)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 10)
    .map(a => ({ ...a, human: formatSeconds(a.seconds) }));
}

// ── Export report ────────────────────────────────────────────────────────────

function exportReport(metrics, format = 'json') {
  if (format === 'json') return JSON.stringify(metrics, null, 2);
  if (format === 'csv') {
    const rows = [['Metric', 'Value']];
    rows.push(['Date', metrics.date]);
    rows.push(['Focus Time', formatSeconds(metrics.focusTime)]);
    rows.push(['Idle Time', formatSeconds(metrics.idleTime)]);
    rows.push(['Productive Time', formatSeconds(metrics.productiveTime)]);
    rows.push(['Unproductive Time', formatSeconds(metrics.unproductiveTime)]);
    rows.push(['Score', metrics.score]);
    for (const app of (metrics.appBreakdown || [])) {
      rows.push([`App: ${app.name}`, `${app.human} (${app.category})`]);
    }
    return rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  }
  return JSON.stringify(metrics);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSeconds(s) {
  if (!s || s < 0) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

module.exports = {
  computeMetrics,
  computeWeekly,
  computeMonthly,
  exportReport,
  classifyApp,
  classifyDomain,
};
