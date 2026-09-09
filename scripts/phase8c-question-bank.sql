-- Phase 8C learning question-bank refresh.
-- Apply only after the Phase 8C application code is deployed.
-- Every learning question uses three progressive hints and an explanation.

with bank(course_slug, exercise_title, instructions, expected_state) as (
  values
  ('sap-foundations','Why companies use ERP',
   'Purchasing records a material receipt and Finance needs the same information immediately without re-entering it. What ERP benefit is being demonstrated?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('Shared business data across departments','A separate spreadsheet for each department','Manual re-entry by Finance','An email sent after every transaction'),
     'expected','Shared business data across departments',
     'hints',jsonb_build_array('Think about whether departments should work from separate copies of the same information.','ERP connects business processes so one transaction can be visible to other functions.','The key idea is one shared source of business information.'),
     'explanation','ERP reduces disconnected data by letting departments work from shared business processes and records.'
   )),
  ('sap-foundations','Identify SAP',
   'A manufacturer wants one enterprise system for purchasing, inventory, finance, sales, and reporting. Which description best fits SAP?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('Enterprise software for running integrated business processes','A spreadsheet used only for stock counts','A messaging application for suppliers','A programming language for websites'),
     'expected','Enterprise software for running integrated business processes',
     'hints',jsonb_build_array('Focus on the company-wide requirement, not one department.','The system must support several connected business functions.','SAP is enterprise software used to run integrated business processes.'),
     'explanation','SAP is enterprise software used by organizations to run and integrate business processes across functions.'
   )),
  ('sap-foundations','Recognize the MM module',
   'A buyer needs to manage materials, suppliers, purchase orders, goods receipts, and inventory. Which SAP module is the best fit?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('SAP MM','SAP FI','SAP SD','SAP HCM'),
     'expected','SAP MM',
     'hints',jsonb_build_array('Look at the words materials, purchasing, and inventory.','The module name includes Materials Management.','Materials Management is abbreviated MM.'),
     'explanation','SAP MM supports materials management activities such as purchasing, inventory, and related master data.'
   )),
  ('sap-foundations','Follow the business process',
   'A maintenance team reports that a critical bearing is needed, but no purchasing document exists yet. What should happen first in the purchasing process?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('Identify and document the business need','Post a goods receipt','Verify a supplier invoice','Pay the supplier'),
     'expected','Identify and document the business need',
     'hints',jsonb_build_array('Nothing can be purchased until the requirement is understood.','The process starts before any supplier-facing document exists.','First capture the requirement that starts procurement.'),
     'explanation','Procurement begins with a business requirement. Later documents convert that need into purchasing activity.'
   )),
  ('sap-foundations','Master or transaction data',
   'Vendor 100045 is reused on hundreds of purchase orders over time. Is the vendor record master data or transaction data?',
   jsonb_build_object(
     'question_type','fill_blank',
     'expected','master data',
     'accepted',jsonb_build_array('master','master data'),
     'hints',jsonb_build_array('Ask whether this record is reused or created for only one event.','Reusable business objects are different from individual transactions.','Vendor information reused across many transactions is master data.'),
     'explanation','Master data is relatively stable information reused by many transactions. A vendor record is a classic example.'
   )),

  ('sap-mm-level-1','Identify the MM business flow',
   'Plant HYD1 is running low on production bolts and no purchasing document exists yet. What is the first business action?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('Identify the material requirement','Receive the goods','Verify the invoice','Pay the supplier'),
     'expected','Identify the material requirement',
     'hints',jsonb_build_array('Start before any order or receipt exists.','Purchasing begins because the business has a material requirement.','First identify what the business needs to buy.'),
     'explanation','The purchasing flow starts with a material requirement. Procurement documents come after the need is identified.'
   )),
  ('sap-mm-level-1','Match the MM objects',
   'A purchase order must name the external business that will supply 40 bearings to HYD1. What do we call that business in SAP MM?',
   jsonb_build_object(
     'question_type','fill_blank',
     'expected','vendor',
     'accepted',jsonb_build_array('vendor','supplier'),
     'hints',jsonb_build_array('This is the external company the buyer purchases from.','The same business partner can appear on many purchase orders.','Vendor and supplier are both accepted terms here.'),
     'explanation','The vendor or supplier is the external business from which the company purchases materials or services.'
   )),
  ('sap-mm-level-1','Build the requisition',
   'Maintenance needs 20 bearings, but Purchasing has not selected a supplier and has not made an external commitment. Which document should capture the internal request?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('Purchase Requisition','Purchase Order','Goods Receipt','Supplier Invoice'),
     'expected','Purchase Requisition',
     'hints',jsonb_build_array('The request is still internal.','No supplier commitment has been made yet.','The internal request to buy is the Purchase Requisition.'),
     'explanation','A Purchase Requisition records an internal requirement to procure something. A Purchase Order is the later supplier-facing commitment.'
   )),
  ('sap-mm-level-1','Choose the approved source',
   'Two approved suppliers can provide the material. Purchasing selects one company to fulfill the requirement. What role does that selected company play?',
   jsonb_build_object(
     'question_type','fill_blank',
     'expected','vendor',
     'accepted',jsonb_build_array('vendor','supplier'),
     'hints',jsonb_build_array('Think about the external company fulfilling the order.','Purchasing chooses this business as the source of supply.','The SAP MM term is vendor; supplier is also accepted.'),
     'explanation','The selected vendor or supplier is the source from which the company procures the material.'
   )),
  ('sap-mm-level-1','Create PO for Hyderabad Plant',
   'A purchase requisition is approved and Vendor V100 has been selected. Which document now creates the formal order to that supplier?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('Purchase Order','Purchase Requisition','Goods Receipt','Material Document'),
     'expected','Purchase Order',
     'hints',jsonb_build_array('The internal request has already been approved.','Now the company must communicate a formal buying commitment to the supplier.','The supplier-facing purchasing document is the Purchase Order.'),
     'explanation','A Purchase Order is the formal purchasing document sent to a supplier after the requirement and source are established.'
   )),
  ('sap-mm-level-1','Post the full receipt',
   'PO 4500000921 is for 40 bearings. The truck reaches HYD1 and the warehouse physically counts all 40. Which SAP event should the warehouse record?',
   jsonb_build_object(
     'question_type','fill_blank',
     'expected','goods receipt',
     'accepted',jsonb_build_array('goods receipt','gr','post goods receipt','post gr','goods receipt posting','receipt'),
     'hints',jsonb_build_array('Focus on the physical warehouse event, not the purchase order itself.','This step records that material has actually arrived and normally updates stock.','The warehouse posts the receipt of goods against the purchasing document.'),
     'explanation','A Goods Receipt records the quantity that physically arrived. In this case all 40 bearings were received, so the warehouse posts a GR for 40.'
   )),
  ('sap-mm-level-1','Post only what arrived',
   'A PO is for 100 units, but the warehouse physically receives only 60 today. What quantity should be posted in the Goods Receipt?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('60','100','40','0 until all 100 arrive'),
     'expected','60',
     'hints',jsonb_build_array('Do not copy the ordered quantity automatically.','A Goods Receipt represents what physically arrived now.','Only 60 units are physically present, so the receipt quantity must reflect 60.'),
     'explanation','The Goods Receipt should reflect the actual physical receipt. Posting 100 would overstate inventory by 40 units.'
   )),
  ('sap-mm-level-1','Check the three-way match',
   'The supplier invoice arrives after the warehouse has received the material. Before approval, which three business documents should Accounts Payable compare?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('Purchase Order, Goods Receipt, Supplier Invoice','Purchase Requisition, Vendor Master, Plant','Material Master, Storage Location, Bank Account','Purchase Order, Payment Document, Bank Statement'),
     'expected','Purchase Order, Goods Receipt, Supplier Invoice',
     'hints',jsonb_build_array('Think planned purchase, physical receipt, then supplier bill.','Invoice verification checks what was ordered against what arrived and what was invoiced.','The classic three-way match uses PO, Goods Receipt, and Supplier Invoice.'),
     'explanation','Three-way matching compares the Purchase Order, Goods Receipt, and supplier invoice to detect quantity or value differences before payment.'
   )),
  ('sap-mm-level-1','Investigate the mismatch',
   'The approved PO total is ₹50,000, but the supplier invoice is ₹55,000 with no approved change. What should the user do before approving the invoice?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('Investigate the mismatch before approval','Approve it because the supplier sent it','Change the Goods Receipt to ₹55,000','Pay ₹55,000 and review it later'),
     'expected','Investigate the mismatch before approval',
     'hints',jsonb_build_array('The invoice does not agree with the approved purchasing value.','Invoice verification exists to catch unexplained differences before payment.','Do not approve an unexplained higher invoice; investigate the mismatch.'),
     'explanation','An unexplained price or value difference should be investigated before approval so the company does not pay an incorrect amount.'
   )),
  ('sap-mm-level-1','Transfer stock internally',
   'HYD1 has 12 units in storage location SL01. The warehouse moves 5 units to SL02 in the same plant. What inventory action is this?',
   jsonb_build_object(
     'question_type','fill_blank',
     'expected','stock transfer',
     'accepted',jsonb_build_array('stock transfer','transfer','storage location transfer','transfer posting'),
     'hints',jsonb_build_array('The material is not leaving the business.','Only the internal storage location changes.','This is an internal stock transfer between storage locations.'),
     'explanation','Moving stock between storage locations without receiving from or issuing to an external party is an internal stock transfer.'
   )),
  ('sap-mm-level-1','Classify inventory events',
   'A supplier delivers 25 units to the warehouse and available stock increases. Which inventory movement category best describes the event?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('Receipt','Issue','Transfer','Physical inventory count'),
     'expected','Receipt',
     'hints',jsonb_build_array('Look at whether stock is entering, leaving, or only changing location.','The supplier delivery increases warehouse stock.','Material entering stock from a supplier is a receipt.'),
     'explanation','A supplier delivery that increases stock is a receipt. An issue reduces stock, while a transfer moves stock internally.'
   )),
  ('sap-mm-level-1','Run the Level 1 procurement flow',
   'A purchase requisition is approved and the source of supply has been selected. What document should be created next to continue the standard procurement flow?',
   jsonb_build_object(
     'question_type','multiple_choice',
     'options',jsonb_build_array('Purchase Order','Goods Receipt','Supplier Invoice','Payment Document'),
     'expected','Purchase Order',
     'hints',jsonb_build_array('The requirement is approved, but the supplier still needs a formal order.','Goods cannot be received against a basic flow before the supplier-facing order exists.','Create the Purchase Order next.'),
     'explanation','After an approved requisition and source selection, the Purchase Order formalizes the supplier commitment before receipt and invoice steps.'
   ))
)
update public.exercises e
set instructions = bank.instructions,
    expected_state = bank.expected_state
from bank
join public.lessons l on l.id = e.lesson_id
join public.course_modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
where c.slug = bank.course_slug
  and e.title = bank.exercise_title;

-- Quality assertions: all refreshed learning questions must have three hints and an explanation.
do $$
declare
  bad_count integer;
begin
  select count(*) into bad_count
  from public.exercises e
  join public.lessons l on l.id=e.lesson_id
  join public.course_modules m on m.id=l.module_id
  join public.courses c on c.id=m.course_id
  where c.slug in ('sap-foundations','sap-mm-level-1')
    and (jsonb_array_length(coalesce(e.expected_state->'hints','[]'::jsonb)) <> 3
         or nullif(e.expected_state->>'explanation','') is null);
  if bad_count > 0 then
    raise exception 'Phase 8C question bank quality gate failed: % exercises are missing exactly 3 hints or an explanation', bad_count;
  end if;
end $$;
