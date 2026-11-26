-- Lead-Versand: 75 Mails pro Tag und Absender (keine Daten gelöscht)
alter table public.lead_mail_settings alter column daily_limit set default 75;
update public.lead_mail_settings set daily_limit = 75;
alter table public.lead_pool_settings alter column daily_limit set default 75;
update public.lead_pool_settings set daily_limit = 75;
