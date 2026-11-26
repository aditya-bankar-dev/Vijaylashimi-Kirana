USE grocery_db;
INSERT INTO roles(name) VALUES ('admin'),('manager'),('cashier');
-- Password for all sample users: Admin@123
INSERT INTO users(role_id,name,email,phone,password_hash) VALUES
(1,'Store Admin','admin@kirana.in','9800000001','$2a$10$W.dowjZHZUTtUjQjNUbyw.ZzVHcGTJr2Hwa1XE.yVPtREZ.YXoozW'),
(2,'Ramesh Patil','manager@kirana.in','9800000002','$2a$10$W.dowjZHZUTtUjQjNUbyw.ZzVHcGTJr2Hwa1XE.yVPtREZ.YXoozW'),
(3,'Sneha Joshi','cashier@kirana.in','9800000003','$2a$10$W.dowjZHZUTtUjQjNUbyw.ZzVHcGTJr2Hwa1XE.yVPtREZ.YXoozW');
INSERT INTO categories(name,default_gst) VALUES
('Grains & Pulses',0),('Oil & Ghee',5),('Spices',5),('Dairy',5),('Snacks',12),('Beverages',18),('Personal Care',18),('Household',18);
INSERT INTO suppliers(name,contact_person,phone,gstin,address) VALUES
('Shree Ganesh Traders','Mahesh Shah','9811111111','27ABCDE1234F1Z5','Nashik APMC Market'),
('Om Distributors','Suresh Kale','9822222222','27PQRSX5678L1Z2','MIDC Satpur, Nashik'),
('Fresh Dairy Co-op','Anita More','9833333333',NULL,'Panchavati, Nashik');
INSERT INTO products(sku,name,barcode,category_id,brand,unit,purchase_price,selling_price,mrp,gst_rate,quantity,reorder_level,expiry_date,supplier_id) VALUES
('GR001','Basmati Rice 1kg','8901000000011',1,'India Gate','packet',95,110,120,0,60,15,'2027-06-30',1),
('GR002','Toor Dal','8901000000028',1,'Tata Sampann','kg',120,138,150,0,40,10,'2027-03-31',1),
('OL001','Sunflower Oil 1L','8901000000035',2,'Fortune','litre',130,145,155,5,50,12,'2027-01-15',2),
('SP001','Turmeric Powder 200g','8901000000042',3,'Everest','packet',40,48,52,5,8,10,'2027-02-28',2),
('DA001','Full Cream Milk 500ml','8901000000059',4,'Amul','packet',28,31,32,5,30,20,'2026-11-20',3),
('SN001','Potato Chips 52g','8901000000066',5,'Lays','packet',16,19,20,12,100,25,'2027-01-31',2),
('BV001','Cola 750ml','8901000000073',6,'Coca-Cola','piece',34,38,40,18,45,12,'2027-04-30',2),
('PC001','Soap 100g','8901000000080',7,'Dettol','piece',32,38,40,18,70,15,'2028-01-01',2),
('HH001','Dishwash Liquid 500ml','8901000000097',8,'Vim','piece',85,98,105,18,25,8,'2027-08-31',2),
('DA002','Curd 400g','8901000000103',4,'Amul','packet',30,36,38,5,5,10,'2026-11-10',3);
INSERT INTO customers(name,mobile,loyalty_points,discount_percent) VALUES
('Walk-in Customer','0000000000',0,0),('Prakash Deshmukh','9900000001',120,2),('Kavita Pawar','9900000002',45,0);
INSERT INTO store_settings(setting_key,setting_value) VALUES
('store_name','Shree Kirana & Supermarket'),('store_address','College Road, Nashik, Maharashtra'),
('store_gstin','27AAAAA0000A1Z5'),('store_phone','0253-0000000'),('upi_id','shreekirana@upi'),
('currency','INR'),('invoice_prefix','INV'),('loyalty_points_per_100','1'),('receipt_width_mm','80'),('low_stock_default','10');
INSERT INTO expenses(category,description,amount,expense_date,created_by) VALUES
('rent','Shop rent - November',25000,'2026-11-01',1),('electricity','Electricity bill - October',6200,'2026-11-05',1),
('salary','Staff salary - October',30000,'2026-11-01',1);
