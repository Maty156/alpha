const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
const STATUSES = ['Open', 'In Progress', 'Remediated', 'Accepted Risk', 'Closed'];
const RETEST_STATUSES = ['Not Retested', 'Passed', 'Failed'];

// Server-side validation for findings — never trust the shape/values the
// client sends, even though only an admin can ever reach the routes that
// call this.
function sanitizeFinding(f) {
  return {
    title: String(f.title || '').slice(0, 200).trim() || 'Untitled finding',
    severity: SEVERITIES.includes(f.severity) ? f.severity : 'Informational',
    affectedAsset: String(f.affectedAsset || '').slice(0, 200).trim(),
    category: String(f.category || '').slice(0, 100).trim(),
    description: String(f.description || '').slice(0, 4000).trim(),
    evidence: String(f.evidence || '').slice(0, 4000).trim(),
    impact: String(f.impact || '').slice(0, 2000).trim(),
    recommendation: String(f.recommendation || '').slice(0, 2000).trim(),
    status: STATUSES.includes(f.status) ? f.status : 'Open',
    retestStatus: RETEST_STATUSES.includes(f.retestStatus) ? f.retestStatus : 'Not Retested',
    retestDate: f.retestDate ? String(f.retestDate).slice(0, 40) : null,
    retestNotes: String(f.retestNotes || '').slice(0, 2000).trim(),
    retestVerified: !!f.retestVerified,
    createdAt: f.createdAt || new Date().toISOString(),
  };
}

function computeSeverityCounts(findings) {
  return {
    critical: findings.filter(f => f.severity === 'Critical').length,
    high: findings.filter(f => f.severity === 'High').length,
    medium: findings.filter(f => f.severity === 'Medium').length,
    low: findings.filter(f => f.severity === 'Low').length,
    informational: findings.filter(f => f.severity === 'Informational').length,
  };
}

module.exports = { SEVERITIES, STATUSES, RETEST_STATUSES, sanitizeFinding, computeSeverityCounts };
