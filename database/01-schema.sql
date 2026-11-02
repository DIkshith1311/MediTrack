-- MySQL 8.4 / InnoDB. Integer paise keep all billing calculations exact.
CREATE DATABASE IF NOT EXISTS meditrack;
USE meditrack;
CREATE TABLE users (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('admin','staff') NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sessions (
 token_hash CHAR(64) PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX ix_sessions_expiry(expires_at)
);
CREATE TABLE login_attempts (
 identity_hash CHAR(64) PRIMARY KEY,
 failures INT UNSIGNED NOT NULL DEFAULT 0,
 window_start DATETIME NOT NULL
);
CREATE TABLE suppliers (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(120) NOT NULL UNIQUE,
 email VARCHAR(254) NOT NULL,
 phone VARCHAR(20) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE medicines (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 brand VARCHAR(100) NOT NULL,
 generic_name VARCHAR(100) NOT NULL,
 strength VARCHAR(50) NOT NULL,
 dosage_form VARCHAR(50) NOT NULL,
 description TEXT NOT NULL,
 indications VARCHAR(255) NOT NULL,
 otc BOOLEAN NOT NULL DEFAULT TRUE,
 reorder_level INT NOT NULL DEFAULT 20,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE KEY uq_medicine(brand,strength,dosage_form),
 CONSTRAINT ck_reorder CHECK(reorder_level >= 0),
 INDEX ix_substitutes(generic_name,strength,dosage_form),
 FULLTEXT KEY ft_medicine(brand,generic_name,description,indications)
);
CREATE TABLE batches (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 medicine_id INT UNSIGNED NOT NULL,
 supplier_id INT UNSIGNED NOT NULL,
 batch_number VARCHAR(60) NOT NULL,
 expiry_date DATE NOT NULL,
 received_date DATE NOT NULL,
 quantity INT NOT NULL,
 purchase_price_paise INT NOT NULL,
 selling_price_paise INT NOT NULL,
 UNIQUE KEY uq_batch(medicine_id,batch_number),
 FOREIGN KEY(medicine_id) REFERENCES medicines(id),
 FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
 CONSTRAINT ck_batch_quantity CHECK(quantity >= 0),
 CONSTRAINT ck_purchase CHECK(purchase_price_paise > 0),
 CONSTRAINT ck_selling CHECK(selling_price_paise >= purchase_price_paise),
 CONSTRAINT ck_dates CHECK(expiry_date >= received_date),
 INDEX ix_fefo(medicine_id,expiry_date,id)
);
CREATE TABLE sales (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 request_key CHAR(36) NOT NULL UNIQUE,
 status ENUM('pending','completed') NOT NULL DEFAULT 'pending',
 total_paise BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id),
 CONSTRAINT ck_total CHECK(total_paise >= 0),
 INDEX ix_sales_date(created_at)
);
CREATE TABLE sale_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 sale_id BIGINT UNSIGNED NOT NULL,
 batch_id INT UNSIGNED NOT NULL,
 quantity INT NOT NULL,
 unit_price_paise INT NOT NULL,
 line_total_paise BIGINT GENERATED ALWAYS AS (quantity * unit_price_paise) STORED,
 FOREIGN KEY(sale_id) REFERENCES sales(id),
 FOREIGN KEY(batch_id) REFERENCES batches(id),
 CONSTRAINT ck_sale_quantity CHECK(quantity > 0),
 CONSTRAINT ck_unit_price CHECK(unit_price_paise > 0),
 UNIQUE KEY uq_sale_batch(sale_id,batch_id)
);
CREATE TABLE stock_movements (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 batch_id INT UNSIGNED NOT NULL,
 quantity_delta INT NOT NULL,
 reason VARCHAR(60) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(batch_id) REFERENCES batches(id),
 INDEX ix_movement_batch(batch_id,created_at)
);
CREATE TABLE audit_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id INT UNSIGNED NOT NULL,
 action VARCHAR(60) NOT NULL,
 entity_id BIGINT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
-- ALTER is demonstrated on a real table; DROP examples use temporary tables only.
ALTER TABLE medicines ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
