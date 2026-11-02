USE meditrack;
-- A nonrecursive CTE is used by the application's actual dashboard reorder query.
CREATE OR REPLACE SQL SECURITY DEFINER VIEW reorder_analysis AS
WITH stock_position AS (
 SELECT i.*, GREATEST(i.reorder_level * 2,i.reorder_level + 1) AS target_units
 FROM inventory_summary i WHERE i.active=TRUE
)
SELECT s.*,GREATEST(s.target_units-s.available,0) AS suggested_order_units
FROM stock_position s WHERE s.available<=s.reorder_level;

-- Correlated scalar subquery: each outer medicine gets its own usable-stock calculation.
SELECT m.id,m.brand,
 (SELECT COALESCE(SUM(b.quantity),0) FROM batches b
  WHERE b.medicine_id=m.id AND b.expiry_date>CURRENT_DATE()) AS usable_units
FROM medicines m WHERE m.active=TRUE ORDER BY usable_units,m.brand;

-- Correlated EXISTS: brands with an available equivalent ingredient, strength and form.
SELECT m.id,m.brand FROM medicines m
WHERE m.active=TRUE AND EXISTS (
 SELECT 1 FROM medicines substitute
 WHERE substitute.id<>m.id AND substitute.active=TRUE
 AND substitute.generic_name=m.generic_name
 AND substitute.strength=m.strength AND substitute.dosage_form=m.dosage_form
 AND EXISTS (SELECT 1 FROM batches b WHERE b.medicine_id=substitute.id
             AND b.expiry_date>CURRENT_DATE() AND b.quantity>0)
) ORDER BY m.brand;

-- Recursive CTE: generate seven dates, retaining days with zero expiring batches.
WITH RECURSIVE expiry_calendar(day) AS (
 SELECT CURRENT_DATE()
 UNION ALL
 SELECT day+INTERVAL 1 DAY FROM expiry_calendar
 WHERE day<CURRENT_DATE()+INTERVAL 6 DAY
)
SELECT c.day,COUNT(b.id) AS batches_expiring,COALESCE(SUM(b.quantity),0) AS units_expiring
FROM expiry_calendar c LEFT JOIN batches b ON b.expiry_date=c.day AND b.quantity>0
GROUP BY c.day ORDER BY c.day;

-- CTE plus window ranking: supplier exposure to unusable or soon-expiring stock.
WITH supplier_risk AS (
 SELECT s.id,s.name,COALESCE(SUM(b.quantity*b.purchase_price_paise),0) AS risk_paise
 FROM suppliers s LEFT JOIN batches b ON b.supplier_id=s.id
 AND b.expiry_date<=CURRENT_DATE()+INTERVAL 30 DAY AND b.quantity>0
 GROUP BY s.id,s.name
)
SELECT *,DENSE_RANK() OVER (ORDER BY risk_paise DESC) AS risk_rank
FROM supplier_risk ORDER BY risk_rank,name;
