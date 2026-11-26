const db = require('../config/db');
const { asyncHandler, AppError } = require('../utils/helpers');
const audit = require('../utils/audit');
exports.get = asyncHandler(async (req, res) => {
  const [rows] = await db.query('SELECT setting_key k, setting_value v FROM store_settings');
  res.json({ success: true, data: Object.fromEntries(rows.map(r => [r.k, r.v])) });
});
exports.update = asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body || {});
  if (!entries.length) throw new AppError('No settings provided');
  for (const [k, v] of entries) await db.execute('INSERT INTO store_settings(setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', [k, String(v)]);
  audit(req, 'update_settings', 'settings', null, { keys: entries.map(e => e[0]) });
  res.json({ success: true });
});
