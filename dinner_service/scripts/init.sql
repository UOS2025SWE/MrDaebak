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
    is_on_duty BOOLEAN DEFAULT FALSE,
    last_check_in TIMESTAMP,
    last_check_out TIMESTAMP,
    last_payday TIMESTAMP,
    next_payday TIMESTAMP,
    CONSTRAINT fk_staff_user FOREIGN KEY (staff_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_termination_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id UUID NOT NULL,
    staff_name TEXT,
    staff_email TEXT,
    position TEXT,
    termination_reason TEXT,
    terminated_at TIMESTAMP DEFAULT NOW(),
    terminated_by UUID REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_termination_logs_staff_id ON staff_termination_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_termination_logs_terminated_at ON staff_termination_logs(terminated_at);

CREATE TABLE IF NOT EXISTS ingredient_intake_batches (
    batch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES stores(store_id) ON DELETE CASCADE,
    manager_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    cook_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'AWAITING_COOK',
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    total_expected_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_actual_cost NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ingredients (
    ingredient_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL DEFAULT 'piece',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingredient_pricing (
    ingredient_code TEXT PRIMARY KEY REFERENCES ingredients(name) ON DELETE CASCADE,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ingredient_intake_items (
    intake_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES ingredient_intake_batches(batch_id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT,
    expected_quantity NUMERIC(12, 2) NOT NULL CHECK (expected_quantity >= 0),
    actual_quantity NUMERIC(12, 2) NOT NULL CHECK (actual_quantity >= 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    expected_total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    actual_total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (batch_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_intake_batches_status ON ingredient_intake_batches(status);
CREATE INDEX IF NOT EXISTS idx_intake_batches_store ON ingredient_intake_batches(store_id);
CREATE INDEX IF NOT EXISTS idx_intake_items_batch ON ingredient_intake_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_intake_items_ingredient ON ingredient_intake_items(ingredient_id);

CREATE TABLE IF NOT EXISTS side_dishes (
    side_dish_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    base_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_side_dishes_available ON side_dishes(is_available);

CREATE TABLE IF NOT EXISTS serving_styles (
    serving_style_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    price_modifier NUMERIC(10, 2) DEFAULT 0
);

INSERT INTO serving_styles (name, description, price_modifier) VALUES
    ('simple', '플라스틱 접시·플라스틱 컵·종이 냅킨이 플라스틱 쟁반에 제공되며, 와인 포함 시 플라스틱 와인잔을 사용합니다.', 0),
    ('grand', '도자기 접시·도자기 컵·흰색 면 냅킨이 나무 쟁반에 제공되며, 와인 포함 시 플라스틱 와인잔을 사용합니다.', 5000),
    ('deluxe', '꽃병 장식과 함께 도자기 접시·도자기 컵·린넨 냅킨이 나무 쟁반에 제공되며, 와인 포함 시 유리 와인잔을 사용합니다.', 10000)
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
    ('champagne', '샴페인 축제 디너', '샴페인과 함께 하는 축제 디너', 50000),
    ('cake', '커스터마이징 케이크', '이미지 업로드와 맞춤 장식을 지원하는 고정 메뉴 케이크', 42000)
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

INSERT INTO menu_serving_style_availability (menu_item_id, serving_style_id)
SELECT mi.menu_item_id, ss.serving_style_id
FROM menu_items mi
JOIN serving_styles ss ON ss.name IN ('simple', 'grand', 'deluxe')
WHERE mi.code = 'cake'
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
    inventory_consumed BOOLEAN NOT NULL DEFAULT FALSE,
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

CREATE TABLE IF NOT EXISTS order_side_dishes (
    order_side_dish_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    side_dish_id UUID NOT NULL REFERENCES side_dishes(side_dish_id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    price_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cake_customizations (
    cake_customization_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id UUID NOT NULL REFERENCES order_items(order_item_id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    image_path TEXT,
    message TEXT,
    flavor TEXT,
    size TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_side_dishes_order ON order_side_dishes(order_id);
CREATE INDEX IF NOT EXISTS idx_cake_customizations_order_item ON cake_customizations(order_item_id);

CREATE TABLE IF NOT EXISTS order_inventory_reservations (
    reservation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    ingredient_code TEXT NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity >= 0),
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    consumed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_inventory_reservations_unique
    ON order_inventory_reservations(order_id, ingredient_code);

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS inventory_consumed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS customer_loyalty (
    customer_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    order_count INT DEFAULT 0,
    total_spent NUMERIC(12, 2) DEFAULT 0,
    vip_level TEXT DEFAULT 'NEW',
    last_order_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_cake_recipes (
    recipe_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flavor TEXT NOT NULL,
    size TEXT NOT NULL,
    ingredient_code TEXT NOT NULL REFERENCES ingredients(name) ON DELETE CASCADE,
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    UNIQUE (flavor, size, ingredient_code)
);

CREATE INDEX IF NOT EXISTS idx_custom_cake_recipes_flavor_size
    ON custom_cake_recipes(flavor, size);

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
    ('coffee_pot', 'pot'),
    ('plastic_plate', 'piece'),
    ('plastic_cup', 'piece'),
    ('paper_napkin', 'piece'),
    ('plastic_tray', 'piece'),
    ('ceramic_plate', 'piece'),
    ('ceramic_cup', 'piece'),
    ('cotton_napkin', 'piece'),
    ('wooden_tray', 'piece'),
    ('plastic_wine_glass', 'piece'),
    ('glass_wine_glass', 'piece'),
    ('linen_napkin', 'piece'),
    ('vase_with_flowers', 'piece'),
    ('cake_base', 'piece'),
    ('buttercream_frosting', 'portion'),
    ('fresh_berries', 'bowl'),
    ('fondant', 'portion'),
    ('edible_gold_leaf', 'sheet'),
    ('chocolate_ganache', 'portion'),
    ('cake_board', 'piece'),
    ('edible_flowers', 'bunch')
ON CONFLICT (name) DO NOTHING;

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
    ('napkin', 500),
    ('plastic_plate', 500),
    ('plastic_cup', 300),
    ('paper_napkin', 100),
    ('plastic_tray', 800),
    ('ceramic_plate', 5000),
    ('ceramic_cup', 3000),
    ('cotton_napkin', 800),
    ('wooden_tray', 4000),
    ('plastic_wine_glass', 700),
    ('glass_wine_glass', 3500),
    ('linen_napkin', 1200),
    ('vase_with_flowers', 8000),
    ('cake_base', 12000),
    ('buttercream_frosting', 5000),
    ('fresh_berries', 4500),
    ('fondant', 6000),
    ('edible_gold_leaf', 9000),
    ('chocolate_ganache', 5500),
    ('cake_board', 1500),
    ('edible_flowers', 5000)
ON CONFLICT (ingredient_code) DO UPDATE SET unit_price = EXCLUDED.unit_price;

-- Now insert custom cake recipes after ingredients and pricing exist
INSERT INTO custom_cake_recipes (flavor, size, ingredient_code, quantity) VALUES
    ('vanilla', 'size_1', 'cake_base', 1.0),
    ('vanilla', 'size_1', 'buttercream_frosting', 1.0),
    ('vanilla', 'size_1', 'fresh_berries', 1.0),
    ('vanilla', 'size_1', 'cake_board', 1.0),
    ('vanilla', 'size_2', 'cake_base', 1.5),
    ('vanilla', 'size_2', 'buttercream_frosting', 1.5),
    ('vanilla', 'size_2', 'fresh_berries', 1.2),
    ('vanilla', 'size_2', 'cake_board', 1.0),
    ('vanilla', 'size_3', 'cake_base', 2.0),
    ('vanilla', 'size_3', 'buttercream_frosting', 2.0),
    ('vanilla', 'size_3', 'fresh_berries', 1.5),
    ('vanilla', 'size_3', 'cake_board', 1.0),
    ('chocolate', 'size_1', 'cake_base', 1.0),
    ('chocolate', 'size_1', 'chocolate_ganache', 1.0),
    ('chocolate', 'size_1', 'fondant', 0.5),
    ('chocolate', 'size_1', 'cake_board', 1.0),
    ('chocolate', 'size_2', 'cake_base', 1.5),
    ('chocolate', 'size_2', 'chocolate_ganache', 1.5),
    ('chocolate', 'size_2', 'fondant', 0.8),
    ('chocolate', 'size_2', 'cake_board', 1.0),
    ('chocolate', 'size_3', 'cake_base', 2.0),
    ('chocolate', 'size_3', 'chocolate_ganache', 2.0),
    ('chocolate', 'size_3', 'fondant', 1.0),
    ('chocolate', 'size_3', 'cake_board', 1.0),
    ('red_velvet', 'size_1', 'cake_base', 1.0),
    ('red_velvet', 'size_1', 'buttercream_frosting', 1.0),
    ('red_velvet', 'size_1', 'edible_flowers', 0.5),
    ('red_velvet', 'size_1', 'cake_board', 1.0),
    ('red_velvet', 'size_2', 'cake_base', 1.5),
    ('red_velvet', 'size_2', 'buttercream_frosting', 1.5),
    ('red_velvet', 'size_2', 'edible_flowers', 0.8),
    ('red_velvet', 'size_2', 'cake_board', 1.0),
    ('red_velvet', 'size_3', 'cake_base', 2.0),
    ('red_velvet', 'size_3', 'buttercream_frosting', 2.0),
    ('red_velvet', 'size_3', 'edible_flowers', 1.0),
    ('red_velvet', 'size_3', 'cake_board', 1.0),
    ('green_tea', 'size_1', 'cake_base', 1.0),
    ('green_tea', 'size_1', 'fondant', 0.6),
    ('green_tea', 'size_1', 'fresh_berries', 0.8),
    ('green_tea', 'size_1', 'cake_board', 1.0),
    ('green_tea', 'size_2', 'cake_base', 1.5),
    ('green_tea', 'size_2', 'fondant', 0.9),
    ('green_tea', 'size_2', 'fresh_berries', 1.1),
    ('green_tea', 'size_2', 'cake_board', 1.0),
    ('green_tea', 'size_3', 'cake_base', 2.0),
    ('green_tea', 'size_3', 'fondant', 1.2),
    ('green_tea', 'size_3', 'fresh_berries', 1.4),
    ('green_tea', 'size_3', 'cake_board', 1.0)
ON CONFLICT (flavor, size, ingredient_code) DO NOTHING;

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
    ('valentine', 'simple', 'paper_napkin', 1),
    ('valentine', 'simple', 'plastic_tray', 1),
    ('valentine', 'simple', 'plastic_wine_glass', 1),
    ('valentine', 'simple', 'wine', 1),
    ('valentine', 'simple', 'premium_steak', 1),
    ('valentine', 'grand', 'heart_plate', 1),
    ('valentine', 'grand', 'cupid_decoration', 2),
    ('valentine', 'grand', 'cotton_napkin', 1),
    ('valentine', 'grand', 'wooden_tray', 1),
    ('valentine', 'grand', 'plastic_wine_glass', 1),
    ('valentine', 'grand', 'wine', 1),
    ('valentine', 'grand', 'premium_steak', 1),
    ('valentine', 'deluxe', 'heart_plate', 1),
    ('valentine', 'deluxe', 'cupid_decoration', 3),
    ('valentine', 'deluxe', 'linen_napkin', 2),
    ('valentine', 'deluxe', 'wooden_tray', 1),
    ('valentine', 'deluxe', 'vase_with_flowers', 1),
    ('valentine', 'deluxe', 'glass_wine_glass', 1),
    ('valentine', 'deluxe', 'wine', 1),
    ('valentine', 'deluxe', 'premium_steak', 1),
    ('french', 'simple', 'plastic_plate', 1),
    ('french', 'simple', 'plastic_cup', 1),
    ('french', 'simple', 'paper_napkin', 1),
    ('french', 'simple', 'plastic_tray', 1),
    ('french', 'simple', 'plastic_wine_glass', 1),
    ('french', 'simple', 'coffee', 1),
    ('french', 'simple', 'wine', 1),
    ('french', 'simple', 'fresh_salad', 1),
    ('french', 'simple', 'premium_steak', 1),
    ('french', 'grand', 'ceramic_plate', 1),
    ('french', 'grand', 'ceramic_cup', 1),
    ('french', 'grand', 'cotton_napkin', 1),
    ('french', 'grand', 'wooden_tray', 1),
    ('french', 'grand', 'plastic_wine_glass', 1),
    ('french', 'grand', 'coffee', 1),
    ('french', 'grand', 'wine', 1),
    ('french', 'grand', 'fresh_salad', 1),
    ('french', 'grand', 'premium_steak', 1),
    ('french', 'deluxe', 'ceramic_plate', 1),
    ('french', 'deluxe', 'ceramic_cup', 1),
    ('french', 'deluxe', 'linen_napkin', 1),
    ('french', 'deluxe', 'wooden_tray', 1),
    ('french', 'deluxe', 'vase_with_flowers', 1),
    ('french', 'deluxe', 'glass_wine_glass', 1),
    ('french', 'deluxe', 'coffee', 1),
    ('french', 'deluxe', 'wine', 1),
    ('french', 'deluxe', 'fresh_salad', 1),
    ('french', 'deluxe', 'premium_steak', 1),
    ('english', 'simple', 'plastic_plate', 1),
    ('english', 'simple', 'plastic_cup', 1),
    ('english', 'simple', 'paper_napkin', 1),
    ('english', 'simple', 'plastic_tray', 1),
    ('english', 'simple', 'scrambled_eggs', 1),
    ('english', 'simple', 'bacon', 2),
    ('english', 'simple', 'bread', 1),
    ('english', 'simple', 'premium_steak', 1),
    ('english', 'grand', 'ceramic_plate', 1),
    ('english', 'grand', 'ceramic_cup', 1),
    ('english', 'grand', 'cotton_napkin', 1),
    ('english', 'grand', 'wooden_tray', 1),
    ('english', 'grand', 'scrambled_eggs', 2),
    ('english', 'grand', 'bacon', 3),
    ('english', 'grand', 'bread', 1),
    ('english', 'grand', 'premium_steak', 1),
    ('english', 'deluxe', 'ceramic_plate', 1),
    ('english', 'deluxe', 'ceramic_cup', 1),
    ('english', 'deluxe', 'linen_napkin', 1),
    ('english', 'deluxe', 'wooden_tray', 1),
    ('english', 'deluxe', 'vase_with_flowers', 1),
    ('english', 'deluxe', 'scrambled_eggs', 2),
    ('english', 'deluxe', 'bacon', 4),
    ('english', 'deluxe', 'bread', 2),
    ('english', 'deluxe', 'premium_steak', 1),
    ('champagne', 'grand', 'ceramic_plate', 2),
    ('champagne', 'grand', 'ceramic_cup', 2),
    ('champagne', 'grand', 'cotton_napkin', 2),
    ('champagne', 'grand', 'wooden_tray', 1),
    ('champagne', 'grand', 'plastic_wine_glass', 2),
    ('champagne', 'grand', 'champagne_bottle', 1),
    ('champagne', 'grand', 'baguette', 4),
    ('champagne', 'grand', 'coffee_pot', 1),
    ('champagne', 'grand', 'wine', 1),
    ('champagne', 'grand', 'premium_steak', 2),
    ('champagne', 'deluxe', 'ceramic_plate', 2),
    ('champagne', 'deluxe', 'ceramic_cup', 2),
    ('champagne', 'deluxe', 'linen_napkin', 2),
    ('champagne', 'deluxe', 'wooden_tray', 1),
    ('champagne', 'deluxe', 'vase_with_flowers', 1),
    ('champagne', 'deluxe', 'glass_wine_glass', 2),
    ('champagne', 'deluxe', 'champagne_bottle', 1),
    ('champagne', 'deluxe', 'baguette', 4),
    ('champagne', 'deluxe', 'coffee_pot', 1),
    ('champagne', 'deluxe', 'wine', 1),
    ('champagne', 'deluxe', 'premium_steak', 2),
    ('cake', 'simple', 'cake_base', 1),
    ('cake', 'simple', 'buttercream_frosting', 1),
    ('cake', 'simple', 'fresh_berries', 1),
    ('cake', 'simple', 'cake_board', 1),
    ('cake', 'simple', 'plastic_plate', 1),
    ('cake', 'simple', 'plastic_tray', 1),
    ('cake', 'simple', 'paper_napkin', 1),
    ('cake', 'grand', 'cake_base', 1),
    ('cake', 'grand', 'buttercream_frosting', 1),
    ('cake', 'grand', 'fondant', 1),
    ('cake', 'grand', 'fresh_berries', 1),
    ('cake', 'grand', 'cake_board', 1),
    ('cake', 'grand', 'ceramic_plate', 1),
    ('cake', 'grand', 'ceramic_cup', 1),
    ('cake', 'grand', 'cotton_napkin', 1),
    ('cake', 'grand', 'wooden_tray', 1),
    ('cake', 'deluxe', 'cake_base', 1),
    ('cake', 'deluxe', 'buttercream_frosting', 1),
    ('cake', 'deluxe', 'fondant', 1),
    ('cake', 'deluxe', 'edible_gold_leaf', 1),
    ('cake', 'deluxe', 'chocolate_ganache', 1),
    ('cake', 'deluxe', 'edible_flowers', 1),
    ('cake', 'deluxe', 'cake_board', 1),
    ('cake', 'deluxe', 'ceramic_plate', 1),
    ('cake', 'deluxe', 'ceramic_cup', 1),
    ('cake', 'deluxe', 'linen_napkin', 1),
    ('cake', 'deluxe', 'wooden_tray', 1),
    ('cake', 'deluxe', 'vase_with_flowers', 1)
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

CREATE TABLE IF NOT EXISTS customer_inquiries (
    inquiry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    topic TEXT NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NEW',
    manager_note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_inquiries_status
    ON customer_inquiries(status);

CREATE TABLE IF NOT EXISTS event_promotions (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image_path TEXT,
    discount_label TEXT,
    start_date DATE,
    end_date DATE,
    tags JSONB DEFAULT '[]'::jsonb,
    is_published BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_promotions_published
    ON event_promotions(is_published);

CREATE TABLE IF NOT EXISTS event_menu_discounts (
    event_id UUID NOT NULL REFERENCES event_promotions(event_id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(menu_item_id) ON DELETE CASCADE,
    discount_type VARCHAR(16) NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value >= 0),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (event_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_event_menu_discounts_menu
    ON event_menu_discounts(menu_item_id);

INSERT INTO event_promotions (title, description, image_path, discount_label, start_date, end_date, tags, is_published)
VALUES (
    '미스터 대박 크리스마스 갈라',
    '프리미엄 크리스마스 코스와 커스텀 케이크를 결합한 연말 한정 이벤트입니다. 전 메뉴 20% 할인과 샴페인 업그레이드를 제공합니다.',
    '/images/christmas_event.jpg',
    'Holiday 20% 할인',
    DATE '2024-12-01',
    DATE '2024-12-31',
    '["시즌한정", "연말", "프리미엄"]'::jsonb,
    TRUE
)
ON CONFLICT DO NOTHING;

INSERT INTO customer_inquiries (name, email, topic, message, status)
VALUES (
    'Demo User',
    'demo@example.com',
    '서비스 문의',
    '이것은 초기화 시 삽입되는 샘플 문의입니다.',
    'RESOLVED'
)
ON CONFLICT DO NOTHING;

INSERT INTO store_inventory (store_id, ingredient_id, quantity_on_hand)
SELECT s.store_id, i.ingredient_id, 50
FROM stores s CROSS JOIN ingredients i
WHERE s.name = 'Main Kitchen'
ON CONFLICT DO NOTHING;

INSERT INTO users (email, password_hash, name, phone_number, address, user_type)
VALUES
    ('customer@example.com', '$2b$12$aEbAF9Kz1Jf3dIisBQ3Nyut/cs6s1ChfF6MJxk1HKSlVu0m77eDmi', 'Demo Customer', '010-1000-2000', 'Seoul', 'CUSTOMER'),
    ('delivery@example.com', '$2b$12$aEbAF9Kz1Jf3dIisBQ3Nyut/cs6s1ChfF6MJxk1HKSlVu0m77eDmi', 'Demo Delivery', '010-4000-5000', 'Seoul', 'STAFF'),
    ('cook@example.com', '$2b$12$aEbAF9Kz1Jf3dIisBQ3Nyut/cs6s1ChfF6MJxk1HKSlVu0m77eDmi', 'Demo Cook', '010-6000-7000', 'Seoul', 'STAFF'),
    ('manager@example.com', '$2b$12$aEbAF9Kz1Jf3dIisBQ3Nyut/cs6s1ChfF6MJxk1HKSlVu0m77eDmi', 'Demo Manager', '010-5000-6000', 'Seoul', 'MANAGER')
ON CONFLICT (email) DO NOTHING;


-- 직원 상세 정보 추가 (요리사 - COOK) - cook@example.com
INSERT INTO staff_details (staff_id, store_id, position, salary, permissions)
SELECT u.user_id, s.store_id, 'COOK', 3500000, '{"cook": true, "cooking_start": true, "cooking_complete": true}'::jsonb
FROM users u
JOIN stores s ON s.name = 'Main Kitchen'
WHERE u.email = 'cook@example.com'
ON CONFLICT (staff_id) DO NOTHING;

-- 직원 상세 정보 추가 (배달원 - DELIVERY)
INSERT INTO staff_details (staff_id, store_id, position, salary, permissions)
SELECT u.user_id, s.store_id, 'DELIVERY', 2800000, '{"delivery": true, "delivery_start": true, "delivery_complete": true}'::jsonb
FROM users u
JOIN stores s ON s.name = 'Main Kitchen'
WHERE u.email = 'delivery@example.com'
ON CONFLICT (staff_id) DO NOTHING;
