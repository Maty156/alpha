document.addEventListener('DOMContentLoaded', () => {

  /* ─── Navbar: shrink on scroll ─── */
  const nav = document.querySelector('header.nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 48);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ─── Hamburger / mobile menu ─── */
  const hamburger  = document.getElementById('navHamburger');
  const mobileMenu = document.getElementById('mobileMenu');

  hamburger.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open', open);
  });

  // Close mobile menu when a link is clicked
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
    });
  });

  /* ─── Team role tabs ─── */
  const tabs   = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.team-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      panels.forEach(p => p.classList.toggle('active', p.id === `panel-${target}`));
    });
  });

  /* ─── Auth modal ─── */
  const overlay   = document.getElementById('authModal');
  const openBtns  = document.querySelectorAll('[data-open-auth]');
  const closeBtn  = document.getElementById('authClose');
  const modalTabs = document.querySelectorAll('.modal-tab');
  const modalForms = document.querySelectorAll('.modal-form');

  function openModal(which) {
    overlay.classList.add('open');
    setModalTab(which || 'login');
  }
  function closeModal() { overlay.classList.remove('open'); }
  function setModalTab(which) {
    modalTabs.forEach(t  => t.classList.toggle('active', t.dataset.form === which));
    modalForms.forEach(f => f.classList.toggle('active', f.id === `form-${which}`));
    if (which === 'register') {
      const stamp = document.getElementById('formRenderedAt');
      if (stamp) stamp.value = Date.now();
    }
  }

  openBtns.forEach(btn => {
    btn.addEventListener('click', e => { e.preventDefault(); openModal(btn.dataset.openAuth); });
  });
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  modalTabs.forEach(t => t.addEventListener('click', () => setModalTab(t.dataset.form)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  // ---------- Auth: real API wiring ----------
  const API = '/api/auth';
  const navActions = document.querySelector('.nav-actions');
  const navLoginLink = document.querySelector('.nav-login');

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

  function showSignedInState(user) {
    if (!navActions) return;
    const portalUrl = user.role === 'admin' ? '/admin.html' : '/dashboard.html';
    navActions.innerHTML = `
      <a href="${portalUrl}" class="nav-login">${user.role === 'admin' ? 'Admin Panel' : 'Dashboard'}</a>
      <button class="nav-cta" id="logoutBtn" style="border:none;">SIGN OUT</button>
    `;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await apiFetch(`${API}/logout`, { method: 'POST' }).catch(() => {});
      window.location.reload();
    });
    if (user.role !== 'admin') loadAssessmentStatus();
  }

  async function checkSession() {
    try {
      const { user } = await apiFetch(`${API}/me`);
      showSignedInState(user);
    } catch {
      // not signed in — leave the default Client Login / Request Assessment buttons
    }
  }

  function formToObject(form) {
    const obj = {};
    new FormData(form).forEach((value, key) => { obj[key] = value; });
    return obj;
  }

  function setFormError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', !!message);
  }

  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('loginError', '');
    const body = formToObject(e.target);
    try {
      const { user } = await apiFetch(`${API}/login`, { method: 'POST', body: JSON.stringify(body) });
      window.location.href = user.role === 'admin' ? '/admin.html' : '/dashboard.html';
    } catch (err) {
      setFormError('loginError', err.message);
    }
  });

  document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    setFormError('registerError', '');
    const body = formToObject(e.target);

    if (body.password !== body.confirmPassword) {
      setFormError('registerError', 'Passwords do not match.');
      return;
    }
    delete body.confirmPassword;

    try {
      await apiFetch(`${API}/register`, { method: 'POST', body: JSON.stringify(body) });
      // registration always creates a client account — admins are seeded separately
      window.location.href = '/dashboard.html';
    } catch (err) {
      setFormError('registerError', err.message);
    }
  });

  // ---------- password strength meter ----------
  function scorePassword(pw) {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(score, 4);
  }
  const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  const pwField = document.getElementById('registerPassword');
  const meter = document.getElementById('strengthMeter');
  const label = document.getElementById('strengthLabel');
  pwField?.addEventListener('input', () => {
    const score = scorePassword(pwField.value);
    meter.dataset.score = score;
    label.textContent = pwField.value ? LABELS[score] : '';
  });

  // ---------- password show/hide toggles ----------
  document.querySelectorAll('.eye-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.querySelector('.eye-open').style.display = isHidden ? 'none' : 'block';
      btn.querySelector('.eye-closed').style.display = isHidden ? 'block' : 'none';
      btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
  });

  // ---------- Live assessment status (replaces the static demo dashboard note when signed in) ----------
  async function loadAssessmentStatus() {
    const target = document.getElementById('assessmentStatus');
    if (!target) return;
    try {
      const status = await apiFetch('/api/assessment');
      if (!status.completed) {
        target.innerHTML = `
          <div class="status-banner">
            <strong>Your assessment status:</strong> ${status.message}
          </div>`;
      } else {
        target.innerHTML = `<div class="status-banner status-complete"><strong>Your assessment is complete.</strong> Full report available soon.</div>`;
      }
      target.style.display = 'block';
    } catch {
      // not signed in or request failed — leave hidden
    }
  }

  checkSession();

  /* ─── Scroll-triggered fade-in (IntersectionObserver) ─── */
  const animEls = document.querySelectorAll('[data-animate]');
  const animObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        animObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  animEls.forEach(el => animObs.observe(el));

  /* ─── Stat counter animation ─── */
  function animateCounter(el, target, duration = 900) {
    const start = performance.now();
    const update = now => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  const counterEls = document.querySelectorAll('[data-counter]');
  const counterObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        animateCounter(el, parseInt(el.dataset.counter, 10));
        counterObs.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  counterEls.forEach(el => { el.textContent = '0'; counterObs.observe(el); });

});

