USE meditrack;
DELIMITER $$
CREATE TRIGGER guard_sale_item BEFORE INSERT ON sale_items FOR EACH ROW
BEGIN
 DECLARE stock INT; DECLARE expires DATE; DECLARE price INT; DECLARE enabled BOOLEAN;
 DECLARE state VARCHAR(20);
 SELECT status INTO state FROM sales WHERE id=NEW.sale_id FOR UPDATE;
 IF state <> 'pending' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Completed invoices are immutable'; END IF;
 -- Lock the batch before checking stock so concurrent sales cannot both consume it.
 SELECT b.quantity,b.expiry_date,b.selling_price_paise,m.active
 INTO stock,expires,price,enabled FROM batches b JOIN medicines m ON m.id=b.medicine_id
 WHERE b.id=NEW.batch_id FOR UPDATE;
 IF expires <= CURRENT_DATE() THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Expired or same-day expiring batches cannot be sold'; END IF;
 IF enabled=FALSE THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inactive medicine cannot be sold'; END IF;
 IF NEW.quantity > stock THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Insufficient batch stock'; END IF;
 -- A client cannot lower the invoice price: the database owns the price snapshot.
 SET NEW.unit_price_paise=price;
 UPDATE batches SET quantity=quantity-NEW.quantity WHERE id=NEW.batch_id;
END$$
CREATE TRIGGER add_invoice_total AFTER INSERT ON sale_items FOR EACH ROW
BEGIN
 UPDATE sales SET total_paise=total_paise+NEW.line_total_paise WHERE id=NEW.sale_id;
END$$
CREATE TRIGGER immutable_item_update BEFORE UPDATE ON sale_items FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice lines are immutable'; END$$
CREATE TRIGGER immutable_item_delete BEFORE DELETE ON sale_items FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invoice lines are immutable'; END$$
CREATE TRIGGER immutable_sale BEFORE UPDATE ON sales FOR EACH ROW
BEGIN
 IF OLD.status='completed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Completed invoices are immutable'; END IF;
 IF NEW.status='completed' AND NOT EXISTS(SELECT 1 FROM sale_items WHERE sale_id=OLD.id) THEN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot complete an empty invoice'; END IF;
END$$
CREATE TRIGGER batch_receipt AFTER INSERT ON batches FOR EACH ROW
BEGIN INSERT INTO stock_movements(batch_id,quantity_delta,reason) VALUES(NEW.id,NEW.quantity,'receipt'); END$$
CREATE TRIGGER batch_movement AFTER UPDATE ON batches FOR EACH ROW
BEGIN
 IF NEW.quantity <> OLD.quantity THEN
 INSERT INTO stock_movements(batch_id,quantity_delta,reason) VALUES(NEW.id,NEW.quantity-OLD.quantity,'stock change');
 END IF;
END$$
CREATE FUNCTION available_stock(medicine INT UNSIGNED) RETURNS INT READS SQL DATA
BEGIN
 DECLARE total INT;
 SELECT COALESCE(SUM(quantity),0) INTO total FROM batches WHERE medicine_id=medicine AND expiry_date>CURRENT_DATE();
 RETURN total;
END$$
CREATE PROCEDURE expiry_report(IN days_ahead INT)
BEGIN
 SELECT b.id,m.brand,b.batch_number,b.quantity,b.expiry_date,
 DATEDIFF(b.expiry_date,CURRENT_DATE()) AS days_remaining
 FROM batches b JOIN medicines m ON m.id=b.medicine_id
 WHERE b.quantity>0 AND b.expiry_date<=DATE_ADD(CURRENT_DATE(),INTERVAL days_ahead DAY)
 ORDER BY b.expiry_date,b.id;
END$$
DELIMITER ;
CREATE VIEW inventory_summary AS
SELECT m.id,m.brand,m.generic_name,m.strength,m.dosage_form,m.description,m.indications,m.otc,m.reorder_level,m.active,
 COALESCE(SUM(CASE WHEN b.expiry_date>CURRENT_DATE() THEN b.quantity ELSE 0 END),0) AS available,
 COALESCE(SUM(CASE WHEN b.expiry_date<=CURRENT_DATE() THEN b.quantity ELSE 0 END),0) AS expired,
 MIN(CASE WHEN b.quantity>0 AND b.expiry_date>CURRENT_DATE() THEN b.expiry_date END) AS next_expiry,
 MIN(CASE WHEN b.quantity>0 AND b.expiry_date>CURRENT_DATE() THEN b.selling_price_paise END) AS price_paise
FROM medicines m LEFT JOIN batches b ON b.medicine_id=m.id GROUP BY m.id;
