Auth.require(['admin']); Layout.init('settings', 'Settings');
const F = [['store_name', 'Store name'], ['store_address', 'Address'], ['store_phone', 'Phone'], ['store_gstin', 'Store GSTIN'], ['upi_id', 'UPI ID (for QR payments)'], ['loyalty_points_per_100', 'Loyalty points per ₹100'], ['receipt_width_mm', 'Thermal receipt width (mm)']];
let users = [];
async function loadSettings() {
  const { data } = await api('/settings');
  $('sf').innerHTML = F.map(([k, l]) => k === 'receipt_width_mm' ? `<label class="form-label small mb-1 mt-2">${l}</label><select class="form-select" id="s_${k}"><option ${data[k] == 58 ? 'selected' : ''}>58</option><option ${data[k] != 58 ? 'selected' : ''}>80</option></select>`
    : `<label class="form-label small mb-1 mt-2">${l}</label><input class="form-control" id="s_${k}" value="${esc(data[k] || '')}">`).join('');
}
$('save').onclick = async () => {
  const b = Object.fromEntries(F.map(([k]) => [k, $('s_' + k).value.trim()]));
  if (!b.store_name) return toast('Store name is required', 'error');
  if (b.upi_id && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(b.upi_id)) return toast('Invalid UPI ID (example: shop@upi)', 'error');
  if (b.store_gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(b.store_gstin.toUpperCase())) return toast('Invalid GSTIN format', 'error');
  if (!(Number(b.loyalty_points_per_100) >= 0)) return toast('Loyalty points must be 0 or more', 'error');
  b.store_gstin = b.store_gstin.toUpperCase(); await api('/settings', { method: 'PUT', body: b, spinner: true }); toast('Settings saved', 'success');
};
$('bk').onclick = async () => { const r = await api('/backup/run', { method: 'POST', spinner: true }); toast('Backup saved: ' + r.file, 'success'); };
async function loadUsers() {
  users = (await api('/users')).data;
  $('users').innerHTML = users.map(u => `<tr><td><b>${esc(u.name)}</b><div class="small text-muted">${esc(u.email)}</div></td><td class="text-capitalize">${esc(u.role)}</td><td class="small">${esc(u.last_login || 'Never')}</td>
    <td><span class="badge text-bg-${u.is_active ? 'success' : 'secondary'}">${u.is_active ? 'Active' : 'Disabled'}</span></td><td class="text-nowrap"><button class="btn btn-sm btn-outline-primary" data-e="${u.id}"><i class="bi bi-pencil"></i></button>
    ${u.id !== Auth.user.id ? ` <button class="btn btn-sm btn-outline-${u.is_active ? 'danger' : 'success'}" data-t="${u.id}">${u.is_active ? 'Disable' : 'Enable'}</button>` : ''}</td></tr>`).join('');
}
function editUser(u) {
  formModal({ title: u ? 'Edit user' : 'Add user', values: u || {}, fields: [{ key: 'name', label: 'Full name', required: true }, { key: 'email', label: 'Email', type: 'email', required: !u }, { key: 'phone', label: 'Phone' },
    { key: 'role', label: 'Role', type: 'select', default: 'cashier', options: ['admin', 'manager', 'cashier'] }, { key: 'password', label: u ? 'New password (leave blank to keep)' : 'Password (min 8 chars)', type: 'password', required: !u, col: 'col-12' }],
    onSubmit: async d => {
      if (d.password && d.password.length < 8) { toast('Password must be at least 8 characters', 'error'); throw new Error(); }
      if (u) { delete d.email; await api('/users/' + u.id, { method: 'PUT', body: d }); } else await api('/users', { method: 'POST', body: d });
      toast('User saved', 'success'); loadUsers();
    } });
}
$('addU').onclick = () => editUser(null);
$('users').onclick = async e => { const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.e) editUser(users.find(u => u.id == b.dataset.e));
  if (b.dataset.t) { const u = users.find(x => x.id == b.dataset.t); await api('/users/' + u.id, { method: 'PUT', body: { is_active: !u.is_active } }); loadUsers(); } };
loadSettings(); loadUsers();
