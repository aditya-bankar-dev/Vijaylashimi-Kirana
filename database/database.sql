-- Grocery Store Management System | MySQL 8
CREATE DATABASE IF NOT EXISTS grocery_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE grocery_db;
SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE roles (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(30) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  role_id TINYINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  phone VARCHAR(15),
  password_hash VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL UNIQUE,
  default_gst DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE suppliers (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  contact_person VARCHAR(100),
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(120),
  address VARCHAR(255),
  gstin VARCHAR(15),
  outstanding_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sup_name (name)
) ENGINE=InnoDB;

CREATE TABLE products (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sku VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  barcode VARCHAR(50) UNIQUE,
  category_id INT UNSIGNED NOT NULL,
  brand VARCHAR(80),
  unit ENUM('kg','gram','litre','ml','packet','piece','dozen') NOT NULL DEFAULT 'piece',
  purchase_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  mrp DECIMAL(10,2) NOT NULL,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  reorder_level DECIMAL(12,3) NOT NULL DEFAULT 10,
  expiry_date DATE NULL,
  supplier_id INT UNSIGNED NULL,
  image_path VARCHAR(255),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_price CHECK (selling_price >= 0 AND purchase_price >= 0 AND mrp >= selling_price),
  CONSTRAINT chk_qty CHECK (quantity >= 0),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  INDEX idx_prod_name (name), INDEX idx_prod_cat (category_id), INDEX idx_prod_expiry (expiry_date)
) ENGINE=InnoDB;

CREATE TABLE product_batches (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  batch_no VARCHAR(40) NOT NULL,
  expiry_date DATE NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  purchase_price DECIMAL(10,2) NOT NULL,
  received_on DATE NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY uq_batch (product_id, batch_no),
  INDEX idx_batch_expiry (expiry_date)
) ENGINE=InnoDB;

CREATE TABLE purchases (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  purchase_no VARCHAR(30) NOT NULL UNIQUE,
  supplier_id INT UNSIGNED NOT NULL,
  supplier_invoice_no VARCHAR(50),
  purchase_date DATE NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_status ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
  status ENUM('draft','confirmed','cancelled') NOT NULL DEFAULT 'draft',
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_pur_date (purchase_date)
) ENGINE=InnoDB;

CREATE TABLE purchase_items (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  purchase_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  gst_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  batch_no VARCHAR(40),
  expiry_date DATE NULL,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE supplier_payments (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  supplier_id INT UNSIGNED NOT NULL,
  purchase_id INT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  method ENUM('cash','upi','card','bank') NOT NULL,
  reference VARCHAR(80),
  paid_on DATE NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE customers (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  mobile VARCHAR(15) NOT NULL UNIQUE,
  email VARCHAR(120),
  address VARCHAR(255),
  loyalty_points INT UNSIGNED NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  total_spent DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE sales (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  invoice_no VARCHAR(30) NOT NULL UNIQUE,
  idempotency_key VARCHAR(64) NOT NULL UNIQUE,  -- prevents duplicate billing
  customer_id INT UNSIGNED NULL,
  cashier_id INT UNSIGNED NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  gst_amount DECIMAL(12,2) NOT NULL,
  grand_total DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL,
  change_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('completed','cancelled','refunded') NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (cashier_id) REFERENCES users(id),
  INDEX idx_sales_date (created_at)
) ENGINE=InnoDB;

CREATE TABLE sale_items (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sale_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,
  purchase_price DECIMAL(10,2) NOT NULL,   -- snapshot for profit calc
  gst_rate DECIMAL(5,2) NOT NULL,
  gst_amount DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_si_product (product_id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sale_id INT UNSIGNED NOT NULL,
  method ENUM('cash','upi','card') NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  reference VARCHAR(80),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE expenses (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  category ENUM('rent','electricity','salary','transport','maintenance','other') NOT NULL,
  description VARCHAR(255),
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_exp_date (expense_date)
) ENGINE=InnoDB;

CREATE TABLE stock_movements (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  product_id INT UNSIGNED NOT NULL,
  type ENUM('purchase','sale','stock_in','stock_out','adjustment','damaged','expired','return') NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,          -- signed: + in, - out
  balance_after DECIMAL(12,3) NOT NULL,
  reference_type VARCHAR(30),
  reference_id INT UNSIGNED,
  note VARCHAR(255),
  created_by INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sm_product_date (product_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE store_settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value VARCHAR(500) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40),
  entity_id INT UNSIGNED,
  details JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_date (created_at)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS=1;
