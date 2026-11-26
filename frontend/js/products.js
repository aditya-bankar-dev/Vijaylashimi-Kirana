Auth.require(['admin', 'manager', 'cashier']); Layout.init('products', 'Products');
const canEdit = ['admin', 'manager'].includes(Auth.user.role); let cats = [], sups = [], list = [];
document.querySelectorAll('.edit-only').forEach(e => (e.hidden = !canEdit));
const qs = new URLSearchParams(location.search); $('low').checked = qs.get('low') === '1'; $('exp').checked = qs.get('expiring') === '1';
const today = new Date().toLocaleDateString('en-CA'), days = d => Math.round((new Date(d) - new Date(today)) / 864e5);
const badge = (t, c) => `<span class="badge text-bg-${c}">${t}</span>`;

async function load() {
  const p = new URLSearchParams(); if ($('q').value.trim()) p.set('q', $('q').value.trim()); if ($('cat').value) p.set('category_id', $('cat').value);
  if ($('low').checked) p.set('low', 1); if ($('exp').checked) p.set('expiring', 1);
  list = (await api('/products?' + p)).data;
  $('rows').innerHTML = list.map(x => {
    const st = x.quantity <= 0 ? badge('Out', 'danger') : x.quantity <= x.reorder_level ? badge('Low', 'warning') : '';
    const ex = !x.expiry_date ? '-' : days(x.expiry_date) < 0 ? `${x.expiry_date} ${badge('Expired', 'danger')}` : days(x.expiry_date) <= 30 ? `${x.expiry_date} ${badge('Soon', 'warning')}` : x.expiry_date;
    return `<tr><td><div class="d-flex align-items-center gap-2">${x.image_path ? `<img src="${esc(x.image_path)}" width="36" height="36" class="rounded object-fit-cover">` : ''}<div><b>${esc(x.name)}</b><div class="small text-muted">${esc(x.sku)}${x.brand ? ' • ' + esc(x.brand) : ''}</div></div></div></td>
      <td>${esc(x.barcode || '-')}</td><td>${esc(x.category_name)}</td><td class="text-end">${money(x.selling_price)}<div class="small text-muted text-decoration-line-through">${money(x.mrp)}</div></td><td>${x.gst_rate}%</td>
      <td>${x.quantity} ${esc(x.unit)} ${st}</td><td>${ex}</td>
      <td class="edit-only text-nowrap" ${canEdit ? '' : 'hidden'}><button class="btn btn-sm btn-outline-primary" data-e="${x.id}"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-outline-danger" data-d="${x.id}"><i class="bi bi-trash"></i></button></td></tr>`;
  }).join('') || '<tr><td colspan="8" class="text-center text-muted py-4">No products found</td></tr>';
}
function fields(isNew) {
  const f = [{ key: 'sku', label: 'Product ID / SKU', required: true }, { key: 'name', label: 'Product name', required: true }, { key: 'barcode', label: 'Barcode' },
    { key: 'category_id', label: 'Category', type: 'select', required: true, placeholder: 'Select', options: cats.map(c => ({ v: c.id, l: c.name })) }, { key: 'brand', label: 'Brand' },
    { key: 'unit', label: 'Unit', type: 'select', default: 'piece', options: ['kg', 'gram', 'litre', 'ml', 'packet', 'piece', 'dozen'] },
    { key: 'purchase_price', label: 'Purchase price (₹)', type: 'number', step: '0.01', min: 0, required: true }, { key: 'selling_price', label: 'Selling price (₹, incl. GST)', type: 'number', step: '0.01', min: 0, required: true },
    { key: 'mrp', label: 'MRP (₹)', type: 'number', step: '0.01', min: 0, required: true }, { key: 'gst_rate', label: 'GST %', type: 'select', default: 0, options: [0, 3, 5, 12, 18, 28] }];
  if (isNew) f.push({ key: 'quantity', label: 'Opening quantity', type: 'number', step: '0.001', min: 0 });
  return f.concat([{ key: 'reorder_level', label: 'Low-stock alert level', type: 'number', step: '0.001', min: 0, default: 10 }, { key: 'expiry_date', label: 'Expiry date', type: 'date' },
    { key: 'supplier_id', label: 'Supplier', type: 'select', placeholder: 'None', options: sups.map(s => ({ v: s.id, l: s.name })) }, { key: 'image', label: 'Product image', type: 'file', accept: 'image/*' }]);
}
function edit(p) {
  formModal({ title: p ? 'Edit product' : 'Add product', size: 'modal-lg', fields: fields(!p), values: p || {}, onSubmit: async d => {
    if (Number(d.mrp) < Number(d.selling_price)) { toast('Selling price cannot exceed MRP', 'error'); throw new Error(); }
    const fd = new FormData(); Object.entries(d).forEach(([k, v]) => fd.append(k === 'image' ? 'image' : k, v));
    await api(p ? '/products/' + p.id : '/products', { method: p ? 'PUT' : 'POST', body: fd, spinner: true }); toast('Product saved', 'success'); load();
  } });
}
$('add').onclick = () => edit(null);
$('rows').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.e) edit(list.find(x => x.id == b.dataset.e));
  if (b.dataset.d && confirm('Delete this product? Products with sales history are deactivated instead.')) { const r = await api('/products/' + b.dataset.d, { method: 'DELETE' }); toast(r.deactivated ? 'Product deactivated (has history)' : 'Product deleted', 'success'); load(); }
};
$('q').oninput = debounce(load); ['cat', 'low', 'exp'].forEach(i => ($(i).onchange = load));
$('exb').onclick = () => download('/products/export', 'products.xlsx');
$('imp').onclick = () => $('file').click();
$('file').onchange = async e => {
  const fd = new FormData(); fd.append('file', e.target.files[0]); e.target.value = '';
  const r = await api('/products/import', { method: 'POST', body: fd, spinner: true });
  toast(`Imported: ${r.added} added, ${r.updated} updated${r.errors.length ? ', ' + r.errors.length + ' skipped' : ''}`, r.errors.length ? 'info' : 'success');
  if (r.errors.length) alert('Skipped rows:\n' + r.errors.slice(0, 15).join('\n')); load();
};
(async () => {
  [cats, sups] = (await Promise.all([api('/categories'), api('/suppliers')])).map(r => r.data);
  cats.forEach(c => $('cat').insertAdjacentHTML('beforeend', `<option value="${c.id}">${esc(c.name)}</option>`)); load();
})();
