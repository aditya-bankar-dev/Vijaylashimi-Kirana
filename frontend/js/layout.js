const NAV = [
  ['dashboard', 'Dashboard', 'bi-speedometer2', ['admin', 'manager']],
  ['billing', 'POS Billing', 'bi-receipt', ['admin', 'manager', 'cashier']],
  ['products', 'Products', 'bi-box-seam', ['admin', 'manager', 'cashier']],
  ['inventory', 'Inventory', 'bi-boxes', ['admin', 'manager']],
  ['purchases', 'Purchases', 'bi-cart-plus', ['admin', 'manager']],
  ['suppliers', 'Suppliers', 'bi-truck', ['admin', 'manager']],
  ['customers', 'Customers', 'bi-people', ['admin', 'manager', 'cashier']],
  ['expenses', 'Expenses', 'bi-wallet2', ['admin', 'manager']],
  ['reports', 'Reports', 'bi-bar-chart-line', ['admin', 'manager']],
  ['settings', 'Settings', 'bi-gear', ['admin']]
];
const Layout = {
  theme() { return localStorage.getItem('theme') || 'light'; },
  apply(t) { document.documentElement.setAttribute('data-bs-theme', t); localStorage.setItem('theme', t); const i = $('themeBtn'); if (i) i.className = 'bi ' + (t === 'dark' ? 'bi-sun' : 'bi-moon-stars'); },
  init(active, title) {
    const u = Auth.user;
    $('sidebar').innerHTML = `<div class="brand"><i class="bi bi-basket3-fill"></i>Kirana Manager</div><nav class="py-2 flex-grow-1">` +
      NAV.filter(n => n[3].includes(u.role)).map(n => `<a class="nav-link-x ${n[0] === active ? 'active' : ''}" href="${n[0]}.html"><i class="bi ${n[2]}"></i>${n[1]}</a>`).join('') + `</nav>`;
    $('topbar').innerHTML = `<button class="btn btn-sm d-lg-none" id="menuBtn"><i class="bi bi-list fs-4"></i></button><h5 class="m-0 flex-grow-1">${esc(title || '')}</h5>
      <select class="form-select form-select-sm" id="languageSelect" aria-label="Language" style="width:auto;max-width:112px" onchange="setLanguage(this.value)"><option value="en">English</option><option value="mr">मराठी</option></select>
      <button class="btn btn-sm" id="themeToggle" title="Toggle theme"><i id="themeBtn" class="bi"></i></button>
      <div class="text-end small lh-sm"><b>${esc(u.name)}</b><br><span class="text-muted text-capitalize">${esc(u.role)}</span></div>
      <button class="btn btn-sm btn-outline-danger" id="logoutBtn"><i class="bi bi-box-arrow-right"></i></button>`;
    this.apply(this.theme());
    $('themeToggle').onclick = () => this.apply(this.theme() === 'dark' ? 'light' : 'dark');
    $('logoutBtn').onclick = () => Auth.logout();
    $('menuBtn').onclick = () => $('sidebar').classList.toggle('open');
  }
};
document.documentElement.setAttribute('data-bs-theme', localStorage.getItem('theme') || 'light');
