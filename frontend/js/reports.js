Auth.require(['admin', 'manager']); Layout.init('reports', 'Reports');
const TYPES = [['sales', 'Sales (daily/weekly/monthly/annual)'], ['profit-loss', 'Profit and loss'], ['product-sales', 'Product-wise sales'], ['category-sales', 'Category-wise sales'], ['gst', 'GST report'], ['purchases', 'Purchase report'], ['inventory', 'Inventory report'], ['expenses', 'Expense report']];
const MONEY = new Set(['subtotal', 'discount', 'gst', 'total', 'revenue', 'profit', 'amount', 'cost_value', 'retail_value', 'taxable_value', 'gst_amount', 'paid']);
$('type').innerHTML = TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
const ymd = d => d.toLocaleDateString('en-CA'), now = new Date();
const setRange = (a, b) => { $('from').value = ymd(a); $('to').value = ymd(b); };
setRange(new Date(now.getFullYear(), now.getMonth(), 1), now);
document.querySelector('.cardx .small').onclick = e => { e.preventDefault(); const r = e.target.dataset.r; if (r === undefined) return;
  setRange(r === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : r === 'year' ? new Date(now.getFullYear(), 0, 1) : new Date(now - r * 864e5), now); run(); };
$('type').onchange = () => { $('perWrap').hidden = $('type').value !== 'sales'; document.querySelectorAll('.dates').forEach(x => (x.hidden = $('type').value === 'inventory')); };
function qs(fmt) { const p = new URLSearchParams({ from: $('from').value, to: $('to').value }); if ($('type').value === 'sales') p.set('period', $('period').value); if (fmt) p.set('format', fmt); return `/reports/${$('type').value}?${p}`; }
async function run() {
  if ($('from').value > $('to').value) return toast('From date cannot be after To date', 'error');
  const r = await api(qs(), { spinner: true }); $('title').textContent = r.title;
  $('head').innerHTML = '<tr>' + r.columns.map(c => `<th class="${MONEY.has(c) ? 'text-end' : ''}">${esc(c.replace(/_/g, ' ').toUpperCase())}</th>`).join('') + '</tr>';
  $('body').innerHTML = r.data.map((row, i) => `<tr class="${$('type').value === 'profit-loss' && i === r.data.length - 1 ? 'fw-bold' : ''}">` + r.columns.map(c => `<td class="${MONEY.has(c) ? 'text-end' : ''}">${MONEY.has(c) ? money(row[c]) : esc(row[c] ?? '-')}</td>`).join('') + '</tr>').join('') || `<tr><td colspan="${r.columns.length}" class="text-center text-muted py-4">No data for this period</td></tr>`;
}
$('run').onclick = run; $('xl').onclick = () => download(qs('xlsx'), $('type').value + '.xlsx'); $('pdf').onclick = () => download(qs('pdf'), $('type').value + '.pdf'); $('type').onchange();
