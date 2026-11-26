const API = '/api';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(n) || 0);
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const Auth = {
  get token() { return localStorage.getItem('token'); },
  get user() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  set(t, u) { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); },
  logout() { localStorage.removeItem('token'); localStorage.removeItem('user'); location.href = 'login.html'; },
  require(roles) {
    if (!this.token || !this.user) return this.logout();
    if (roles && !roles.includes(this.user.role)) { location.href = this.user.role === 'cashier' ? 'billing.html' : 'dashboard.html'; throw new Error('redirect'); }
  }
};

function toast(msg, type = 'info') {
  let box = $('toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toastx ' + type; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function loading(on) {
  let l = $('loader'); if (!l) { l = document.createElement('div'); l.id = 'loader'; l.innerHTML = '<div class="spin"></div>'; document.body.appendChild(l); }
  l.classList.toggle('on', on);
}
async function api(path, { method = 'GET', body, silent = false, spinner = false, raw = false } = {}) {
  if (spinner) loading(true);
  try {
    const res = await fetch(API + path, { method, headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(Auth.token ? { Authorization: 'Bearer ' + Auth.token } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    if (raw && res.ok) return res;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith('/auth/login')) return Auth.logout();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  } catch (e) { if (!silent) toast(e.message, 'error'); throw e; }
  finally { if (spinner) loading(false); }
}
async function openPdf(path) {                       // authenticated PDF -> new tab (used for receipts)
  const res = await api(path, { raw: true });
  window.open(URL.createObjectURL(await res.blob()), '_blank');
}
