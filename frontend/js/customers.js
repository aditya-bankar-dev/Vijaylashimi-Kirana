Auth.require(['admin', 'manager', 'cashier']); Layout.init('customers', 'Customers');
const canDel = ['admin', 'manager'].includes(Auth.user.role); let list = []; const pm = new bootstrap.Modal($('prof'));
async function load() {
  list = (await api('/customers' + ($('q').value.trim() ? '?q=' + encodeURIComponent($('q').value.trim()) : ''))).data.filter(c => c.mobile !== '0000000000');
  $('rows').innerHTML = list.map(c => `<tr><td><b>${esc(c.name)}</b><div class="small text-muted">${esc(c.email || '')}</div></td><td>${esc(c.mobile)}</td><td><span class="badge text-bg-warning"><i class="bi bi-star-fill"></i> ${c.loyalty_points}</span></td>
    <td>${c.discount_percent}%</td><td class="text-end">${money(c.total_spent)}</td><td class="text-nowrap"><button class="btn btn-sm btn-outline-secondary" data-v="${c.id}"><i class="bi bi-clock-history"></i></button>
    <button class="btn btn-sm btn-outline-primary" data-e="${c.id}"><i class="bi bi-pencil"></i></button>${canDel ? ` <button class="btn btn-sm btn-outline-danger" data-d="${c.id}"><i class="bi bi-trash"></i></button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted py-4">No customers found</td></tr>';
}
function edit(c) {
  formModal({ title: c ? 'Edit customer' : 'Customer registration', values: c || {}, fields: [{ key: 'name', label: 'Name', required: true }, { key: 'mobile', label: 'Mobile number', required: true }, { key: 'email', label: 'Email', type: 'email' },
    { key: 'discount_percent', label: 'Customer discount %', type: 'number', step: '0.01', min: 0, default: 0 }, { key: 'address', label: 'Address', col: 'col-12' }],
    onSubmit: async d => {
      if (!/^[6-9]\d{9}$/.test(d.mobile)) { toast('Enter a valid 10-digit Indian mobile number', 'error'); throw new Error(); }
      if (d.discount_percent !== undefined && (d.discount_percent < 0 || d.discount_percent > 100)) { toast('Discount must be between 0 and 100', 'error'); throw new Error(); }
      await api(c ? '/customers/' + c.id : '/customers', { method: c ? 'PUT' : 'POST', body: d }); toast('Customer saved', 'success'); load();
    } });
}
async function profile(c) {
  $('pname').textContent = c.name + ' • ' + c.mobile;
  $('pstats').innerHTML = [['Total spent', money(c.total_spent)], ['Loyalty points', c.loyalty_points], ['Discount', c.discount_percent + '%']].map(([l, v]) => `<div class="col-4"><div class="cardx text-center py-2"><div class="small text-muted">${l}</div><div class="fw-bold fs-5">${v}</div></div></div>`).join('');
  const s = (await api('/sales?customer_id=' + c.id)).data;
  $('phist').innerHTML = s.map(x => `<tr><td>${esc(x.invoice_no)}</td><td>${esc(String(x.created_at).slice(0, 16))}</td><td class="text-end">${money(x.grand_total)}</td><td>${esc(x.status)}</td><td><button class="btn btn-sm btn-link" data-p="${x.id}">Receipt</button></td></tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted">No purchases yet</td></tr>';
  pm.show();
}
$('add').onclick = () => edit(null); $('q').oninput = debounce(load);
$('phist').onclick = e => { const b = e.target.closest('[data-p]'); if (b) openPdf(`/sales/${b.dataset.p}/pdf?format=a4`); };
$('rows').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.e) edit(list.find(c => c.id == b.dataset.e));
  if (b.dataset.v) profile(list.find(c => c.id == b.dataset.v));
  if (b.dataset.d && confirm('Delete this customer? Past bills are kept.')) { await api('/customers/' + b.dataset.d, { method: 'DELETE' }); toast('Customer deleted', 'success'); load(); }
};
load();
