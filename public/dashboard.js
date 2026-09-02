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

  // ---------- require a session, or bounce back to the homepage ----------
  let user;
  try {
    const result = await apiFetch(`${API}/auth/me`);
    user = result.user;
  } catch {
    window.location.href = '/';
    return;
  }
  if (user.role === 'admin') {
    window.location.href = '/admin.html';
    return;
  }

  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('dashContent').style.display = 'block';
  document.getElementById('greeting').textContent = `Welcome back, ${user.companyName}`;
  document.getElementById('accountEmail').textContent = user.email;

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await apiFetch(`${API}/auth/logout`, { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  });

  // ---------- real assessment status ----------
  try {
    const status = await apiFetch(`${API}/assessment`);

    if (!status.completed) {
      document.getElementById('emptyState').style.display = 'block';
    } else {
      document.getElementById('completeState').style.display = 'block';
      const d = status.data;

      document.getElementById('statsGrid').innerHTML = `
        <div class="stat"><div class="num">${d.machines}</div><div class="label">MACHINES</div></div>
        <div class="stat"><div class="num">${d.users}</div><div class="label">USERS</div></div>
        <div class="stat"><div class="num crit">${d.critical}</div><div class="label">CRITICAL FINDINGS</div></div>
        <div class="stat"><div class="num warn">${d.high}</div><div class="label">HIGH FINDINGS</div></div>
      `;

      document.getElementById('pathChain').innerHTML = d.attackPath
        .map((step, i) => {
          const isLast = i === d.attackPath.length - 1;
          const node = `<div class="path-node${isLast ? ' final' : ''}">${step}</div>`;
          const arrow = isLast ? '' : `<div class="path-arrow">&#8595;</div>`;
          return node + arrow;
        })
        .join('');

      if (status.hasReport) {
        document.getElementById('reportLink').style.display = 'inline-block';
      }
    }
  } catch {
    document.getElementById('emptyState').style.display = 'block';
  }

  // ---------- tabs ----------
  const tabs = document.querySelectorAll('.dash-tab');
  const views = document.querySelectorAll('.dash-view');
  function activateTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.view === name));
    views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
    if (name === 'contact') loadMessages();
  }
  tabs.forEach(t => t.addEventListener('click', () => activateTab(t.dataset.view)));
  document.getElementById('goToContact')?.addEventListener('click', () => activateTab('contact'));

  // ---------- messages ----------
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  function formatTime(iso) {
    return new Date(iso + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function loadMessages() {
    const thread = document.getElementById('messageThread');
    try {
      const { messages } = await apiFetch(`${API}/messages`);
      if (!messages.length) {
        thread.innerHTML = `<div class="msg-empty">No messages yet — send Alpha a note below to get started.</div>`;
        return;
      }
      thread.innerHTML = messages.map(m => `
        <div class="msg ${m.sender}">
          ${escapeHtml(m.body)}
          <div class="msg-meta">${m.sender === 'admin' ? 'Alpha Team' : 'You'} · ${formatTime(m.created_at)}</div>
        </div>
      `).join('');
    } catch {
      thread.innerHTML = `<div class="msg-empty">Couldn't load messages. Try again shortly.</div>`;
    }
  }

  document.getElementById('messageForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const textarea = e.target.querySelector('textarea');
    const body = textarea.value.trim();
    if (!body) return;
    try {
      await apiFetch(`${API}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
      textarea.value = '';
      loadMessages();
    } catch (err) {
      alert(err.message);
    }
  });
});
