Auth.require(['admin', 'manager']); Layout.init('dashboard', 'Dashboard');
const charts = {};
const CARDS = [['todaySales', "Today's Sales", 'bi-currency-rupee', 1], ['totalRevenue', 'Total Revenue', 'bi-graph-up-arrow', 1], ['totalPurchases', 'Total Purchases', 'bi-cart-check', 1],
  ['totalExpenses', 'Total Expenses', 'bi-wallet2', 1], ['estimatedProfit', 'Estimated Profit', 'bi-piggy-bank', 1], ['products', 'Products', 'bi-box-seam', 0],
  ['customers', 'Customers', 'bi-people', 0], ['lowStock', 'Low Stock', 'bi-exclamation-triangle', 0, 'products.html?low=1'], ['expired', 'Expired Products', 'bi-calendar-x', 0, 'products.html?expiring=1']];
function draw(id, cfg) {
  if (charts[id]) charts[id].destroy();
  const css = getComputedStyle(document.documentElement);
  Chart.defaults.color = document.documentElement.dataset.bsTheme === 'dark' ? '#94a3b8' : '#64748b';
  charts[id] = new Chart($(id), cfg);
}
const day = v => String(v).slice(0, 10);
(async () => {
  const { data: d } = await api('/dashboard', { spinner: true });
  $('stats').innerHTML = CARDS.map(([k, l, ic, m, href]) => `<div class="col-6 col-md-4 col-xl-3"><${href ? 'a href="' + href + '" class="text-decoration-none text-reset"' : 'div'}>
    <div class="cardx stat"><div class="ic"><i class="bi ${ic}"></i></div><div><div class="lb">${l}</div><div class="vl">${m ? money(d[k]) : d[k]}</div></div></div></${href ? 'a' : 'div'}></div>`).join('');
  const c = d.charts, sets = {
    daily: [c.daily.map(x => day(x.d)), c.daily.map(x => x.total)],
    weekly: [c.weekly.map(x => day(x.start)), c.weekly.map(x => x.total)],
    monthly: [c.monthly.map(x => x.m), c.monthly.map(x => x.total)]
  };
  const trend = r => draw('trend', { type: 'line', data: { labels: sets[r][0], datasets: [{ label: 'Sales (₹)', data: sets[r][1], borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.15)', fill: true, tension: .35 }] }, options: { plugins: { legend: { display: false } } } });
  trend('daily');
  $('range').onclick = e => { const r = e.target.dataset.r; if (!r) return; [...$('range').children].forEach(b => b.classList.toggle('active', b === e.target)); trend(r); };
  draw('top', { type: 'doughnut', data: { labels: c.topProducts.map(x => x.name), datasets: [{ data: c.topProducts.map(x => x.qty), backgroundColor: ['#16a34a', '#0b1f3a', '#22c55e', '#1e40af', '#86efac'] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
  draw('rev', { type: 'bar', data: { labels: sets.monthly[0], datasets: [{ label: 'Revenue (₹)', data: sets.monthly[1], backgroundColor: '#0b1f3a', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } } } });
  $('themeToggle').addEventListener('click', () => setTimeout(() => location.reload(), 50));
})();
