-- Clean all test/fake data for production launch
-- Delete in correct order to respect foreign key constraints

-- 1. Delete messages first (depends on conversations)
DELETE FROM messages;

-- 2. Delete conversations
DELETE FROM conversations;

-- 3. Delete disputes (depends on transactions/jobs)
DELETE FROM disputes;

-- 4. Delete transactions (depends on jobs)
DELETE FROM transactions;

-- 5. Delete reviews (depends on jobs and profiles)
DELETE FROM reviews;

-- 6. Delete jobs (depends on offers, solicitudes, profesionales)
DELETE FROM jobs;

-- 7. Delete offers (depends on solicitudes and profesionales)
DELETE FROM offers;

-- 8. Delete invitations (depends on solicitudes and profesionales)
DELETE FROM invitaciones;

-- 9. Delete solicitudes (depends on profiles and categories)
DELETE FROM solicitudes;

-- 10. Delete portfolio items (depends on profesionales)
DELETE FROM portfolio;

-- 11. Delete profesionales (depends on profiles)
DELETE FROM profesionales;

-- 12. Delete companies (depends on profiles)
DELETE FROM companies;

-- 13. Delete profiles (keep admin profiles)
DELETE FROM profiles WHERE is_admin IS NOT TRUE;

-- Verify remaining data
SELECT 'profiles' as tabla, COUNT(*) as registros FROM profiles
UNION ALL
SELECT 'profesionales', COUNT(*) FROM profesionales
UNION ALL
SELECT 'solicitudes', COUNT(*) FROM solicitudes
UNION ALL
SELECT 'offers', COUNT(*) FROM offers
UNION ALL
SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL
SELECT 'categories', COUNT(*) FROM categories;
