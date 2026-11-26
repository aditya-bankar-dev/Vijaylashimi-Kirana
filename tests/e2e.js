// End-to-end API tests. Usage: BASE=http://localhost:5000 node tests/e2e.js  (run on a FRESH sample database)
const ExcelJS = require('exceljs');
const BASE = process.env.BASE || 'http://localhost:5000/api';
let pass = 0, fail = 0; const failures = [];
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; failures.push(name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } };
async function call(method, path, token, body) {
  const h = {}; if (token) h.Authorization = 'Bearer ' + token;
  let b; if (body instanceof FormData) b = body; else if (body) { h['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers: h, body: b });
  const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString()); } catch {}
  return { status: r.status, json, buf };
}
const login = async (e, p = 'Admin@123') => (await call('POST', '/auth/login', null, { email: e, password: p })).json?.token;
const fd = o => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.append(k, v)); return f; };
const today = () => new Date().toLocaleDateString('en-CA'), ymd = d => d.toLocaleDateString('en-CA');
const uid = () => 'k' + Math.random().toString(36).slice(2) + Date.now();

(async () => {
  // ---------- AUTH ----------
  const A = await login('admin@kirana.in'), M = await login('manager@kirana.in'), C = await login('cashier@kirana.in');
  ok('login admin/manager/cashier', A && M && C);
  ok('wrong password rejected', (await call('POST', '/auth/login', null, { email: 'admin@kirana.in', password: 'bad' })).status === 401);
  ok('unknown user rejected', (await call('POST', '/auth/login', null, { email: 'x@y.in', password: 'Admin@123' })).status === 401);
  ok('missing fields -> 400', (await call('POST', '/auth/login', null, {})).status === 400);
  ok('no token -> 401', (await call('GET', '/products')).status === 401);
  ok('garbage token -> 401', (await call('GET', '/products', 'abc.def.ghi')).status === 401);
  ok('/auth/me works', (await call('GET', '/auth/me', C)).json?.user?.role === 'cashier');

  // ---------- RBAC ----------
  const deny = async (n, m, p, t, b) => ok('RBAC: ' + n, (await call(m, p, t, b)).status === 403);
  await deny('cashier dashboard', 'GET', '/dashboard', C); await deny('cashier create product', 'POST', '/products', C, fd({ sku: 'Z' }));
  await deny('cashier users list', 'GET', '/users', C); await deny('cashier reports', 'GET', '/reports/sales', C); await deny('cashier purchases', 'GET', '/purchases', C);
  await deny('cashier delete customer', 'DELETE', '/customers/1', C); await deny('cashier inventory move', 'POST', '/inventory/move', C, {});
  await deny('manager users list', 'GET', '/users', M); await deny('manager update settings', 'PUT', '/settings', M, { store_name: 'x' }); await deny('manager backup', 'POST', '/backup/run', M);
  ok('manager can open dashboard', (await call('GET', '/dashboard', M)).status === 200);

  // ---------- PRODUCTS ----------
  const sku = 'T' + Date.now();
  let r = await call('POST', '/products', M, fd({ sku, name: 'Test Biscuit', barcode: 'BC' + sku, category_id: 5, unit: 'packet', purchase_price: 8, selling_price: 10, mrp: 10, gst_rate: 18, quantity: 50, reorder_level: 10 }));
  ok('create product', r.status === 201, r.json); const P1 = r.json?.id;
  ok('opening stock logged', (await call('GET', '/inventory/movements?product_id=' + P1, M)).json?.data?.[0]?.type === 'stock_in');
  ok('duplicate sku -> 409', (await call('POST', '/products', M, fd({ sku, name: 'Dup', category_id: 5, purchase_price: 1, selling_price: 2, mrp: 2 }))).status === 409);
  ok('selling > mrp -> 400', (await call('POST', '/products', M, fd({ sku: sku + 'x', name: 'Bad', category_id: 5, purchase_price: 1, selling_price: 5, mrp: 2 }))).status === 400);
  ok('invalid GST slab -> 400', (await call('POST', '/products', M, fd({ sku: sku + 'g', name: 'Bad', category_id: 5, purchase_price: 1, selling_price: 2, mrp: 2, gst_rate: 7 }))).status === 400);
  ok('missing fields -> 400', (await call('POST', '/products', M, fd({ name: 'x' }))).status === 400);
  ok('bad category FK -> 400', (await call('POST', '/products', M, fd({ sku: sku + 'c', name: 'x', category_id: 999, purchase_price: 1, selling_price: 2, mrp: 2 }))).status === 400);
  ok('barcode lookup', (await call('GET', '/products/barcode/BC' + sku, C)).json?.data?.id === P1);
  ok('barcode 404', (await call('GET', '/products/barcode/NOPE', C)).status === 404);
  ok('search by name', (await call('GET', '/products?q=Test%20Bisc', C)).json?.data?.some(p => p.id === P1));
  ok('SQL injection in search is harmless', (await call('GET', "/products?q=" + encodeURIComponent("' OR 1=1; DROP TABLE products;--"), C)).status === 200);
  ok('products table survived', (await call('GET', '/products', C)).json?.data?.length > 5);
  ok('update product', (await call('PUT', '/products/' + P1, M, fd({ selling_price: 9.5 }))).status === 200);
  ok('update persisted', (await call('GET', '/products?q=Test%20Bisc', C)).json.data[0].selling_price === 9.5);
  ok('update selling > existing mrp is blocked or ok-handled', [200, 400].includes((await call('PUT', '/products/' + P1, M, fd({ selling_price: 50 }))).status));
  await call('PUT', '/products/' + P1, M, fd({ selling_price: 10 }));
  const al = (await call('GET', '/products/alerts', C)).json; ok('alerts: low stock lists seeded low items', al.lowStock.some(x => x.name.includes('Turmeric')) && Array.isArray(al.expiring));
  r = await call('POST', '/products', M, fd({ sku: sku + 'd', name: 'Delete Me', category_id: 5, purchase_price: 1, selling_price: 2, mrp: 2 }));
  r = await call('DELETE', '/products/' + r.json.id, M); ok('unused product hard-deleted', r.json?.deactivated === false);

  // ---------- BILLING ----------
  const sale = (items, payments, extra = {}, token = C) => call('POST', '/sales', token, { idempotency_key: uid(), items, payments, ...extra });
  const stockOf = async id => (await call('GET', '/products?q=' + id, A)).json && (await call('GET', '/products', A)).json.data.find(p => p.id === id)?.quantity;
  const oil0 = await stockOf(3);
  r = await sale([{ product_id: 3, quantity: 2 }], [{ method: 'cash', amount: 300 }]);
  ok('sale ok', r.status === 201, r.json); ok('invoice format', /^INV-\d{8}-\d{6}$/.test(r.json?.invoice_no || ''), r.json?.invoice_no);
  ok('grand total 290', r.json?.grand_total === 290); ok('change 10', r.json?.change === 10);
  ok('stock reduced by 2', (await stockOf(3)) === oil0 - 2);
  const s1 = (await call('GET', '/sales/' + r.json.id, C)).json.data;
  ok('GST extracted from inclusive price (5% of 290)', Math.abs(s1.gst_amount - 13.81) < 0.02, s1.gst_amount); ok('sale_items snapshot cost', s1.items[0].purchase_price === 130);
  ok('sale movement logged', (await call('GET', '/inventory/movements?product_id=3&type=sale', A)).json.data.length >= 1);
  const key = uid(); const a = await call('POST', '/sales', C, { idempotency_key: key, items: [{ product_id: 3, quantity: 1 }], payments: [{ method: 'cash', amount: 145 }] });
  const b = await call('POST', '/sales', C, { idempotency_key: key, items: [{ product_id: 3, quantity: 1 }], payments: [{ method: 'cash', amount: 145 }] });
  ok('duplicate key returns same sale', b.json?.duplicate === true && b.json.id === a.json.id); ok('duplicate did not deduct twice', (await stockOf(3)) === oil0 - 3);
  ok('oversell -> 409', (await sale([{ product_id: 3, quantity: 99999 }], [{ method: 'cash', amount: 1e7 }])).status === 409);
  ok('payment short -> 400', (await sale([{ product_id: 3, quantity: 1 }], [{ method: 'cash', amount: 10 }])).status === 400);
  ok('zero/negative qty -> 400', (await sale([{ product_id: 3, quantity: 0 }], [{ method: 'cash', amount: 10 }])).status === 400 && (await sale([{ product_id: 3, quantity: -2 }], [{ method: 'cash', amount: 10 }])).status === 400);
  ok('empty cart -> 400', (await sale([], [{ method: 'cash', amount: 10 }])).status === 400);
  ok('unknown product -> 400', (await sale([{ product_id: 99999, quantity: 1 }], [{ method: 'cash', amount: 10 }])).status === 400);
  ok('bad payment method -> 400', (await sale([{ product_id: 3, quantity: 1 }], [{ method: 'crypto', amount: 500 }])).status === 400);
  ok('UPI over total -> 400', (await sale([{ product_id: 3, quantity: 1 }], [{ method: 'upi', amount: 500 }])).status === 400);
  r = await sale([{ product_id: 3, quantity: 2 }], [{ method: 'upi', amount: 100 }, { method: 'card', amount: 90 }, { method: 'cash', amount: 100 }], { discount_amount: 20 });
  ok('split payment + discount', r.status === 201 && r.json.grand_total === 270 && r.json.change === 20, r.json);
  ok('discount > subtotal -> 400', (await sale([{ product_id: 3, quantity: 1 }], [{ method: 'cash', amount: 999 }], { discount_amount: 9999 })).status === 400);
  ok('same product twice in cart merged', (await sale([{ product_id: 3, quantity: 1 }, { product_id: 3, quantity: 1 }], [{ method: 'cash', amount: 290 }])).json?.grand_total === 290);
  // expired product
  const ex = (await call('POST', '/products', M, fd({ sku: sku + 'e', name: 'Expired Milk', category_id: 4, purchase_price: 10, selling_price: 12, mrp: 12, quantity: 10, expiry_date: ymd(new Date(Date.now() - 864e5 * 2)) }))).json.id;
  ok('expired product cannot be sold', (await sale([{ product_id: ex, quantity: 1 }], [{ method: 'cash', amount: 12 }])).status === 409);
  // loyalty
  const c0 = (await call('GET', '/customers/2', A)).json.data;
  r = await sale([{ product_id: 3, quantity: 4 }], [{ method: 'cash', amount: 580 }], { customer_id: 2 });
  const c1 = (await call('GET', '/customers/2', A)).json.data;
  ok('customer total_spent updated', Math.abs(c1.total_spent - c0.total_spent - 580) < 0.01); ok('loyalty points +5', c1.loyalty_points === c0.loyalty_points + 5, [c0.loyalty_points, c1.loyalty_points]);
  ok('customer sale history filter', (await call('GET', '/sales?customer_id=2', C)).json.data.length >= 1);
  // concurrency: 5 units, 12 parallel single-unit sales -> exactly 5 succeed
  const cp = (await call('POST', '/products', M, fd({ sku: sku + 'r', name: 'Race Item', category_id: 5, purchase_price: 5, selling_price: 10, mrp: 10, quantity: 5 }))).json.id;
  const res = await Promise.all(Array.from({ length: 12 }, () => sale([{ product_id: cp, quantity: 1 }], [{ method: 'cash', amount: 10 }])));
  ok('concurrency: exactly 5 of 12 succeed', res.filter(x => x.status === 201).length === 5, res.map(x => x.status).join(','));
  ok('concurrency: stock never negative (=0)', (await stockOf(cp)) === 0);
  // same idempotency key fired in parallel
  const k2 = uid(); const par = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/sales', C, { idempotency_key: k2, items: [{ product_id: 1, quantity: 1 }], payments: [{ method: 'cash', amount: 110 }] })));
  const created = par.filter(x => x.status === 201 && !x.json.duplicate).length;
  ok('parallel same key creates exactly one sale', created === 1 && par.every(x => [200, 201, 409].includes(x.status)), par.map(x => x.status + ':' + (x.json?.message || x.json?.duplicate)).join(' | '));
  // PDFs and QR
  const sid = s1.id;
  ok('thermal PDF', (await call('GET', `/sales/${sid}/pdf?format=thermal`, C)).buf.slice(0, 4).toString() === '%PDF'); ok('A4 PDF', (await call('GET', `/sales/${sid}/pdf?format=a4`, C)).buf.slice(0, 4).toString() === '%PDF');
  ok('PDF 404 for unknown sale', (await call('GET', '/sales/999999/pdf', C)).status === 404);
  const qr = await call('GET', '/payments/upi-qr?amount=250', C); ok('UPI QR', qr.json?.uri?.startsWith('upi://pay?pa=') && qr.json.qr.startsWith('data:image/png'));
  ok('UPI QR invalid amount -> 400', (await call('GET', '/payments/upi-qr?amount=-5', C)).status === 400);
  ok('cashier sees only own sales', (await call('GET', '/sales', C)).json.data.every(s => s.cashier_id === 3));

  // ---------- INVENTORY ----------
  ok('stock_in', (await call('POST', '/inventory/move', M, { product_id: P1, type: 'stock_in', quantity: 10, note: 't' })).json?.balance === 60);
  ok('stock_out beyond stock -> 409', (await call('POST', '/inventory/move', M, { product_id: P1, type: 'stock_out', quantity: 1000 })).status === 409);
  ok('damaged', (await call('POST', '/inventory/move', M, { product_id: P1, type: 'damaged', quantity: 5 })).json?.balance === 55);
  ok('adjustment sets exact', (await call('POST', '/inventory/move', M, { product_id: P1, type: 'adjustment', quantity: 40 })).json?.balance === 40);
  ok('invalid type -> 400', (await call('POST', '/inventory/move', M, { product_id: P1, type: 'magic', quantity: 1 })).status === 400);
  ok('zero stock_in -> 400', (await call('POST', '/inventory/move', M, { product_id: P1, type: 'stock_in', quantity: 0 })).status === 400);
  const val = (await call('GET', '/inventory/valuation', M)).json.data; ok('valuation numbers', val.cost_value > 0 && val.retail_value >= val.cost_value);
  ok('delete product with history -> deactivated', (await call('DELETE', '/products/' + cp, M)).json?.deactivated === true);

  // ---------- PURCHASES / SUPPLIERS ----------
  const so0 = (await call('GET', '/suppliers/1', M)).json.data.outstanding_balance, st0 = await stockOf(1);
  r = await call('POST', '/purchases', M, { supplier_id: 1, purchase_date: today(), supplier_invoice_no: 'SI-1', items: [{ product_id: 1, quantity: 20, unit_price: 100, gst_rate: 5, batch_no: 'B' + Date.now() }] });
  ok('create draft purchase', r.status === 201, r.json); const PO = r.json.id;
  const po = (await call('GET', '/purchases/' + PO, M)).json.data; ok('draft totals (2000 + 100 GST)', po.total === 2100 && po.status === 'draft' && /^PO-\d{6}$/.test(po.purchase_no), po);
  ok('draft does not change stock', (await stockOf(1)) === st0);
  ok('confirm purchase', (await call('POST', `/purchases/${PO}/confirm`, M)).status === 200); ok('stock increased by 20', (await stockOf(1)) === st0 + 20);
  ok('supplier outstanding +2100', (await call('GET', '/suppliers/1', M)).json.data.outstanding_balance === so0 + 2100);
  ok('double confirm -> 409', (await call('POST', `/purchases/${PO}/confirm`, M)).status === 409);
  ok('cannot cancel confirmed', (await call('POST', `/purchases/${PO}/cancel`, M)).status === 409);
  ok('partial payment', (await call('POST', '/supplier-payments', M, { supplier_id: 1, purchase_id: PO, amount: 1000, method: 'upi', reference: 'UTR1' })).status === 201);
  ok('status partial', (await call('GET', '/purchases/' + PO, M)).json.data.payment_status === 'partial');
  ok('overpay purchase -> 400', (await call('POST', '/supplier-payments', M, { supplier_id: 1, purchase_id: PO, amount: 5000, method: 'cash' })).status === 400);
  ok('final payment -> paid', (await call('POST', '/supplier-payments', M, { supplier_id: 1, purchase_id: PO, amount: 1100, method: 'cash' })).status === 201 && (await call('GET', '/purchases/' + PO, M)).json.data.payment_status === 'paid');
  ok('outstanding back to start', (await call('GET', '/suppliers/1', M)).json.data.outstanding_balance === so0);
  const h = (await call('GET', '/suppliers/1/history', M)).json; ok('supplier history', h.purchases.length >= 1 && h.payments.length >= 2);
  ok('purchase empty items -> 400', (await call('POST', '/purchases', M, { supplier_id: 1, purchase_date: today(), items: [] })).status === 400);
  ok('purchase negative qty -> 400', (await call('POST', '/purchases', M, { supplier_id: 1, purchase_date: today(), items: [{ product_id: 1, quantity: -1, unit_price: 5 }] })).status === 400);
  r = await call('POST', '/purchases', M, { supplier_id: 2, purchase_date: today(), confirm: true, paid_amount: 500, payment_method: 'cash', items: [{ product_id: 2, quantity: 10, unit_price: 120, gst_rate: 0 }] });
  ok('create+confirm+pay in one go', r.status === 201, r.json); const p2 = (await call('GET', '/purchases/' + r.json.id, M)).json.data; ok('partial after upfront payment', p2.paid_amount === 500 && p2.payment_status === 'partial', p2);
  r = await call('POST', '/purchases', M, { supplier_id: 2, purchase_date: today(), items: [{ product_id: 2, quantity: 1, unit_price: 1 }] }); ok('cancel draft', (await call('POST', `/purchases/${r.json.id}/cancel`, M)).status === 200);
  ok('failed upfront payment rolls back whole purchase', await (async () => { const before = (await call('GET', '/purchases', M)).json.data.length; const x = await call('POST', '/purchases', M, { supplier_id: 2, purchase_date: today(), confirm: true, paid_amount: 99999, items: [{ product_id: 2, quantity: 1, unit_price: 10 }] }); return x.status === 400 && (await call('GET', '/purchases', M)).json.data.length === before; })());
  // supplier CRUD
  r = await call('POST', '/suppliers', M, { name: 'Temp Supplier', phone: '9876543210' }); ok('supplier create', r.status === 201);
  ok('supplier update', (await call('PUT', '/suppliers/' + r.json.id, M, { contact_person: 'Raj' })).status === 200); ok('supplier soft delete', (await call('DELETE', '/suppliers/' + r.json.id, M)).status === 200);
  ok('deleted supplier hidden', !(await call('GET', '/suppliers', M)).json.data.some(s => s.id === r.json.id));
  ok('supplier missing phone -> 400', (await call('POST', '/suppliers', M, { name: 'x' })).status === 400);

  // ---------- CUSTOMERS / EXPENSES ----------
  const mob = '9' + String(Date.now()).slice(-9); r = await call('POST', '/customers', C, { name: 'New Cust', mobile: mob }); ok('cashier can register customer', r.status === 201);
  ok('duplicate mobile -> 409', (await call('POST', '/customers', C, { name: 'Dup', mobile: mob })).status === 409);
  ok('customer search', (await call('GET', '/customers?q=' + mob, C)).json.data.length === 1); ok('manager deletes customer', (await call('DELETE', '/customers/' + r.json.id, M)).status === 200);
  r = await call('POST', '/expenses', M, { category: 'rent', description: 'Test', amount: 1000, expense_date: today() }); ok('expense create', r.status === 201, r.json);
  ok('expense bad category -> 400', (await call('POST', '/expenses', M, { category: 'party', amount: 5, expense_date: today() })).status === 400);
  ok('bad date -> 400', (await call('POST', '/expenses', M, { category: 'rent', amount: 5, expense_date: 'not-a-date' })).status === 400);
  ok('too-long name -> 400', (await call('POST', '/suppliers', M, { name: 'x'.repeat(500), phone: '9876543210' })).status === 400);
  ok('expense zero amount -> 4xx', (await call('POST', '/expenses', M, { category: 'rent', amount: 0, expense_date: today() })).status >= 400);
  ok('expense filter', (await call('GET', `/expenses?from=${today()}&to=${today()}`, M)).json.data.some(e => e.id === r.json.id));
  ok('expense update+delete', (await call('PUT', '/expenses/' + r.json.id, M, { amount: 1200 })).status === 200 && (await call('DELETE', '/expenses/' + r.json.id, M)).status === 200);

  // ---------- DASHBOARD / REPORTS ----------
  const d = (await call('GET', '/dashboard', A)).json.data;
  ok('dashboard has all stats', ['todaySales', 'totalRevenue', 'totalPurchases', 'totalExpenses', 'estimatedProfit', 'products', 'customers', 'lowStock', 'expired'].every(k => typeof d[k] === 'number'), d);
  ok('dashboard charts', d.charts.daily.length >= 1 && d.charts.topProducts.length >= 1 && Array.isArray(d.charts.monthly));
  const rep = async (t, q = '') => (await call('GET', `/reports/${t}?from=${ymd(new Date(Date.now() - 30 * 864e5))}&to=${today()}${q}`, M));
  for (const t of ['sales', 'profit-loss', 'product-sales', 'category-sales', 'gst', 'purchases', 'inventory', 'expenses']) { const x = await rep(t); ok('report json: ' + t, x.status === 200 && x.json.success && Array.isArray(x.json.data), x.json?.message); }
  for (const p of ['daily', 'weekly', 'monthly', 'annual']) ok('sales period ' + p, (await rep('sales', '&period=' + p)).status === 200);
  ok('invalid period -> 400', (await rep('sales', '&period=hourly')).status === 400); ok('unknown report -> 404', (await rep('nope')).status === 404);
  ok('report xlsx', (await rep('gst', '&format=xlsx')).buf.slice(0, 2).toString() === 'PK'); ok('report pdf', (await rep('profit-loss', '&format=pdf')).buf.slice(0, 4).toString() === '%PDF');
  const pl = (await rep('profit-loss')).json.data; ok('P&L has net profit row', pl[pl.length - 1].item.startsWith('Net profit'));
  const g = (await rep('gst')).json.data; ok('GST report has output rows', g.some(x => x.type.startsWith('Output')));
  const sr = (await rep('sales', '&period=annual')).json.data; const totalSales = (await call('GET', '/sales', A)).json.data.reduce((s, x) => s + x.grand_total, 0);
  ok('annual sales report total matches sales list', Math.abs(sr.reduce((s, x) => s + Number(x.total), 0) - totalSales) < 0.5, [sr, totalSales]);

  // ---------- EXCEL IMPORT/EXPORT ----------
  const ex1 = await call('GET', '/products/export', M); ok('export xlsx', ex1.buf.slice(0, 2).toString() === 'PK');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(ex1.buf); ok('export has header+rows', wb.worksheets[0].rowCount > 5 && wb.worksheets[0].getRow(1).values.includes('sku'));
  const wb2 = new ExcelJS.Workbook(), ws = wb2.addWorksheet('P'); ws.addRow(['sku', 'name', 'barcode', 'category', 'brand', 'unit', 'purchase_price', 'selling_price', 'mrp', 'gst_rate', 'quantity', 'reorder_level', 'expiry_date']);
  const isku = 'IMP' + Date.now(); ws.addRow([isku, 'Imported Item', 'IB' + isku, 'Brand New Category', 'X', 'kg', 20, 25, 30, 5, 12, 5, new Date('2027-12-31')]);
  ws.addRow(['BAD' + isku, 'Bad Row', '', 'Spices', '', 'piece', 50, 100, 60, 5, 1, 5, '']); ws.addRow(['Sku2' + isku, 'Bad Unit', '', 'Spices', '', 'bucket', 5, 6, 7, 5, 1, 5, '']);
  const f = new FormData(); f.append('file', new Blob([await wb2.xlsx.writeBuffer()]), 'p.xlsx'); r = await call('POST', '/products/import', M, f);
  ok('import: 1 added, 2 rows skipped', r.json?.added === 1 && r.json.errors.length === 2, r.json);
  const ip = (await call('GET', '/products?q=' + isku, M)).json.data[0]; ok('imported product saved correctly', ip && ip.quantity === 12 && ip.expiry_date === '2027-12-31' && ip.unit === 'kg', ip);
  const f2 = new FormData(); f2.append('file', new Blob([await wb2.xlsx.writeBuffer()]), 'p.xlsx'); r = await call('POST', '/products/import', M, f2); ok('re-import updates, not duplicates', r.json?.updated === 1 && r.json.added === 0, r.json);
  ok('import without file -> 400', (await call('POST', '/products/import', M, new FormData())).status === 400);

  // ---------- SETTINGS / USERS ----------
  ok('settings readable by cashier', (await call('GET', '/settings', C)).json.data.store_name);
  ok('admin updates settings', (await call('PUT', '/settings', A, { store_name: 'Test Store X' })).status === 200);
  ok('settings reflected in receipt flow', (await call('GET', '/settings', C)).json.data.store_name === 'Test Store X'); await call('PUT', '/settings', A, { store_name: 'Shree Kirana & Supermarket' });
  const em = `u${Date.now()}@t.in`; r = await call('POST', '/users', A, { name: 'Temp', email: em, password: 'Passw0rd!', role: 'cashier' }); ok('create user', r.status === 201, r.json);
  ok('new user can login', !!(await login(em, 'Passw0rd!'))); ok('short password -> 400', (await call('POST', '/users', A, { name: 'x', email: 'a' + em, password: '123', role: 'cashier' })).status === 400);
  ok('invalid role -> 400', (await call('POST', '/users', A, { name: 'x', email: 'b' + em, password: 'Passw0rd!', role: 'god' })).status === 400); ok('duplicate email -> 409', (await call('POST', '/users', A, { name: 'x', email: em, password: 'Passw0rd!', role: 'cashier' })).status === 409);
  ok('disable user', (await call('PUT', '/users/' + r.json.id, A, { is_active: false })).status === 200); ok('disabled user cannot login', !(await login(em, 'Passw0rd!')));
  ok('admin cannot deactivate self', (await call('PUT', '/users/1', A, { is_active: false })).status === 400);
  ok('password hash never exposed', !JSON.stringify((await call('GET', '/users', A)).json).includes('password'));
  ok('audit log written for sales/logins', await (async () => {
    const { execFileSync } = require('child_process');
    const mysqlUser = process.env.MYSQL_USER || process.env.DB_USER || 'root';
    const mysqlPassword = process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD ?? '';
    const query = "SELECT COUNT(*) FROM grocery_db.audit_logs WHERE action IN ('create_sale','login','create_user')";
    const output = execFileSync('mysql', ['-u', mysqlUser, '-N', '-e', query], {
      env: { ...process.env, MYSQL_PWD: mysqlPassword }, stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();
    return Number(output) > 10;
  })());

  // ---------- BACKUP / STATIC / MISC ----------
  r = await call('POST', '/backup/run', A); ok('backup run', r.status === 200 && r.json?.file, r.json);
  for (const pg of ['index', 'login', 'dashboard', 'billing', 'products', 'inventory', 'purchases', 'suppliers', 'customers', 'expenses', 'reports', 'settings']) ok('page ' + pg, (await fetch(BASE.replace('/api', '') + `/${pg}.html`)).status === 200);
  ok('unknown api route -> 404 JSON', (await call('GET', '/nothing', A)).status === 404);
  ok('malformed JSON -> 4xx not 500', await (async () => { const x = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }); return x.status >= 400 && x.status < 500; })());
  console.log(`\nPASS ${pass}  FAIL ${fail}`); failures.forEach(f => console.log(' ✗ ' + f)); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
