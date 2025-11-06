CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS stores (
    store_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    address TEXT,
    phone TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO stores (name, address, phone)
VALUES ('Main Kitchen', 'Seoul, Gangnam-gu, Teheran-ro 123', '+82-2-123-4567')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    phone_number TEXT,
    address TEXT,
    user_type VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
    privacy_consent BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_details (
    staff_id UUID PRIMARY KEY,
    store_id UUID REFERENCES stores(store_id) ON DELETE SET NULL,
    position TEXT,
    salary NUMERIC,
    permissions JSONB,
    hired_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_staff_user FOREIGN KEY (staff_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS serving_styles (
    serving_style_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    price_modifier NUMERIC(10, 2) DEFAULT 0
);

INSERT INTO serving_styles (name, description, price_modifier) VALUES
    ('simple', '기본 플라스틱/심플 셋업', 0),
    ('grand', '업그레이드된 도자기/린넨 셋업', 5000),
    ('deluxe', '꽃병과 프리미엄 테이블 세팅', 10000)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS menu_items (
    menu_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    base_price NUMERIC(10, 2) NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO menu_items (code, name, description, base_price) VALUES
    ('valentine', '발렌타인 디너', '로맨틱한 발렌타인 디너 세트', 30000),
    ('french', '프렌치 디너', '정통 프렌치 코스 구성', 40000),
    ('english', '잉글리시 디너', '클래식 영국식 디너 코스', 45000),
    ('champagne', '샴페인 축제 디너', '샴페인과 함께 하는 축제 디너', 50000)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS menu_serving_style_availability (
    menu_item_id UUID NOT NULL REFERENCES menu_items(menu_item_id) ON DELETE CASCADE,
    serving_style_id UUID NOT NULL REFERENCES serving_styles(serving_style_id) ON DELETE CASCADE,
    PRIMARY KEY (menu_item_id, serving_style_id)
);

INSERT INTO menu_serving_style_availability (menu_item_id, serving_style_id)
SELECT mi.menu_item_id, ss.serving_style_id
FROM menu_items mi
JOIN serving_styles ss ON ss.name IN ('simple', 'grand', 'deluxe')
WHERE mi.code IN ('valentine', 'french', 'english')
ON CONFLICT DO NOTHING;

INSERT INTO menu_serving_style_availability (menu_item_id, serving_style_id)
SELECT mi.menu_item_id, ss.serving_style_id
FROM menu_items mi
JOIN serving_styles ss ON ss.name IN ('grand', 'deluxe')
WHERE mi.code = 'champagne'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS orders (
    order_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number TEXT NOT NULL UNIQUE,
    customer_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    store_id UUID NOT NULL REFERENCES stores(store_id),
    order_status TEXT NOT NULL DEFAULT 'RECEIVED',
    payment_status TEXT NOT NULL DEFAULT 'PENDING',
    total_price NUMERIC(12, 2) DEFAULT 0,
    delivery_address TEXT,
    delivery_time_estimated TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    order_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(menu_item_id),
    serving_style_id UUID NOT NULL REFERENCES serving_styles(serving_style_id),
    quantity INT NOT NULL DEFAULT 1,
    price_per_item NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_item_customizations (
    customization_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id UUID NOT NULL REFERENCES order_items(order_item_id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    change_type TEXT NOT NULL,
    quantity_change INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customer_loyalty (
    customer_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    order_count INT DEFAULT 0,
    total_spent NUMERIC(12, 2) DEFAULT 0,
    vip_level TEXT DEFAULT 'NEW',
    last_order_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingredients (
    ingredient_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL DEFAULT 'piece',
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO ingredients (name, unit) VALUES
    ('premium_steak', 'piece'),
    ('fresh_shrimp', 'piece'),
    ('truffle', 'piece'),
    ('herbs', 'bunch'),
    ('vegetables', 'kg'),
    ('olive_oil', 'bottle'),
    ('cheese', 'piece'),
    ('champagne', 'bottle'),
    ('heart_plate', 'piece'),
    ('cupid_decoration', 'piece'),
    ('napkin', 'piece'),
    ('wine', 'bottle'),
    ('coffee', 'cup'),
    ('fresh_salad', 'bowl'),
    ('scrambled_eggs', 'portion'),
    ('bacon', 'strip'),
    ('bread', 'piece'),
    ('champagne_bottle', 'bottle'),
    ('baguette', 'piece'),
    ('coffee_pot', 'pot')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS ingredient_pricing (
    ingredient_code TEXT PRIMARY KEY REFERENCES ingredients(name) ON DELETE CASCADE,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0
);

INSERT INTO ingredient_pricing (ingredient_code, unit_price) VALUES
    ('premium_steak', 18000),
    ('wine', 15000),
    ('champagne_bottle', 55000),
    ('champagne', 45000),
    ('coffee_pot', 8000),
    ('coffee', 4000),
    ('fresh_salad', 6000),
    ('baguette', 3000),
    ('scrambled_eggs', 2000),
    ('bacon', 2000),
    ('bread', 1500),
    ('heart_plate', 1000),
    ('cupid_decoration', 1500),
    ('napkin', 500)
ON CONFLICT (ingredient_code) DO UPDATE SET unit_price = EXCLUDED.unit_price;

CREATE TABLE IF NOT EXISTS menu_base_ingredients (
    menu_code TEXT NOT NULL,
    style TEXT NOT NULL,
    ingredient_code TEXT NOT NULL REFERENCES ingredients(name) ON DELETE CASCADE,
    base_quantity INT NOT NULL DEFAULT 0,
    PRIMARY KEY (menu_code, style, ingredient_code)
);

INSERT INTO menu_base_ingredients (menu_code, style, ingredient_code, base_quantity) VALUES
    ('valentine', 'simple', 'heart_plate', 1),
    ('valentine', 'simple', 'cupid_decoration', 1),
    ('valentine', 'simple', 'napkin', 1),
    ('valentine', 'simple', 'wine', 1),
    ('valentine', 'simple', 'premium_steak', 1),
    ('valentine', 'grand', 'heart_plate', 1),
    ('valentine', 'grand', 'cupid_decoration', 2),
    ('valentine', 'grand', 'napkin', 1),
    ('valentine', 'grand', 'wine', 1),
    ('valentine', 'grand', 'premium_steak', 1),
    ('valentine', 'deluxe', 'heart_plate', 1),
    ('valentine', 'deluxe', 'cupid_decoration', 3),
    ('valentine', 'deluxe', 'napkin', 2),
    ('valentine', 'deluxe', 'wine', 1),
    ('valentine', 'deluxe', 'premium_steak', 1),
    ('french', 'simple', 'coffee', 1),
    ('french', 'simple', 'wine', 1),
    ('french', 'simple', 'fresh_salad', 1),
    ('french', 'simple', 'premium_steak', 1),
    ('french', 'grand', 'coffee', 1),
    ('french', 'grand', 'wine', 1),
    ('french', 'grand', 'fresh_salad', 1),
    ('french', 'grand', 'premium_steak', 1),
    ('french', 'deluxe', 'coffee', 1),
    ('french', 'deluxe', 'wine', 1),
    ('french', 'deluxe', 'fresh_salad', 1),
    ('french', 'deluxe', 'premium_steak', 1),
    ('english', 'simple', 'scrambled_eggs', 1),
    ('english', 'simple', 'bacon', 2),
    ('english', 'simple', 'bread', 1),
    ('english', 'simple', 'premium_steak', 1),
    ('english', 'grand', 'scrambled_eggs', 2),
    ('english', 'grand', 'bacon', 3),
    ('english', 'grand', 'bread', 1),
    ('english', 'grand', 'premium_steak', 1),
    ('english', 'deluxe', 'scrambled_eggs', 2),
    ('english', 'deluxe', 'bacon', 4),
    ('english', 'deluxe', 'bread', 2),
    ('english', 'deluxe', 'premium_steak', 1),
    ('champagne', 'grand', 'champagne_bottle', 1),
    ('champagne', 'grand', 'baguette', 4),
    ('champagne', 'grand', 'coffee_pot', 1),
    ('champagne', 'grand', 'wine', 1),
    ('champagne', 'grand', 'premium_steak', 2),
    ('champagne', 'deluxe', 'champagne_bottle', 1),
    ('champagne', 'deluxe', 'baguette', 4),
    ('champagne', 'deluxe', 'coffee_pot', 1),
    ('champagne', 'deluxe', 'wine', 1),
    ('champagne', 'deluxe', 'premium_steak', 2)
ON CONFLICT (menu_code, style, ingredient_code) DO UPDATE SET base_quantity = EXCLUDED.base_quantity;

CREATE TABLE IF NOT EXISTS mock_payments (
    payment_id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    transaction_id TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PAID',
    masked_card_number TEXT,
    cardholder_name TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mock_payments_order_id ON mock_payments(order_id);

CREATE TABLE IF NOT EXISTS store_inventory (
    store_id UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE CASCADE,
    quantity_on_hand NUMERIC(12, 2) DEFAULT 0,
    PRIMARY KEY (store_id, ingredient_id)
);


INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
SELECT s.store_id, i.ingredient_id, 50
FROM stores s CROSS JOIN ingredients i
WHERE s.name = 'Main Kitchen'
ON CONFLICT DO NOTHING;

INSERT INTO users (email, password_hash, name, phone_number, address, user_type)
VALUES
    ('customer@example.com', '$2b$12$tq7a9CLVXKlCwsaWkBWyncFHQkX3eGUB7n/flQKXnfY5ZwdlQriu6', 'Demo Customer', '010-1000-2000', 'Seoul', 'CUSTOMER'),
    ('staff@example.com', '$2b$12$tq7a9CLVXKlCwsaWkBWyncFHQkX3eGUB7n/flQKXnfY5ZwdlQriu6', 'Demo Staff', '010-3000-4000', 'Seoul', 'STAFF'),
    ('manager@example.com', '$2b$12$tq7a9CLVXKlCwsaWkBWyncFHQkX3eGUB7n/flQKXnfY5ZwdlQriu6', 'Demo Manager', '010-5000-6000', 'Seoul', 'MANAGER')
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff_details (staff_id, store_id, position, salary, permissions)
SELECT u.user_id, s.store_id, 'COOK', 3500000, '{"cook": true, "cooking_start": true, "cooking_complete": true}'::jsonb
FROM users u
JOIN stores s ON s.name = 'Main Kitchen'
WHERE u.email = 'staff@example.com'
ON CONFLICT (staff_id) DO NOTHING;
