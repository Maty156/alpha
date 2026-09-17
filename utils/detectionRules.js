const db = require('../db');

const PRIVILEGED_GROUPS = [
  'domain admins', 'enterprise admins', 'schema admins',
  'administrators', 'account operators', 'backup operators',
];

const RULES = {
  password_spraying: {
    title: 'Suspicious Password Spraying Activity',
    severity: 'High',
    mitre: 'T1110.003 — Brute Force: Password Spraying',
  },
  privilege_escalation: {
    title: 'User Added to Privileged Group',
    severity: 'Critical',
    mitre: 'T1078.002 — Valid Accounts: Domain Accounts',
  },
  kerberoasting: {
    title: 'Suspicious Kerberos Service Ticket Request (Kerberoasting)',
    severity: 'High',
    mitre: 'T1558.003 — Steal or Forge Kerberos Tickets: Kerberoasting',
  },
  suspicious_remote_logon: {
    title: 'Suspicious Remote Logon',
    severity: 'Medium',
    mitre: 'T1021 — Remote Services',
  },
  service_abuse: {
    title: 'Suspicious Service Creation/Modification',
    severity: 'Medium',
    mitre: 'T1543.003 — Create or Modify System Process: Windows Service',
  },
};

// Avoid flooding the demo/investigation queue with duplicate alerts for the
// same ongoing behavior — if an unresolved alert for this exact rule already
// exists from the last 15 minutes, don't create a second one.
async function hasRecentOpenAlert(ruleKey) {
  const row = await db
    .prepare(`
      SELECT id FROM alerts
      WHERE rule_key = ? AND status IN ('New', 'Investigating')
        AND created_at > datetime('now', '-15 minutes')
      LIMIT 1
    `)
    .get(ruleKey);
  return !!row;
}

async function createAlert(ruleKey, eventRowId, description, severityOverride) {
  if (await hasRecentOpenAlert(ruleKey)) return null;
  const rule = RULES[ruleKey];
  const info = await db
    .prepare(`
      INSERT INTO alerts (event_id, rule_key, title, severity, mitre_technique, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(eventRowId, ruleKey, rule.title, severityOverride || rule.severity, rule.mitre, description);
  return info.lastInsertRowid;
}

/**
 * Stores the raw event, then runs it through the 5 detection rules.
 * Returns { eventRowId, alertId } — alertId is null if nothing fired.
 */
async function ingestEvent({ source, eventId, timestamp, accountName, sourceIp, targetGroup, encryptionType, logonType, serviceName, serviceBinaryPath, hostname }) {
  const rawData = {
    timestamp: timestamp || new Date().toISOString(),
    accountName: accountName || null,
    sourceIp: sourceIp || null,
    targetGroup: targetGroup || null,
    encryptionType: encryptionType || null,
    logonType: logonType != null ? String(logonType) : null,
    serviceName: serviceName || null,
    serviceBinaryPath: serviceBinaryPath || null,
    hostname: hostname || null,
  };

  const info = await db
    .prepare('INSERT INTO security_events (source, event_id, raw_data) VALUES (?, ?, ?)')
    .run(source, String(eventId), JSON.stringify(rawData));
  const eventRowId = info.lastInsertRowid;

  let alertId = null;

  switch (String(eventId)) {
    case '4625': {
      // Password spraying: many distinct accounts failing from the same
      // source within a short window.
      const window = await db
        .prepare(`
          SELECT raw_data FROM security_events
          WHERE event_id = '4625' AND received_at > datetime('now', '-10 minutes')
        `)
        .all();
      const sameSource = window
        .map(r => JSON.parse(r.raw_data))
        .filter(e => e.sourceIp && e.sourceIp === rawData.sourceIp);
      const distinctAccounts = new Set(sameSource.map(e => e.accountName)).size;
      if (distinctAccounts >= 5) {
        alertId = await createAlert(
          'password_spraying', eventRowId,
          `${distinctAccounts} distinct accounts failed to authenticate from ${rawData.sourceIp} within 10 minutes.`
        );
      }
      break;
    }

    case '4728':
    case '4732': {
      const group = (rawData.targetGroup || '').toLowerCase();
      if (PRIVILEGED_GROUPS.some(g => group.includes(g))) {
        alertId = await createAlert(
          'privilege_escalation', eventRowId,
          `Account "${rawData.accountName}" was added to privileged group "${rawData.targetGroup}".`
        );
      }
      break;
    }

    case '4769': {
      if (rawData.encryptionType === '0x17') {
        alertId = await createAlert(
          'kerberoasting', eventRowId,
          `Service ticket requested for "${rawData.serviceName || 'unknown service'}" using weak RC4 encryption (0x17) — account "${rawData.accountName}".`
        );
      }
      break;
    }

    case '4624': {
      const isRdp = rawData.logonType === '10';
      const isNetworkAdmin = rawData.logonType === '3' && /admin/i.test(rawData.accountName || '');
      if (isRdp || isNetworkAdmin) {
        alertId = await createAlert(
          'suspicious_remote_logon', eventRowId,
          `${isRdp ? 'Remote desktop' : 'Network'} logon by "${rawData.accountName}" from ${rawData.sourceIp || 'unknown source'}.`
        );
      }
      break;
    }

    case '4697':
    case '7045': {
      const path = (rawData.serviceBinaryPath || '').toLowerCase();
      const suspicious = /powershell|cmd\.exe|-enc|\\temp\\|\\users\\public\\/i.test(path);
      alertId = await createAlert(
        'service_abuse', eventRowId,
        `New service "${rawData.serviceName || 'unknown'}" created${rawData.serviceBinaryPath ? ` (binary: ${rawData.serviceBinaryPath})` : ''}.`,
        suspicious ? 'High' : 'Medium'
      );
      break;
    }
  }

  return { eventRowId, alertId };
}

module.exports = { ingestEvent, RULES };
