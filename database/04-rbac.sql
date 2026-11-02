-- Run as the schema administrator. Accounts/passwords are provisioned separately from environment variables.
USE meditrack;
-- Definer-owned lock routines avoid granting Staff UPDATE or broad LOCK TABLES privileges.
DROP PROCEDURE IF EXISTS lock_sale_medicine;
DROP PROCEDURE IF EXISTS lock_sale_batches;
DELIMITER $$
CREATE PROCEDURE lock_sale_medicine(IN medicine INT UNSIGNED) SQL SECURITY DEFINER
BEGIN
 SELECT id FROM medicines WHERE id=medicine AND active=TRUE FOR UPDATE;
END$$
CREATE PROCEDURE lock_sale_batches(IN medicine INT UNSIGNED) SQL SECURITY DEFINER
BEGIN
 SELECT id,quantity,selling_price_paise FROM batches
 WHERE medicine_id=medicine AND expiry_date>CURRENT_DATE() AND quantity>0
 ORDER BY expiry_date,id FOR UPDATE;
END$$
DELIMITER ;
CREATE ROLE IF NOT EXISTS 'meditrack_auth_role', 'meditrack_staff_role', 'meditrack_admin_role';
GRANT SELECT(id,name,email,password_hash,role,active) ON meditrack.users TO 'meditrack_auth_role';
GRANT SELECT,INSERT,DELETE ON meditrack.sessions TO 'meditrack_auth_role';
GRANT SELECT,INSERT,UPDATE,DELETE ON meditrack.login_attempts TO 'meditrack_auth_role';

GRANT SELECT ON meditrack.medicines TO 'meditrack_staff_role';
GRANT SELECT ON meditrack.batches TO 'meditrack_staff_role';
GRANT SELECT ON meditrack.suppliers TO 'meditrack_staff_role';
GRANT SELECT ON meditrack.inventory_summary TO 'meditrack_staff_role';
GRANT SELECT ON meditrack.reorder_analysis TO 'meditrack_staff_role';
GRANT SELECT(id,name) ON meditrack.users TO 'meditrack_staff_role';
GRANT SELECT ON meditrack.sales TO 'meditrack_staff_role';
GRANT INSERT(user_id,request_key),UPDATE(status) ON meditrack.sales TO 'meditrack_staff_role';
GRANT SELECT ON meditrack.sale_items TO 'meditrack_staff_role';
GRANT INSERT(sale_id,batch_id,quantity,unit_price_paise) ON meditrack.sale_items TO 'meditrack_staff_role';
GRANT INSERT(user_id,action,entity_id) ON meditrack.audit_events TO 'meditrack_staff_role';

-- Admin inherits billing/read privileges and gains catalogue/procurement mutations.
GRANT 'meditrack_staff_role' TO 'meditrack_admin_role';
GRANT INSERT,UPDATE ON meditrack.medicines TO 'meditrack_admin_role';
GRANT INSERT,UPDATE ON meditrack.batches TO 'meditrack_admin_role';
GRANT INSERT,UPDATE,DELETE ON meditrack.suppliers TO 'meditrack_admin_role';
GRANT EXECUTE ON FUNCTION meditrack.available_stock TO 'meditrack_admin_role';
GRANT EXECUTE ON PROCEDURE meditrack.expiry_report TO 'meditrack_admin_role';

-- Staff has no UPDATE on batches: the existing definer-owned sale trigger deducts stock.
-- Neither runtime role can read password hashes, modify user roles, run DDL or grant privileges.

GRANT EXECUTE ON PROCEDURE meditrack.lock_sale_medicine TO 'meditrack_staff_role';
GRANT EXECUTE ON PROCEDURE meditrack.lock_sale_batches TO 'meditrack_staff_role';
