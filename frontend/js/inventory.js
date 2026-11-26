Auth.require(['admin', 'manager']); Layout.init('inventory', 'Inventory');
async function valuation() {
  const { data: v } = await api('/inventory/valuation');
  $('val').innerHTML = [['Inventory value (cost)', money(v.cost_value), 'bi-coin'], ['Inventory value (retail)', money(v.retail_value), 'bi-tag'], ['Active products', v.products, 'bi-box-seam']]
    .map(([l, x, i]) => `<div class="col-md-4"><div class="cardx stat"><div class="ic"><i class="bi ${i}"></i></div><div><div class="lb">${l}</div><div class="vl">${x}</div></div></div></div>`).join('');
}
async function products() {
  const r = await api('/products'); $('prod').innerHTML = r.data.map(p => `<option value="${p.id}">${esc(p.name)} (stock ${p.quantity} ${esc(p.unit)})</option>`).join('');
}
async function alerts() {
  const r = await api('/products/alerts');
  $('alerts').innerHTML = (r.lowStock.map(x => `<div class="d-flex justify-content-between border-bottom py-1"><span>${esc(x.name)}</span><span class="text-danger">${x.quantity} / ${x.reorder_level} ${esc(x.unit)}</span></div>`).join('') || '<span class="text-muted">All stock levels are healthy</span>');
}
async function history() {
  const r = await api('/inventory/movements' + ($('ftype').value ? '?type=' + $('ftype').value : ''));
  const col = { sale: 'secondary', purchase: 'primary', stock_in: 'success', stock_out: 'warning', adjustment: 'info', damaged: 'danger', expired: 'danger' };
  $('rows').innerHTML = r.data.map(m => `<tr><td class="small">${esc(String(m.created_at).replace('T', ' ').slice(0, 16))}</td><td>${esc(m.product_name)}</td><td><span class="badge text-bg-${col[m.type] || 'secondary'}">${esc(m.type.replace('_', ' '))}</span></td>
    <td class="text-end ${m.quantity < 0 ? 'text-danger' : 'text-success'}">${m.quantity > 0 ? '+' : ''}${m.quantity}</td><td class="text-end">${m.balance_after}</td><td class="small text-muted">${esc(m.note || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-muted py-3">No movements</td></tr>';
}
$('type').onchange = () => ($('qlabel').textContent = $('type').value === 'adjustment' ? 'New exact stock quantity' : 'Quantity');
$('ftype').onchange = history;
$('go').onclick = async () => {
  const q = $('qty').value; if (q === '' || Number(q) < 0) return toast('Enter a valid quantity', 'error');
  const r = await api('/inventory/move', { method: 'POST', spinner: true, body: { product_id: $('prod').value, type: $('type').value, quantity: q, note: $('note').value } });
  toast(`Saved. New balance: ${r.balance}`, 'success'); $('qty').value = ''; $('note').value = ''; await Promise.all([products(), alerts(), history(), valuation()]);
};
valuation(); products(); alerts(); history();
