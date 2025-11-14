INSERT INTO users (email, password_hash, name, phone_number, address, user_type, privacy_consent)
VALUES 
    ('customer@example.com', '$2b$12$aEbAF9Kz1Jf3dIisBQ3Nyut/cs6s1ChfF6MJxk1HKSlVu0m77eDmi', 'Demo Customer', '010-1000-2000', 'Seoul', 'CUSTOMER', TRUE),
    ('delivery@example.com', '$2b$12$aEbAF9Kz1Jf3dIisBQ3Nyut/cs6s1ChfF6MJxk1HKSlVu0m77eDmi', 'Demo Delivery', '010-4000-5000', 'Seoul', 'STAFF', TRUE),
    ('cook@example.com', '$2b$12$aEbAF9Kz1Jf3dIisBQ3Nyut/cs6s1ChfF6MJxk1HKSlVu0m77eDmi', 'Demo Cook', '010-6000-7000', 'Seoul', 'STAFF', TRUE),
    ('manager@example.com', '$2b$12$aEbAF9Kz1Jf3dIisBQ3Nyut/cs6s1ChfF6MJxk1HKSlVu0m77eDmi', 'Demo Manager', '010-5000-6000', 'Seoul', 'MANAGER', TRUE),
    ('vip@example.com', '$2b$12$aEbAF9Kz1Jf3dIisBQ3Nyut/cs6s1ChfF6MJxk1HKSlVu0m77eDmi', 'VIP Tester', '010-7777-8888', 'Busan', 'CUSTOMER', TRUE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff_details (staff_id, store_id, position, salary, permissions)
SELECT u.user_id, s.store_id, 'COOK', 3500000, '{"cook": true, "cooking_start": true, "cooking_complete": true}'::jsonb
FROM users u
JOIN stores s ON s.name = 'Main Kitchen'
WHERE u.email = 'cook@example.com'
ON CONFLICT (staff_id) DO NOTHING;

INSERT INTO staff_details (staff_id, store_id, position, salary, permissions)
SELECT u.user_id, s.store_id, 'DELIVERY', 2800000, '{"delivery": true, "delivery_start": true, "delivery_complete": true}'::jsonb
FROM users u
JOIN stores s ON s.name = 'Main Kitchen'
WHERE u.email = 'delivery@example.com'
ON CONFLICT (staff_id) DO NOTHING;

INSERT INTO customer_loyalty (customer_id, order_count, total_spent, vip_level)
SELECT u.user_id, 12, 850000, 'VIP'
FROM users u
WHERE u.email = 'vip@example.com'
ON CONFLICT (customer_id) DO UPDATE
SET order_count = EXCLUDED.order_count,
    total_spent = EXCLUDED.total_spent,
    vip_level = EXCLUDED.vip_level;

