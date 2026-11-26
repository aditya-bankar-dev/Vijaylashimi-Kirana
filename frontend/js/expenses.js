Auth.require(['admin', 'manager']); Layout.init('expenses', 'Expenses');
const CATS = ['rent', 'electricity', 'salary', 'transport', 'maintenance', 'other']; let list = [];
const d = new Date(); $('from').value = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA'); $('to').value = d.toLocaleDateString('en-CA');
async function load() {
  list = (await api(`/expenses?from=${$('from').value}&to=${$('to').value}`)).data;
  const by = {}; list.forEach(x => (by[x.category] = (by[x.category] || 0) + Number(x.amount))); const total = round2(Object.values(by).reduce((a, b) => a + b, 0));
  $('sum').innerHTML = `<div class="col-md-3"><div class="cardx stat"><div class="ic"><i class="bi bi-wallet2"></i></div><div><div class="lb">Total expenses</div><div class="vl">${money(total)}</div></div></div></div>` +
    Object.entries(by).map(([k, v]) => `<div class="col-6 col-md-2"><div class="cardx py-2"><div class="small text-muted text-capitalize">${k}</div><div class="fw-bold">${money(v)}</div></div></div>`).join('');
  $('rows').innerHTML = list.map(x => `<tr><td>${esc(x.expense_date)}</td><td class="text-capitalize">${esc(x.category)}</td><td>${esc(x.description || '')}</td><td class="text-end">${money(x.amount)}</td>
    <td class="text-nowrap"><button class="btn btn-sm btn-outline-primary" data-e="${x.id}"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-outline-danger" data-d="${x.id}"><i class="bi bi-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted py-4">No expenses in this period</td></tr>';
}
function edit(x) {
  formModal({ title: x ? 'Edit expense' : 'Add expense', values: x || { expense_date: $('to').value }, fields: [{ key: 'category', label: 'Category', type: 'select', required: true, options: CATS }, { key: 'expense_date', label: 'Date', type: 'date', required: true },
    { key: 'amount', label: 'Amount (₹)', type: 'number', step: '0.01', min: 0, required: true }, { key: 'description', label: 'Description' }],
    onSubmit: async v => { if (!(Number(v.amount) > 0)) { toast('Amount must be greater than 0', 'error'); throw new Error(); }
      await api(x ? '/expenses/' + x.id : '/expenses', { method: x ? 'PUT' : 'POST', body: v }); toast('Expense saved', 'success'); load(); } });
}
$('add').onclick = () => edit(null); ['from', 'to'].forEach(i => ($(i).onchange = load));
$('rows').onclick = async e => { const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.e) edit(list.find(x => x.id == b.dataset.e));
  if (b.dataset.d && confirm('Delete this expense?')) { await api('/expenses/' + b.dataset.d, { method: 'DELETE' }); toast('Expense deleted', 'success'); load(); } };
load();
