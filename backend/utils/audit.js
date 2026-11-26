const db = require('../config/db');
module.exports = (req, action, entity, entityId, details, conn = db) =>
  conn.execute('INSERT INTO audit_logs(user_id,action,entity,entity_id,details,ip_address) VALUES (?,?,?,?,?,?)',
    [req.user?.id || null, action, entity, entityId || null, JSON.stringify(details || {}), req.ip]).catch(() => {});
