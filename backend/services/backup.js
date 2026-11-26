const { execFile } = require('child_process'), fs = require('fs'), path = require('path'), cron = require('node-cron');
const dir = () => path.resolve(process.env.BACKUP_DIR || './backups');
function runBackup() {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(dir(), { recursive: true });
    const file = path.join(dir(), `grocery_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
    execFile('mysqldump', ['-h', process.env.DB_HOST, '-P', String(process.env.DB_PORT || 3306), '-u', process.env.DB_USER, '--single-transaction', '--routines', `--result-file=${file}`, process.env.DB_NAME],
      { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD } }, err => {
        if (err) return reject(new Error('Backup failed: ' + err.message));
        const cutoff = Date.now() - 14 * 864e5;                                   // keep 14 days
        fs.readdirSync(dir()).forEach(f => { const p = path.join(dir(), f); if (f.endsWith('.sql') && fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); });
        resolve(file);
      });
  });
}
const schedule = () => cron.schedule('0 2 * * *', () => runBackup().then(f => console.log('Backup saved:', f)).catch(e => console.error(e.message)));
module.exports = { runBackup, schedule };
