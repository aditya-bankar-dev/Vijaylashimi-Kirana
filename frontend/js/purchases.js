Auth.require(['admin', 'manager']); Layout.init('purchases', 'Purchases');
let products = [], lines = [], cur = null; const nm = new bootstrap.Modal($('newm')), dm = new bootstrap.Modal($('detm'));
const SB = { draft: 'secondary', confirmed: 'success', cancelled: 'danger' }, PB = { unpaid: 'danger', partial: 'warning', paid: 'success' };
async function load() {
  const p = new URLSearchParams(); if ($('fs').value) p.set('status', $('fs').value); if ($('fp').value) p.set('payment_status', $('fp').value);
  const r = await api('/purchases?' + p);
  $('rows').innerHTML = r.data.map(x => `<tr data-id="${x.id}"><td><b>${esc(x.purchase_no)}</b></td><td>${esc(x.supplier_name)}</td><td>${esc(x.supplier_invoice_no || '-')}</td><td>${esc(x.purchase_date)}</td><td class="text-end">${money(x.total)}</td><td class="text-end">${money(x.paid_amount)}</td>
    <td><span class="badge text-bg-${SB[x.status]}">${x.status}</span> ${x.status === 'confirmed' ? `<span class="badge text-bg-${PB[x.payment_status]}">${x.payment_status}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="text-center text-muted py-4">No purchases</td></tr>';
}
const calc = l => { const s = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), g = s * (Number(l.gst_rate) || 0) / 100; return { s, g, t: s + g }; };
function totals() { const t = lines.reduce((a, l) => { const c = calc(l); return { s: a.s + c.s, g: a.g + c.g }; }, { s: 0, g: 0 }); $('tsub').textContent = money(t.s); $('tgst').textContent = money(t.g); $('ttot').textContent = money(t.s + t.g); return round2(t.s + t.g); }
function draw() {
  $('lines').innerHTML = lines.map((l, i) => `<tr data-i="${i}"><td><select class="form-select form-select-sm" data-k="product_id"><option value="">Select product</option>${products.map(p => `<option value="${p.id}" ${p.id == l.product_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td>
    <td><input type="number" min="0" step="0.001" class="form-control form-control-sm" data-k="quantity" value="${l.quantity}"></td><td><input type="number" min="0" step="0.01" class="form-control form-control-sm" data-k="unit_price" value="${l.unit_price}"></td>
    <td><select class="form-select form-select-sm" data-k="gst_rate">${[0, 3, 5, 12, 18, 28].map(g => `<option ${g == l.gst_rate ? 'selected' : ''}>${g}</option>`).join('')}</select></td>
    <td><input class="form-control form-control-sm" data-k="batch_no" value="${esc(l.batch_no)}"></td><td><input type="date" class="form-control form-control-sm" data-k="expiry_date" value="${esc(l.expiry_date)}"></td>
    <td class="text-end">${money(calc(l).t)}</td><td><button class="btn btn-sm text-danger" data-x="${i}"><i class="bi bi-x-lg"></i></button></td></tr>`).join(''); totals();
}
$('lines').addEventListener('change', e => { const i = e.target.closest('tr').dataset.i, k = e.target.dataset.k; if (!k) return; lines[i][k] = e.target.value;
  if (k === 'product_id') { const p = products.find(x => x.id == e.target.value); if (p) { lines[i].unit_price = p.purchase_price; lines[i].gst_rate = p.gst_rate; } } draw(); });
$('lines').addEventListener('input', e => { const i = e.target.closest('tr').dataset.i, k = e.target.dataset.k; if (k) { lines[i][k] = e.target.value; e.target.closest('tr').children[6].textContent = money(calc(lines[i]).t); totals(); } });
$('lines').onclick = e => { const b = e.target.closest('[data-x]'); if (b) { lines.splice(b.dataset.x, 1); draw(); } };
$('addLine').onclick = () => { lines.push({ product_id: '', quantity: 1, unit_price: 0, gst_rate: 0, batch_no: '', expiry_date: '' }); draw(); };
$('add').onclick = () => { lines = []; $('addLine').click(); $('inv').value = ''; $('paid').value = ''; $('pdate').value = new Date().toLocaleDateString('en-CA'); nm.show(); };
async function save(confirm) {
  if (!$('sup').value) return toast('Select a supplier', 'error'); if (!$('pdate').value) return toast('Select a date', 'error');
  if (lines.some(l => !l.product_id || !(Number(l.quantity) > 0) || !(Number(l.unit_price) >= 0))) return toast('Every item needs a product, quantity and price', 'error');
  if (new Set(lines.map(l => l.product_id)).size !== lines.length) return toast('Same product added twice; merge the quantities', 'error');
  const paid = Number($('paid').value) || 0; if (confirm && paid > totals()) return toast('Paid amount exceeds total', 'error');
  await api('/purchases', { method: 'POST', spinner: true, body: { supplier_id: $('sup').value, supplier_invoice_no: $('inv').value, purchase_date: $('pdate').value, confirm, paid_amount: confirm ? paid : 0, payment_method: $('pm').value,
    items: lines.map(l => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price, gst_rate: l.gst_rate, batch_no: l.batch_no || null, expiry_date: l.expiry_date || null })) } });
  toast(confirm ? 'Purchase confirmed and stock updated' : 'Draft saved', 'success'); nm.hide(); load();
}
$('draft').onclick = () => save(false); $('conf').onclick = () => save(true);
$('rows').onclick = async e => {
  const tr = e.target.closest('tr'); if (!tr || !tr.dataset.id) return;
  cur = (await api('/purchases/' + tr.dataset.id)).data; $('dt').textContent = `${cur.purchase_no} • ${cur.supplier_name}`;
  $('dinfo').textContent = `Date ${cur.purchase_date} • Invoice ${cur.supplier_invoice_no || '-'} • ${cur.status}${cur.status === 'confirmed' ? ' / ' + cur.payment_status : ''} • Paid ${money(cur.paid_amount)} of ${money(cur.total)}`;
  $('ditems').innerHTML = cur.items.map(i => `<tr><td>${esc(i.name)}</td><td class="text-end">${i.quantity}</td><td class="text-end">${money(i.unit_price)}</td><td class="text-end">${money(i.gst_amount)}</td><td class="text-end">${money(i.line_total)}</td></tr>`).join('');
  $('dtot').textContent = 'Total ' + money(cur.total);
  $('dact').innerHTML = cur.status === 'draft' ? '<button class="btn btn-outline-danger" id="cx">Cancel draft</button><button class="btn btn-green" id="cf">Confirm and update stock</button>'
    : cur.status === 'confirmed' && cur.payment_status !== 'paid' ? '<button class="btn btn-green" id="py">Record payment</button>' : '';
  dm.show();
  if ($('cf')) $('cf').onclick = async () => { await api(`/purchases/${cur.id}/confirm`, { method: 'POST', spinner: true }); toast('Confirmed. Stock updated', 'success'); dm.hide(); load(); };
  if ($('cx')) $('cx').onclick = async () => { await api(`/purchases/${cur.id}/cancel`, { method: 'POST' }); toast('Draft cancelled', 'success'); dm.hide(); load(); };
  if ($('py')) $('py').onclick = () => { dm.hide(); formModal({ title: 'Payment for ' + cur.purchase_no, fields: [{ key: 'amount', label: `Amount (due ${money(cur.total - cur.paid_amount)})`, type: 'number', step: '0.01', min: 0, required: true, default: round2(cur.total - cur.paid_amount) }, { key: 'method', label: 'Method', type: 'select', options: ['cash', 'upi', 'card', 'bank'] }, { key: 'reference', label: 'Reference', col: 'col-12' }],
    onSubmit: async d => { await api('/supplier-payments', { method: 'POST', body: { ...d, method: d.method || 'cash', supplier_id: cur.supplier_id, purchase_id: cur.id } }); toast('Payment recorded', 'success'); load(); } }); };
};
['fs', 'fp'].forEach(i => ($(i).onchange = load));
(async () => {
  const [p, s] = await Promise.all([api('/products'), api('/suppliers')]); products = p.data;
  $('sup').innerHTML = '<option value="">Select supplier</option>' + s.data.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join(''); load();
})();
