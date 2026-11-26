const PDFDocument = require('pdfkit'), QRCode = require('qrcode');
const db = require('../config/db');
const { AppError, asyncHandler } = require('../utils/helpers');
const settings = async () => Object.fromEntries((await db.query('SELECT setting_key k, setting_value v FROM store_settings'))[0].map(r => [r.k, r.v]));
const inr = n => 'Rs. ' + Number(n).toFixed(2);   // PDF core fonts lack the ₹ glyph

exports.upiQr = asyncHandler(async (req, res) => {
  const amount = Number(req.query.amount), st = await settings();
  if (!(amount > 0)) throw new AppError('Valid amount required');
  const uri = `upi://pay?pa=${encodeURIComponent(st.upi_id)}&pn=${encodeURIComponent(st.store_name)}&am=${amount.toFixed(2)}&cu=INR`;
  res.json({ success: true, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 260 }) });
});

// GET /api/sales/:id/pdf?format=thermal|a4
exports.pdf = asyncHandler(async (req, res) => {
  const [[s]] = await db.execute('SELECT s.*, c.name customer_name, u.name cashier_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.cashier_id WHERE s.id=?', [req.params.id]);
  if (!s) throw new AppError('Sale not found', 404);
  const [items] = await db.execute('SELECT si.*, p.name FROM sale_items si JOIN products p ON p.id=si.product_id WHERE sale_id=?', [s.id]);
  const [pays] = await db.execute('SELECT method,amount FROM payments WHERE sale_id=?', [s.id]);
  const st = await settings(), thermal = req.query.format !== 'a4';
  const W = thermal ? Math.round(Number(st.receipt_width_mm || 80) * 2.835) : 595, M = thermal ? 8 : 40, cw = W - 2 * M;
  const doc = new PDFDocument({ size: thermal ? [W, 200 + items.length * 30 + 200] : 'A4', margin: M });
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${s.invoice_no}.pdf"`);
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(thermal ? 11 : 18).text(st.store_name, { align: 'center' });
  doc.font('Helvetica').fontSize(thermal ? 7 : 9).text(`${st.store_address}\nPh: ${st.store_phone}  GSTIN: ${st.store_gstin}`, { align: 'center' }).moveDown(.5);
  doc.text(`Invoice: ${s.invoice_no}\nDate: ${new Date(s.created_at).toLocaleString('en-IN')}\nCashier: ${s.cashier_name}${s.customer_name ? '\nCustomer: ' + s.customer_name : ''}`).moveDown(.5);
  const line = () => doc.moveTo(M, doc.y).lineTo(M + cw, doc.y).dash(1, { space: 2 }).stroke().undash().moveDown(.3);
  const row = (a, b, c, d, bold) => { const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(a, M, y, { width: cw * .45 }); doc.text(b, M + cw * .45, y, { width: cw * .15, align: 'right' }); doc.text(c, M + cw * .6, y, { width: cw * .18, align: 'right' }); doc.text(d, M + cw * .78, y, { width: cw * .22, align: 'right' }); doc.y = Math.max(doc.y, y + 11); };
  line(); row('Item', 'Qty', 'Rate', 'Amount', true); line();
  items.forEach(i => row(i.name, i.quantity, Number(i.unit_price).toFixed(2), Number(i.line_total).toFixed(2)));
  line();
  const tot = (k, v, b) => { doc.font(b ? 'Helvetica-Bold' : 'Helvetica').text(`${k}: ${v}`, M, doc.y, { width: cw, align: 'right' }); };
  tot('Subtotal', inr(s.subtotal)); if (s.discount_amount > 0) tot('Discount', '-' + inr(s.discount_amount));
  tot('GST included', inr(s.gst_amount)); tot('GRAND TOTAL', inr(s.grand_total), true);
  pays.forEach(p => tot(p.method.toUpperCase(), inr(p.amount))); if (s.change_amount > 0) tot('Change', inr(s.change_amount));
  doc.moveDown().text('Thank you! Visit again.', M, doc.y, { width: cw, align: 'center' });
  doc.end();
});
