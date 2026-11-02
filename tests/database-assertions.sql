-- Run only on a disposable database after loading both schema scripts.
CREATE TABLE validation_results(name VARCHAR(100),passed BOOLEAN);

DELIMITER $$
CREATE PROCEDURE validate_integrity() BEGIN
 DECLARE u INT; DECLARE sp INT; DECLARE m INT; DECLARE valid_batch INT; DECLARE expired_batch INT; DECLARE today_batch INT; DECLARE s BIGINT; DECLARE blocked BOOLEAN DEFAULT FALSE;
 INSERT INTO users(name,email,password_hash,role) VALUES('Test','validation@example.test','unusable','staff'); SET u=LAST_INSERT_ID();
 INSERT INTO suppliers(name,email,phone) VALUES('Test vendor','vendor@example.test','9000000000'); SET sp=LAST_INSERT_ID();
 INSERT INTO medicines(brand,generic_name,strength,dosage_form,description,indications) VALUES('Testbrand','Test ingredient','500 mg','tablet','test','fever');SET m=LAST_INSERT_ID();
 INSERT INTO batches(medicine_id,supplier_id,batch_number,expiry_date,received_date,quantity,purchase_price_paise,selling_price_paise) VALUES(m,sp,'valid',CURRENT_DATE()+INTERVAL 30 DAY,CURRENT_DATE()-INTERVAL 30 DAY,10,100,150);SET valid_batch=LAST_INSERT_ID();
 INSERT INTO batches(medicine_id,supplier_id,batch_number,expiry_date,received_date,quantity,purchase_price_paise,selling_price_paise) VALUES(m,sp,'expired',CURRENT_DATE()-INTERVAL 1 DAY,CURRENT_DATE()-INTERVAL 30 DAY,5,100,150);SET expired_batch=LAST_INSERT_ID();
 INSERT INTO batches(medicine_id,supplier_id,batch_number,expiry_date,received_date,quantity,purchase_price_paise,selling_price_paise) VALUES(m,sp,'today',CURRENT_DATE(),CURRENT_DATE()-INTERVAL 30 DAY,3,100,150);SET today_batch=LAST_INSERT_ID();
 INSERT INTO sales(user_id,request_key) VALUES(u,UUID());SET s=LAST_INSERT_ID();
 INSERT INTO sale_items(sale_id,batch_id,quantity,unit_price_paise) VALUES(s,valid_batch,2,1);
 INSERT INTO validation_results SELECT 'Server-owned invoice price',unit_price_paise=150 FROM sale_items WHERE sale_id=s;
 INSERT INTO validation_results SELECT 'Atomic stock deduction',quantity=8 FROM batches WHERE id=valid_batch;
 INSERT INTO validation_results SELECT 'Invoice total trigger',total_paise=300 FROM sales WHERE id=s;
 SET blocked=FALSE;BEGIN DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET blocked=TRUE;INSERT INTO sale_items(sale_id,batch_id,quantity,unit_price_paise) VALUES(s,expired_batch,1,1);END;INSERT INTO validation_results VALUES('Expired stock blocked',blocked);
 SET blocked=FALSE;BEGIN DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET blocked=TRUE;INSERT INTO sale_items(sale_id,batch_id,quantity,unit_price_paise) VALUES(s,today_batch,1,1);END;INSERT INTO validation_results VALUES('Same-day expiry blocked',blocked);
 INSERT INTO sales(user_id,request_key) VALUES(u,UUID());SET s=LAST_INSERT_ID();
 SET blocked=FALSE;BEGIN DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET blocked=TRUE;INSERT INTO sale_items(sale_id,batch_id,quantity,unit_price_paise) VALUES(s,valid_batch,20,1);END;INSERT INTO validation_results VALUES('Direct oversell blocked',blocked);
 SET blocked=FALSE;BEGIN DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET blocked=TRUE;UPDATE batches SET quantity=-1 WHERE id=valid_batch;END;INSERT INTO validation_results VALUES('Nonnegative stock constraint',blocked);
 SET blocked=FALSE;BEGIN DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET blocked=TRUE;DELETE FROM suppliers WHERE id=sp;END;INSERT INTO validation_results VALUES('Supplier foreign key protects history',blocked);
 START TRANSACTION;UPDATE batches SET quantity=0 WHERE id=valid_batch;ROLLBACK;INSERT INTO validation_results SELECT 'Transaction rollback restores stock',quantity=8 FROM batches WHERE id=valid_batch;
 SET blocked=FALSE;BEGIN DECLARE CONTINUE HANDLER FOR SQLEXCEPTION SET blocked=TRUE;UPDATE sale_items SET quantity=9 WHERE batch_id=valid_batch;END;INSERT INTO validation_results VALUES('Invoice lines immutable',blocked);
 INSERT INTO validation_results VALUES('Stored stock function excludes expiry',available_stock(m)=8);
 INSERT INTO validation_results SELECT 'Inventory view distinguishes expired stock',available=8 AND expired=8 FROM inventory_summary WHERE id=m;
 INSERT INTO validation_results SELECT 'Stock movement ledger',COUNT(*)=4 FROM stock_movements;
END$$
DELIMITER ;
CALL validate_integrity();
SELECT * FROM validation_results;
