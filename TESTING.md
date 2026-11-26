# Testing

Run the automated API suite against a **fresh test database** (reload `database/database.sql` and `database/sample_data.sql`) with the server running:

```bash
npm test
```

The default API URL is `http://localhost:5000/api`. Override it with `BASE`, for example:

```bash
# PowerShell
$env:BASE = "http://localhost:5000/api"
$env:MYSQL_USER = "root"
$env:MYSQL_PASSWORD = "your_mysql_password"
npm test
```

The audit-log assertion uses the MySQL CLI (`mysql`) and reads credentials from `MYSQL_USER` / `MYSQL_PASSWORD`, falling back to `DB_USER` / `DB_PASSWORD` and then `root` / an empty password.

The suite covers authentication, role permissions, products, billing (stock, GST, split payment, duplicate and parallel requests, overselling race), inventory, purchases, supplier payments, reports, Excel import/export, settings, users, and backup.
