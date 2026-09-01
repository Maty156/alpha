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

  // Forms are UI-only — no backend wired up yet
  document.querySelectorAll('.modal-form').forEach(form => {
    form.addEventListener('submit', e => e.preventDefault());
  });

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

