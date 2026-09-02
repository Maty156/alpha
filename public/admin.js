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
        <div class="row-sub">${escapeHtml(c.email)}</div>
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
    const detail = document.getElementById('clientDetail');

    detail.innerHTML = `
      <h3>${escapeHtml(client.companyName)}</h3>
      <div class="detail-sub">${escapeHtml(client.email)}</div>

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
            <label>Critical findings</label>
            <input type="number" name="critical" value="${d.critical ?? ''}" min="0">
          </div>
          <div class="form-field">
            <label>High findings</label>
            <input type="number" name="high" value="${d.high ?? ''}" min="0">
          </div>
        </div>
        <div class="form-field" style="margin-bottom:18px;">
          <label>Attack path (comma-separated, in order)</label>
          <input type="text" name="attackPath" value="${(d.attackPath || []).join(', ')}" placeholder="USER01, WORKSTATION01, SERVICE01, DOMAIN ADMIN">
        </div>

        <button type="submit" class="btn-primary">SAVE</button>
        <div class="status-msg" id="saveStatus"></div>
      </form>

      <hr style="border:none;border-top:1px solid var(--border);margin:24px 0;">

      <div class="form-field">
        <label>Upload report (PDF)</label>
        <form id="reportForm" style="display:flex; gap:10px; align-items:center;">
          <input type="file" name="report" accept="application/pdf" required style="flex:1;">
          <button type="submit" class="btn-outline" style="white-space:nowrap;">UPLOAD</button>
        </form>
        <div class="status-msg" id="reportStatus"></div>
        ${client.reportFilename ? `<div class="form-note">Current file: ${escapeHtml(client.reportFilename)}</div>` : ''}
      </div>
    `;

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
      };
      const statusEl = document.getElementById('saveStatus');
      try {
        await apiFetch(`${API}/admin/clients/${id}/assessment`, { method: 'PUT', body: JSON.stringify(body) });
        statusEl.textContent = 'Saved.';
        statusEl.className = 'status-msg show ok';
        loadClients();
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

  loadClients();
});
