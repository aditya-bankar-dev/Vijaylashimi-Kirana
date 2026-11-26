const bcrypt = require('bcrypt'), jwt = require('jsonwebtoken');
const db = require('../config/db');
const { AppError, asyncHandler, require_ } = require('../utils/helpers');
const audit = require('../utils/audit');

exports.login = asyncHandler(async (req, res) => {
  require_(req.body, ['email', 'password']);
  const [[u]] = await db.execute('SELECT u.*, r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=?', [req.body.email]);
  if (!u || !u.is_active || !(await bcrypt.compare(req.body.password, u.password_hash))) throw new AppError('Invalid email or password', 401);
  await db.execute('UPDATE users SET last_login=NOW() WHERE id=?', [u.id]);
  const token = jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  req.user = { id: u.id }; audit(req, 'login', 'user', u.id);
  res.json({ success: true, token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

exports.me = asyncHandler(async (req, res) => {
  const [[u]] = await db.execute('SELECT u.id,u.name,u.email,r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?', [req.user.id]);
  res.json({ success: true, user: u });
});

exports.listUsers = asyncHandler(async (req, res) => {
  const [rows] = await db.execute('SELECT u.id,u.name,u.email,u.phone,u.is_active,u.last_login,r.name role FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id');
  res.json({ success: true, data: rows });
});

exports.createUser = asyncHandler(async (req, res) => {
  require_(req.body, ['name', 'email', 'password', 'role']);
  if (req.body.password.length < 8) throw new AppError('Password must be at least 8 characters');
  const [[r]] = await db.execute('SELECT id FROM roles WHERE name=?', [req.body.role]);
  if (!r) throw new AppError('Invalid role');
  const hash = await bcrypt.hash(req.body.password, 10);
  const [ins] = await db.execute('INSERT INTO users(role_id,name,email,phone,password_hash) VALUES (?,?,?,?,?)',
    [r.id, req.body.name, req.body.email, req.body.phone || null, hash]);
  audit(req, 'create_user', 'user', ins.insertId);
  res.status(201).json({ success: true, id: ins.insertId });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const { name, phone, is_active, password, role } = req.body;
  if (Number(req.params.id) === req.user.id && is_active === false) throw new AppError('You cannot deactivate yourself');
  const sets = [], vals = [];
  if (name) { sets.push('name=?'); vals.push(name); }
  if (phone !== undefined) { sets.push('phone=?'); vals.push(phone); }
  if (is_active !== undefined) { sets.push('is_active=?'); vals.push(is_active ? 1 : 0); }
  if (password) { sets.push('password_hash=?'); vals.push(await bcrypt.hash(password, 10)); }
  if (role) { const [[r]] = await db.execute('SELECT id FROM roles WHERE name=?', [role]); if (!r) throw new AppError('Invalid role'); sets.push('role_id=?'); vals.push(r.id); }
  if (!sets.length) throw new AppError('Nothing to update');
  await db.execute(`UPDATE users SET ${sets.join(',')} WHERE id=?`, [...vals, req.params.id]);
  audit(req, 'update_user', 'user', req.params.id);
  res.json({ success: true });
});
