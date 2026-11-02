USE meditrack;
-- JOIN + GROUP BY + HAVING: vendors whose usable stock exceeds 100 units.
SELECT s.name,SUM(b.quantity) AS units FROM suppliers s JOIN batches b ON b.supplier_id=s.id
WHERE b.expiry_date>CURRENT_DATE() GROUP BY s.id,s.name HAVING SUM(b.quantity)>100 ORDER BY units DESC;
-- Subquery: medicines sold at least once, plus revenue aggregation.
SELECT m.brand FROM medicines m WHERE m.id IN (
 SELECT b.medicine_id FROM batches b JOIN sale_items i ON i.batch_id=b.id
 JOIN sales s ON s.id=i.sale_id WHERE s.status='completed');
SELECT DATE(created_at) AS day,COUNT(*) AS invoices,SUM(total_paise) AS revenue_paise
FROM sales WHERE status='completed' GROUP BY DATE(created_at) ORDER BY day DESC;
SELECT * FROM inventory_summary WHERE active=TRUE AND available<=reorder_level ORDER BY available;
CALL expiry_report(30);
SELECT brand,available_stock(id) AS stock FROM medicines;
SELECT brand FROM medicines WHERE MATCH(brand,generic_name,description,indications) AGAINST('fever' IN NATURAL LANGUAGE MODE);
-- Safe CREATE / INSERT / UPDATE / SELECT / DELETE / ALTER / DROP classroom demonstration.
CREATE TEMPORARY TABLE ddl_dml_demo(id INT PRIMARY KEY,label VARCHAR(30) NOT NULL);
ALTER TABLE ddl_dml_demo ADD COLUMN verified BOOLEAN DEFAULT FALSE;
INSERT INTO ddl_dml_demo VALUES(1,'inventory review',FALSE);
UPDATE ddl_dml_demo SET verified=TRUE WHERE id=1;
SELECT * FROM ddl_dml_demo;
DELETE FROM ddl_dml_demo WHERE id=1;
DROP TEMPORARY TABLE ddl_dml_demo;
