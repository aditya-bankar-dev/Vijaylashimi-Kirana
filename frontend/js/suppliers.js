Auth.require(['admin', 'manager']); Layout.init('suppliers', 'Suppliers');
let list = [], cur = null, hist = null; const hm = new bootstrap.Modal($('hm'));
async function load() {
  list = (await api('/suppliers' + ($('q').value.trim() ? '?q=' + encodeURIComponent($('q').value.trim()) : ''))).data;
  $('rows').innerHTML = list.map(s => `<tr><td><b>${esc(s.name)}</b><div class="small text-muted">${esc(s.address || '')}</div></td><td>${esc(s.contact_person || '')}<div class="small text-muted">${esc(s.phone)}${s.email ? ' • ' + esc(s.email) : ''}</div></td>
    <td>${esc(s.gstin || '-')}</td><td class="text-end ${s.outstanding_balance > 0 ? 'text-danger fw-semibold' : ''}">${money(s.outstanding_balance)}</td>
    <td class="text-nowrap"><button class="btn btn-sm btn-outline-secondary" data-v="${s.id}" title="History"><i class="bi bi-clock-history"></i></button> <button class="btn btn-sm btn-outline-primary" data-e="${s.id}"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-outline-danger" data-d="${s.id}"><i class="bi bi-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted py-4">No suppliers found</td></tr>';
}
function edit(s) {
  formModal({ title: s ? 'Edit supplier' : 'Add supplier', values: s || {}, fields: [{ key: 'name', label: 'Supplier name', required: true }, { key: 'contact_person', label: 'Contact person' }, { key: 'phone', label: 'Phone', required: true }, { key: 'email', label: 'Email', type: 'email' }, { key: 'gstin', label: 'GSTIN' }, { key: 'address', label: 'Address' }],
    onSubmit: async d => {
      if (!/^\d{10}$|^0\d{2,4}-?\d{6,8}$/.test(d.phone.replace(/\s/g, ''))) { toast('Enter a valid phone number', 'error'); throw new Error(); }
      if (d.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(d.gstin.toUpperCase())) { toast('Invalid GSTIN format', 'error'); throw new Error(); }
      if (d.gstin) d.gstin = d.gstin.toUpperCase();
      await api(s ? '/suppliers/' + s.id : '/suppliers', { method: s ? 'PUT' : 'POST', body: d }); toast('Supplier saved', 'success'); load();
    } });
}
async function history(s) {
  cur = s; hist = await api(`/suppliers/${s.id}/history`); $('hname').textContent = s.name; $('hout').textContent = money(hist.outstanding);
  $('hpur').innerHTML = hist.purchases.map(p => `<tr><td>${esc(p.purchase_no)}</td><td>${esc(p.purchase_date)}</td><td class="text-end">${money(p.total)}</td><td class="text-end">${money(p.paid_amount)}</td><td>${esc(p.status)} / ${esc(p.payment_status)}</td></tr>`).join('') || '<tr><td colspan="5" class="text-muted text-center">No purchases</td></tr>';
  $('hpay').innerHTML = hist.payments.map(p => `<tr><td>${esc(p.paid_on)}</td><td>${esc(p.method)}</td><td>${esc(p.reference || '')}</td><td class="text-end">${money(p.amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="text-muted text-center">No payments</td></tr>';
  hm.show();
}
$('payBtn').onclick = () => {
  const open = hist.purchases.filter(p => p.status === 'confirmed' && p.payment_status !== 'paid');
  formModal({ title: 'Record payment to ' + cur.name, fields: [
    { key: 'purchase_id', label: 'Against purchase (optional)', type: 'select', col: 'col-12', placeholder: 'General payment', options: open.map(p => ({ v: p.id, l: `${p.purchase_no} (due ${money(p.total - p.paid_amount)})` })) },
    { key: 'amount', label: 'Amount (₹)', type: 'number', step: '0.01', min: 0, required: true }, { key: 'method', label: 'Method', type: 'select', options: ['cash', 'upi', 'card', 'bank'] }, { key: 'reference', label: 'Reference / UTR', col: 'col-12' }],
    onSubmit: async d => { if (!(Number(d.amount) > 0)) { toast('Enter a valid amount', 'error'); throw new Error(); }
      await api('/supplier-payments', { method: 'POST', body: { ...d, supplier_id: cur.id, method: d.method || 'cash' } }); toast('Payment recorded', 'success'); history(cur); load(); } });
};
$('add').onclick = () => edit(null); $('q').oninput = debounce(load);
$('rows').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.e) edit(list.find(s => s.id == b.dataset.e)); if (b.dataset.v) history(list.find(s => s.id == b.dataset.v));
  if (b.dataset.d && confirm('Remove this supplier? Purchase history is kept.')) { await api('/suppliers/' + b.dataset.d, { method: 'DELETE' }); toast('Supplier removed', 'success'); load(); }
};
load();
