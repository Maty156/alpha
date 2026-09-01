// ---------- team role tabs ----------
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.team-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      panels.forEach(p => {
        p.classList.toggle('active', p.id === `panel-${target}`);
      });
    });
  });

  // ---------- auth modal ----------
  const overlay = document.getElementById('authModal');
  const openBtns = document.querySelectorAll('[data-open-auth]');
  const closeBtn = document.getElementById('authClose');
  const modalTabs = document.querySelectorAll('.modal-tab');
  const modalForms = document.querySelectorAll('.modal-form');

  function openModal(which) {
    overlay.classList.add('open');
    setModalTab(which || 'login');
  }
  function closeModal() {
    overlay.classList.remove('open');
  }
  function setModalTab(which) {
    modalTabs.forEach(t => t.classList.toggle('active', t.dataset.form === which));
    modalForms.forEach(f => f.classList.toggle('active', f.id === `form-${which}`));
  }

  openBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(btn.dataset.openAuth);
    });
  });
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  modalTabs.forEach(t => {
    t.addEventListener('click', () => setModalTab(t.dataset.form));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) {
      closeModal();
    }
  });

  // forms are UI-only — no backend wired up yet
  document.querySelectorAll('.modal-form').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
    });
  });
});
