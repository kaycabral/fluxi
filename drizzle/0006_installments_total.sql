-- An installment entry now stores the TOTAL in amount_cents (the app splits it
-- into equal installments, leftover cents on the first). Existing rows stored
-- the value of each installment: convert them to the total. Overrides keep
-- their absolute per-installment amounts.
UPDATE public.entries
SET amount_cents = amount_cents * installments
WHERE recurrence = 'installments' AND installments IS NOT NULL;
