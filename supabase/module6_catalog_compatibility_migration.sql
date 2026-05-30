      -- ============================================================
      -- MODULE 6: CATEGORIES, BRANDS & MOTORCYCLE COMPATIBILITY
      -- Enhancements for engine type master data and product grouping
      -- ============================================================

      BEGIN;

      CREATE TABLE IF NOT EXISTS engine_types (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name             TEXT NOT NULL UNIQUE,
        code             TEXT UNIQUE,
        description      TEXT,
        displacement_cc  INT,
        cooling_type     TEXT,
        is_active        BOOLEAN DEFAULT TRUE,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS product_groups (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        TEXT NOT NULL UNIQUE,
        code        TEXT UNIQUE,
        description TEXT,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE motorcycle_models
        ADD COLUMN IF NOT EXISTS engine_type_id UUID REFERENCES engine_types(id);

      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS product_group_id UUID REFERENCES product_groups(id);

      INSERT INTO engine_types (name, code, description, displacement_cc, cooling_type)
      SELECT seed.name, seed.code, seed.description, seed.displacement_cc::INT, seed.cooling_type
      FROM (
        VALUES
          ('2-Stroke', '2T', 'Traditional 2-stroke engine applications', NULL::INT, NULL::TEXT),
          ('4-Stroke', '4T', 'Traditional 4-stroke engine applications', NULL::INT, NULL::TEXT),
          ('Single Cylinder', '1CYL', 'Single-cylinder motorcycle engines', NULL::INT, NULL::TEXT),
          ('Parallel Twin', 'PTWIN', 'Parallel twin-cylinder engines', NULL::INT, NULL::TEXT),
          ('Liquid Cooled', 'LIQ', 'Liquid cooled engines and model variants', NULL::INT, 'liquid'),
          ('Air Cooled', 'AIR', 'Air cooled engines and model variants', NULL::INT, 'air')
      ) AS seed(name, code, description, displacement_cc, cooling_type)
      WHERE NOT EXISTS (
        SELECT 1
        FROM engine_types existing
        WHERE existing.name = seed.name
      );

      INSERT INTO engine_types (name, code, description)
      SELECT DISTINCT
        trimmed_name,
        UPPER(LEFT(REGEXP_REPLACE(trimmed_name, '[^a-zA-Z0-9]+', '', 'g'), 12)),
        'Imported from existing motorcycle model records'
      FROM (
        SELECT BTRIM(engine_type) AS trimmed_name
        FROM motorcycle_models
        WHERE engine_type IS NOT NULL
      ) existing_types
      WHERE trimmed_name <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM engine_types existing
          WHERE existing.name = existing_types.trimmed_name
        );

      UPDATE motorcycle_models model
      SET engine_type_id = engine.id
      FROM engine_types engine
      WHERE model.engine_type_id IS NULL
        AND model.engine_type IS NOT NULL
        AND BTRIM(model.engine_type) <> ''
        AND engine.name = BTRIM(model.engine_type);

      INSERT INTO categories (name, parent_id, sort_order, is_active)
      SELECT seed.name, NULL, seed.sort_order, TRUE
      FROM (
        VALUES
          ('Engine Parts', 10),
          ('Brake System', 20),
          ('Tires & Tubes', 30),
          ('Electrical Parts', 40),
          ('Lights & Signal', 50),
          ('Chains & Sprockets', 60),
          ('Oils & Lubricants', 70),
          ('Body Parts', 80),
          ('Accessories', 90),
          ('Tools', 100),
          ('Batteries', 110),
          ('Cables', 120),
          ('Bearings', 130),
          ('Suspension Parts', 140)
      ) AS seed(name, sort_order)
      WHERE NOT EXISTS (
        SELECT 1
        FROM categories existing
        WHERE existing.parent_id IS NULL
          AND LOWER(existing.name) = LOWER(seed.name)
      );

      CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
      CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
      CREATE INDEX IF NOT EXISTS idx_motorcycle_models_engine_type_id ON motorcycle_models(engine_type_id);
      CREATE INDEX IF NOT EXISTS idx_products_product_group_id ON products(product_group_id);
      CREATE INDEX IF NOT EXISTS idx_product_compatibility_product_id ON product_compatibility(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_compatibility_motorcycle_model_id ON product_compatibility(motorcycle_model_id);

      ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
      ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
      ALTER TABLE engine_types ENABLE ROW LEVEL SECURITY;
      ALTER TABLE motorcycle_models ENABLE ROW LEVEL SECURITY;
      ALTER TABLE product_compatibility ENABLE ROW LEVEL SECURITY;
      ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "categories_select" ON categories;
      DROP POLICY IF EXISTS "categories_insert" ON categories;
      DROP POLICY IF EXISTS "categories_update" ON categories;
      DROP POLICY IF EXISTS "categories_delete" ON categories;
      DROP POLICY IF EXISTS "brands_select" ON brands;
      DROP POLICY IF EXISTS "brands_insert" ON brands;
      DROP POLICY IF EXISTS "brands_update" ON brands;
      DROP POLICY IF EXISTS "brands_delete" ON brands;
      DROP POLICY IF EXISTS "engine_types_select" ON engine_types;
      DROP POLICY IF EXISTS "engine_types_insert" ON engine_types;
      DROP POLICY IF EXISTS "engine_types_update" ON engine_types;
      DROP POLICY IF EXISTS "engine_types_delete" ON engine_types;
      DROP POLICY IF EXISTS "motorcycle_models_select" ON motorcycle_models;
      DROP POLICY IF EXISTS "motorcycle_models_insert" ON motorcycle_models;
      DROP POLICY IF EXISTS "motorcycle_models_update" ON motorcycle_models;
      DROP POLICY IF EXISTS "motorcycle_models_delete" ON motorcycle_models;
      DROP POLICY IF EXISTS "product_compatibility_select" ON product_compatibility;
      DROP POLICY IF EXISTS "product_compatibility_insert" ON product_compatibility;
      DROP POLICY IF EXISTS "product_compatibility_update" ON product_compatibility;
      DROP POLICY IF EXISTS "product_compatibility_delete" ON product_compatibility;
      DROP POLICY IF EXISTS "product_groups_select" ON product_groups;
      DROP POLICY IF EXISTS "product_groups_insert" ON product_groups;
      DROP POLICY IF EXISTS "product_groups_update" ON product_groups;
      DROP POLICY IF EXISTS "product_groups_delete" ON product_groups;

      CREATE POLICY "categories_select" ON categories
        FOR SELECT
        USING (
          auth.uid() IS NOT NULL
          AND (
            public.has_permission('inventory', 'view')
            OR public.has_permission('pos', 'view')
            OR public.has_permission('purchasing', 'view')
          )
        );

      CREATE POLICY "categories_insert" ON categories
        FOR INSERT
        WITH CHECK (
          public.has_permission('inventory', 'create')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "categories_update" ON categories
        FOR UPDATE
        USING (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        )
        WITH CHECK (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "categories_delete" ON categories
        FOR DELETE
        USING (
          public.has_permission('inventory', 'delete')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "brands_select" ON brands
        FOR SELECT
        USING (
          auth.uid() IS NOT NULL
          AND (
            public.has_permission('inventory', 'view')
            OR public.has_permission('pos', 'view')
            OR public.has_permission('purchasing', 'view')
          )
        );

      CREATE POLICY "brands_insert" ON brands
        FOR INSERT
        WITH CHECK (
          public.has_permission('inventory', 'create')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "brands_update" ON brands
        FOR UPDATE
        USING (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        )
        WITH CHECK (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "brands_delete" ON brands
        FOR DELETE
        USING (
          public.has_permission('inventory', 'delete')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "engine_types_select" ON engine_types
        FOR SELECT
        USING (
          auth.uid() IS NOT NULL
          AND (
            public.has_permission('inventory', 'view')
            OR public.has_permission('pos', 'view')
            OR public.has_permission('customers', 'view')
          )
        );

      CREATE POLICY "engine_types_insert" ON engine_types
        FOR INSERT
        WITH CHECK (
          public.has_permission('inventory', 'create')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "engine_types_update" ON engine_types
        FOR UPDATE
        USING (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        )
        WITH CHECK (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "engine_types_delete" ON engine_types
        FOR DELETE
        USING (
          public.has_permission('inventory', 'delete')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "motorcycle_models_select" ON motorcycle_models
        FOR SELECT
        USING (
          auth.uid() IS NOT NULL
          AND (
            public.has_permission('inventory', 'view')
            OR public.has_permission('pos', 'view')
            OR public.has_permission('customers', 'view')
          )
        );

      CREATE POLICY "motorcycle_models_insert" ON motorcycle_models
        FOR INSERT
        WITH CHECK (
          public.has_permission('inventory', 'create')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "motorcycle_models_update" ON motorcycle_models
        FOR UPDATE
        USING (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        )
        WITH CHECK (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "motorcycle_models_delete" ON motorcycle_models
        FOR DELETE
        USING (
          public.has_permission('inventory', 'delete')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "product_compatibility_select" ON product_compatibility
        FOR SELECT
        USING (
          auth.uid() IS NOT NULL
          AND (
            public.has_permission('inventory', 'view')
            OR public.has_permission('pos', 'view')
          )
        );

      CREATE POLICY "product_compatibility_insert" ON product_compatibility
        FOR INSERT
        WITH CHECK (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "product_compatibility_update" ON product_compatibility
        FOR UPDATE
        USING (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        )
        WITH CHECK (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "product_compatibility_delete" ON product_compatibility
        FOR DELETE
        USING (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "product_groups_select" ON product_groups
        FOR SELECT
        USING (
          auth.uid() IS NOT NULL
          AND (
            public.has_permission('inventory', 'view')
            OR public.has_permission('pos', 'view')
            OR public.has_permission('purchasing', 'view')
          )
        );

      CREATE POLICY "product_groups_insert" ON product_groups
        FOR INSERT
        WITH CHECK (
          public.has_permission('inventory', 'create')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "product_groups_update" ON product_groups
        FOR UPDATE
        USING (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        )
        WITH CHECK (
          public.has_permission('inventory', 'edit')
          OR public.has_permission('inventory', 'manage')
        );

      CREATE POLICY "product_groups_delete" ON product_groups
        FOR DELETE
        USING (
          public.has_permission('inventory', 'delete')
          OR public.has_permission('inventory', 'manage')
        );

      COMMIT;
