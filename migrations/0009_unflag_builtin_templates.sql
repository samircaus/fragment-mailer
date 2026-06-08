-- Seeded promo/offer templates are normal editable rows, not locked built-ins.
UPDATE email_templates SET is_builtin = 0 WHERE is_builtin = 1;
