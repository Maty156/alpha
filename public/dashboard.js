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
    }
  } catch {
    document.getElementById('emptyState').style.display = 'block';
  }
});
