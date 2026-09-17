document.addEventListener('DOMContentLoaded', async () => {
  const API = '/api';

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  function formatTime(iso) {
    return new Date(iso + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ---------- require an admin session ----------
  let user;
  try {
    const result = await apiFetch(`${API}/auth/me`);
    user = result.user;
  } catch {
    window.location.href = '/';
    return;
  }
  if (user.role !== 'admin') {
    window.location.href = '/dashboard.html';
    return;
  }

  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('adminContent').style.display = 'block';

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await apiFetch(`${API}/auth/logout`, { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  });

  // ---------- tabs ----------
  const tabs = document.querySelectorAll('.dash-tab');
  const views = document.querySelectorAll('.dash-view');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.toggle('active', x === t));
    views.forEach(v => v.classList.toggle('active', v.id === `view-${t.dataset.view}`));
    if (t.dataset.view === 'messages') loadThreads();
    if (t.dataset.view === 'detections') loadAlerts();
    if (t.dataset.view === 'requests') loadRequests();
    if (t.dataset.view === 'auditlog') loadAuditLog();
  }));

  // ====================================================================
  // CLIENTS
  // ====================================================================
  let selectedClientId = null;

  async function loadClients() {
    const { clients } = await apiFetch(`${API}/admin/clients`);
    const listEl = document.getElementById('clientList');

    if (!clients.length) {
      listEl.innerHTML = `<div class="detail-empty">No client accounts registered yet.</div>`;
      return;
    }

    listEl.innerHTML = clients.map(c => `
      <button class="list-row${c.id === selectedClientId ? ' active' : ''}" data-id="${c.id}">
        <div class="row-title">${escapeHtml(c.companyName)}</div>
        <div class="row-sub">${escapeHtml(c.contactName || '—')} · ${escapeHtml(c.email)}</div>
        <span class="row-status ${c.assessmentCompleted ? 'done' : 'pending'}">
          ${c.assessmentCompleted ? 'ASSESSMENT COMPLETE' : 'NOT ASSESSED'}
        </span>
      </button>
    `).join('');

    listEl.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', () => selectClient(Number(row.dataset.id)));
    });
  }

  async function selectClient(id) {
    selectedClientId = id;
    document.querySelectorAll('#clientList .list-row').forEach(row => {
      row.classList.toggle('active', Number(row.dataset.id) === id);
    });

    const { client } = await apiFetch(`${API}/admin/clients/${id}`);
    const d = client.assessmentData || {};
    let findings = Array.isArray(d.findings) ? [...d.findings] : [];
    const detail = document.getElementById('clientDetail');

    const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
    const STATUSES = ['Open', 'In Progress', 'Remediated', 'Accepted Risk', 'Closed'];
    const RETEST_STATUSES = ['Not Retested', 'Passed', 'Failed'];

    function renderSeveritySummary() {
      const counts = { Critical: 0, High: 0, Medium: 0, Low: 0, Informational: 0 };
      findings.forEach(f => { if (counts[f.severity] != null) counts[f.severity]++; });
      return Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([sev, n]) => `<span class="severity-badge ${sev.toLowerCase()}">${n} ${sev}</span>`)
        .join('') || '<span class="form-note">No findings added yet — using manual counts below.</span>';
    }

    function findingCardHtml(f, i) {
      return `
        <div class="finding-card" data-index="${i}">
          <div class="finding-head">
            <strong>Finding #${i + 1}</strong>
            <button type="button" class="finding-remove" data-remove="${i}">Remove</button>
          </div>
          <div class="finding-grid">
            <div style="grid-column:1/-1;">
              <label>Title</label>
              <input type="text" data-field="title" data-index="${i}" value="${escapeHtml(f.title || '')}" placeholder="e.g. Kerberoastable service account">
            </div>
            <div>
              <label>Severity</label>
              <select data-field="severity" data-index="${i}">
                ${SEVERITIES.map(s => `<option value="${s}" ${f.severity === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
            <div>
              <label>Affected asset</label>
              <input type="text" data-field="affectedAsset" data-index="${i}" value="${escapeHtml(f.affectedAsset || '')}" placeholder="e.g. DC01">
            </div>
            <div>
              <label>Category</label>
              <input type="text" data-field="category" data-index="${i}" value="${escapeHtml(f.category || '')}" placeholder="e.g. Credential Access">
            </div>
            <div>
              <label>Status</label>
              <select data-field="status" data-index="${i}">
                ${STATUSES.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
            <div style="grid-column:1/-1;">
              <label>Description</label>
              <textarea data-field="description" data-index="${i}" placeholder="What was found">${escapeHtml(f.description || '')}</textarea>
            </div>
            <div style="grid-column:1/-1;">
              <label>Recommendation</label>
              <textarea data-field="recommendation" data-index="${i}" placeholder="How to fix it">${escapeHtml(f.recommendation || '')}</textarea>
            </div>
            <div>
              <label>Retest status</label>
              <select data-field="retestStatus" data-index="${i}">
                ${RETEST_STATUSES.map(s => `<option value="${s}" ${f.retestStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex; align-items:flex-end; gap:6px;">
              <label style="margin-bottom:9px;"><input type="checkbox" data-field="retestVerified" data-index="${i}" ${f.retestVerified ? 'checked' : ''}> Verified by admin</label>
            </div>
          </div>
        </div>
      `;
    }

    function renderFindingsEditor() {
      document.getElementById('findingsList').innerHTML = findings.map(findingCardHtml).join('') || '<p class="form-note" style="margin-bottom:16px;">No findings yet — add one below, or use the manual counts.</p>';
      document.getElementById('severitySummary').innerHTML = renderSeveritySummary();

      document.querySelectorAll('#findingsList [data-field]').forEach(el => {
        const evt = el.type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(evt, () => {
          const i = Number(el.dataset.index);
          const field = el.dataset.field;
          findings[i][field] = el.type === 'checkbox' ? el.checked : el.value;
          if (field === 'severity') {
            document.getElementById('severitySummary').innerHTML = renderSeveritySummary();
          }
        });
      });
      document.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          findings.splice(Number(btn.dataset.remove), 1);
          renderFindingsEditor();
        });
      });
    }

    detail.innerHTML = `
      <h3>${escapeHtml(client.companyName)}</h3>
      <div class="detail-sub">${escapeHtml(client.contactName || '—')} · ${escapeHtml(client.email)}</div>

      <form id="assessmentForm">
        <div class="checkbox-row">
          <input type="checkbox" id="completedCheck" ${client.assessmentCompleted ? 'checked' : ''}>
          <label for="completedCheck">Assessment completed</label>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label>Machines</label>
            <input type="number" name="machines" value="${d.machines ?? ''}" min="0">
          </div>
          <div class="form-field">
            <label>Users</label>
            <input type="number" name="users" value="${d.users ?? ''}" min="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>Critical findings (manual — ignored if findings below are added)</label>
            <input type="number" name="critical" value="${d.critical ?? ''}" min="0">
          </div>
          <div class="form-field">
            <label>High findings (manual — ignored if findings below are added)</label>
            <input type="number" name="high" value="${d.high ?? ''}" min="0">
          </div>
        </div>
        <div class="form-field" style="margin-bottom:18px;">
          <label>Attack path (comma-separated, in order)</label>
          <input type="text" name="attackPath" value="${(d.attackPath || []).join(', ')}" placeholder="USER01, WORKSTATION01, SERVICE01, DOMAIN ADMIN">
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:20px 0;">

        <label style="display:block; font-size:11px; font-weight:700; letter-spacing:0.5px; color:var(--text-1); margin-bottom:10px;">FINDINGS</label>
        <div class="severity-summary" id="severitySummary"></div>
        <div class="findings-editor" id="findingsList"></div>
        <button type="button" class="btn-outline add-finding-btn" id="addFindingBtn">+ ADD FINDING</button>

        <br>
        <button type="submit" class="btn-primary">SAVE</button>
        <div class="status-msg" id="saveStatus"></div>
      </form>

      <hr style="border:none;border-top:1px solid var(--border);margin:24px 0;">

      <div class="form-field">
        <label>Upload report (PDF)</label>
        <form id="reportForm" class="upload-row">
          <input type="file" name="report" accept="application/pdf" required>
          <button type="submit" class="btn-outline">UPLOAD</button>
        </form>
        <div class="status-msg" id="reportStatus"></div>
        ${client.reportFilename ? `<div class="form-note">Current file: ${escapeHtml(client.reportFilename)}</div>` : ''}
      </div>
    `;

    renderFindingsEditor();

    document.getElementById('addFindingBtn').addEventListener('click', () => {
      findings.push({ title: '', severity: 'Informational', status: 'Open', retestStatus: 'Not Retested' });
      renderFindingsEditor();
    });

    document.getElementById('reportForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = e.target.querySelector('input[type=file]');
      if (!fileInput.files[0]) return;
      const fd = new FormData();
      fd.append('report', fileInput.files[0]);
      const statusEl = document.getElementById('reportStatus');
      try {
        const res = await fetch(`${API}/admin/clients/${id}/report`, {
          method: 'POST', credentials: 'same-origin', body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed.');
        statusEl.textContent = 'Report uploaded.';
        statusEl.className = 'status-msg show ok';
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'status-msg show err';
      }
    });

    document.getElementById('assessmentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        completed: document.getElementById('completedCheck').checked,
        machines: fd.get('machines'),
        users: fd.get('users'),
        critical: fd.get('critical'),
        high: fd.get('high'),
        attackPath: String(fd.get('attackPath') || '').split(',').map(s => s.trim()).filter(Boolean),
        findings: findings.filter(f => f.title && f.title.trim()),
      };
      const statusEl = document.getElementById('saveStatus');
      try {
        await apiFetch(`${API}/admin/clients/${id}/assessment`, { method: 'PUT', body: JSON.stringify(body) });
        statusEl.textContent = 'Saved.';
        statusEl.className = 'status-msg show ok';
        loadClients();
        selectClient(id);
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'status-msg show err';
      }
    });
  }

  // ====================================================================
  // MESSAGES
  // ====================================================================
  let selectedThreadId = null;

  async function loadThreads() {
    const { threads } = await apiFetch(`${API}/admin/messages`);
    const listEl = document.getElementById('threadList');

    if (!threads.length) {
      listEl.innerHTML = `<div class="detail-empty">No client messages yet.</div>`;
      return;
    }

    listEl.innerHTML = threads.map(t => {
      const last = t.messages[t.messages.length - 1];
      return `
        <button class="list-row${t.userId === selectedThreadId ? ' active' : ''}" data-id="${t.userId}">
          <div class="row-title">${escapeHtml(t.companyName)}</div>
          <div class="row-sub">${escapeHtml(last.body.slice(0, 48))}${last.body.length > 48 ? '…' : ''}</div>
        </button>
      `;
    }).join('');

    listEl.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', () => selectThread(Number(row.dataset.id), threads));
    });

    if (selectedThreadId) {
      const stillThere = threads.find(t => t.userId === selectedThreadId);
      if (stillThere) renderThread(stillThere);
    }
  }

  function renderThread(thread) {
    const detail = document.getElementById('threadDetail');
    detail.innerHTML = `
      <h3>${escapeHtml(thread.companyName)}</h3>
      <div class="detail-sub">${escapeHtml(thread.email)}</div>
      <div class="thread">
        ${thread.messages.map(m => `
          <div class="msg ${m.sender}">
            ${escapeHtml(m.body)}
            <div class="msg-meta">${m.sender === 'admin' ? 'You' : 'Client'} · ${formatTime(m.created_at)}</div>
          </div>
        `).join('')}
      </div>
      <form class="msg-form" id="replyForm">
        <textarea name="body" placeholder="Reply…" required></textarea>
        <button type="submit" class="btn-primary">SEND</button>
      </form>
    `;

    document.getElementById('replyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const textarea = e.target.querySelector('textarea');
      const body = textarea.value.trim();
      if (!body) return;
      try {
        await apiFetch(`${API}/admin/messages/${thread.userId}`, { method: 'POST', body: JSON.stringify({ body }) });
        textarea.value = '';
        await loadThreads();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  async function selectThread(userId, threads) {
    selectedThreadId = userId;
    document.querySelectorAll('#threadList .list-row').forEach(row => {
      row.classList.toggle('active', Number(row.dataset.id) === userId);
    });
    const thread = threads.find(t => t.userId === userId);
    if (thread) renderThread(thread);
  }

  // ====================================================================
  // DETECTIONS
  // ====================================================================
  let selectedAlertId = null;
  let cachedClients = [];

  function timeAgo(iso) {
    return new Date(iso + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function loadAlerts() {
    const { alerts } = await apiFetch(`${API}/admin/alerts`);
    const listEl = document.getElementById('alertList');

    if (!alerts.length) {
      listEl.innerHTML = `<div class="detail-empty">No alerts yet. Try "Simulate Attack Chain" or wait for the real collector to report events.</div>`;
      return;
    }

    listEl.innerHTML = alerts.map(a => `
      <button class="list-row${a.id === selectedAlertId ? ' active' : ''}" data-id="${a.id}">
        <div class="alert-row-title">
          <span class="severity-badge ${a.severity.toLowerCase()}">${a.severity}</span>
          <span class="row-title" style="margin-bottom:0;">${escapeHtml(a.title)}</span>
        </div>
        <div class="row-sub">${a.eventSource === 'simulator' ? 'Simulated' : 'Live collector'} · ${timeAgo(a.createdAt)}</div>
        <span class="status-pill" style="margin-top:6px; display:inline-block;">${a.status}</span>
      </button>
    `).join('');

    listEl.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', () => selectAlert(Number(row.dataset.id), alerts));
    });

    if (selectedAlertId) {
      const stillThere = alerts.find(a => a.id === selectedAlertId);
      if (stillThere) renderAlertDetail(stillThere);
    }
  }

  async function renderAlertDetail(alert) {
    if (!cachedClients.length) {
      const { clients } = await apiFetch(`${API}/admin/clients`);
      cachedClients = clients;
    }
    const assessedClients = cachedClients.filter(c => c.assessmentCompleted);

    const detail = document.getElementById('alertDetail');
    detail.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
        <span class="severity-badge ${alert.severity.toLowerCase()}">${alert.severity}</span>
        <h3 style="margin:0;">${escapeHtml(alert.title)}</h3>
      </div>
      <div class="detail-sub">${escapeHtml(alert.mitreTechnique || '')}</div>
      <p style="font-size:13px; color:var(--text-1); margin:16px 0;">${escapeHtml(alert.description || '')}</p>

      <div class="form-field">
        <label>Raw event data (${alert.eventSource === 'simulator' ? 'simulated' : 'live collector'})</label>
        <pre style="background:var(--bg-1); border:1px solid var(--border); border-radius:6px; padding:12px; font-size:11px; color:var(--text-1); overflow-x:auto;">${escapeHtml(JSON.stringify(alert.eventData, null, 2))}</pre>
      </div>

      <form id="alertForm">
        <div class="form-field">
          <label>Status</label>
          <select name="status" id="alertStatus">
            ${['New', 'Investigating', 'Resolved', 'False Positive'].map(s => `<option value="${s}" ${alert.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>Investigation notes</label>
          <textarea name="notes" style="width:100%; min-height:70px; background:var(--bg-1); border:1px solid var(--border); border-radius:5px; padding:10px; color:var(--text-0); font-family:inherit; font-size:12.5px;">${escapeHtml(alert.investigationNotes || '')}</textarea>
        </div>
        <button type="submit" class="btn-primary">SAVE INVESTIGATION</button>
        <div class="status-msg" id="alertSaveStatus"></div>
      </form>

      <hr style="border:none;border-top:1px solid var(--border);margin:20px 0;">

      <div class="form-field">
        <label>Promote to a client's findings</label>
        ${assessedClients.length === 0
          ? '<p class="form-note">No client has a completed assessment yet — mark one complete first.</p>'
          : `
            <select id="promoteClientSelect" style="width:100%; margin-bottom:10px; background:var(--bg-1); border:1px solid var(--border); border-radius:5px; color:var(--text-0); padding:8px 10px; font-size:12.5px;">
              ${assessedClients.map(c => `<option value="${c.id}">${escapeHtml(c.companyName)}</option>`).join('')}
            </select>
            <textarea id="promoteRecommendation" placeholder="Recommendation for the client (optional)" style="width:100%; min-height:50px; background:var(--bg-1); border:1px solid var(--border); border-radius:5px; padding:10px; color:var(--text-0); font-family:inherit; font-size:12.5px; margin-bottom:10px;"></textarea>
            <button class="btn-outline" id="promoteBtn">PROMOTE TO FINDING</button>
            <div class="status-msg" id="promoteStatus"></div>
          `
        }
        ${alert.promotedFindingClientId ? `<div class="form-note" style="margin-top:10px;">Already promoted to client #${alert.promotedFindingClientId}.</div>` : ''}
      </div>
    `;

    document.getElementById('alertForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const statusEl = document.getElementById('alertSaveStatus');
      try {
        await apiFetch(`${API}/admin/alerts/${alert.id}`, {
          method: 'PUT',
          body: JSON.stringify({ status: fd.get('status'), investigationNotes: fd.get('notes') }),
        });
        statusEl.textContent = 'Saved.';
        statusEl.className = 'status-msg show ok';
        loadAlerts();
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'status-msg show err';
      }
    });

    document.getElementById('promoteBtn')?.addEventListener('click', async () => {
      const clientId = document.getElementById('promoteClientSelect').value;
      const recommendation = document.getElementById('promoteRecommendation').value;
      const statusEl = document.getElementById('promoteStatus');
      try {
        await apiFetch(`${API}/admin/alerts/${alert.id}/promote`, {
          method: 'POST',
          body: JSON.stringify({ clientId, recommendation }),
        });
        statusEl.textContent = 'Promoted to finding.';
        statusEl.className = 'status-msg show ok';
        loadAlerts();
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'status-msg show err';
      }
    });
  }

  async function selectAlert(id, alerts) {
    selectedAlertId = id;
    document.querySelectorAll('#alertList .list-row').forEach(row => {
      row.classList.toggle('active', Number(row.dataset.id) === id);
    });
    const alert = alerts.find(a => a.id === id);
    if (alert) renderAlertDetail(alert);
  }

  document.getElementById('simulateBtn').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'RUNNING...';
    try {
      const result = await apiFetch(`${API}/admin/simulate`, { method: 'POST' });
      btn.textContent = `FIRED ${result.alertsFired} ALERT${result.alertsFired === 1 ? '' : 'S'}`;
      await loadAlerts();
    } catch (err) {
      btn.textContent = 'FAILED — TRY AGAIN';
    } finally {
      setTimeout(() => { btn.disabled = false; btn.textContent = 'SIMULATE ATTACK CHAIN'; }, 2500);
    }
  });

  // ====================================================================
  // ASSESSMENT REQUESTS
  // ====================================================================
  async function loadRequests() {
    const { requests } = await apiFetch(`${API}/admin/requests`);
    const listEl = document.getElementById('requestList');

    if (!requests.length) {
      listEl.innerHTML = `<div class="detail-empty">No assessment requests yet.</div>`;
      return;
    }

    listEl.innerHTML = requests.map(r => `
      <div class="simple-list-item">
        <div class="row-title">${escapeHtml(r.companyName || r.name)}</div>
        <div class="row-meta">${escapeHtml(r.name)} · ${escapeHtml(r.email)}${r.assessmentType ? ` · ${escapeHtml(r.assessmentType)}` : ''}${r.preferredDate ? ` · preferred: ${escapeHtml(r.preferredDate)}` : ''}</div>
        ${r.message ? `<div class="row-meta" style="margin-top:6px;">"${escapeHtml(r.message)}"</div>` : ''}
        <select class="request-status-select" data-id="${r.id}">
          ${['Pending', 'Approved', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'].map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    `).join('');

    listEl.querySelectorAll('.request-status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        try {
          await apiFetch(`${API}/admin/requests/${sel.dataset.id}`, {
            method: 'PUT', body: JSON.stringify({ status: sel.value }),
          });
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  // ====================================================================
  // AUDIT LOG
  // ====================================================================
  async function loadAuditLog() {
    const { logs } = await apiFetch(`${API}/admin/audit-logs`);
    const listEl = document.getElementById('auditLogList');

    if (!logs.length) {
      listEl.innerHTML = `<div class="detail-empty">No activity logged yet.</div>`;
      return;
    }

    listEl.innerHTML = logs.map(l => `
      <div class="simple-list-item">
        <div class="row-title">${escapeHtml(l.action)}</div>
        <div class="row-meta">${escapeHtml(l.actorLabel || 'system')}${l.resource ? ` · ${escapeHtml(l.resource)}` : ''} · ${timeAgo(l.createdAt)}</div>
        ${l.metadata ? `<div class="row-meta" style="margin-top:4px; font-family:monospace;">${escapeHtml(JSON.stringify(l.metadata))}</div>` : ''}
      </div>
    `).join('');
  }

  loadClients();
});
