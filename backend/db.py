import asyncpg
import os
import logging
import uuid
from datetime import datetime

logger = logging.getLogger(__name__)

pool: asyncpg.Pool = None


def record_to_dict(record):
    """Convert asyncpg Record to JSON-serializable dict"""
    d = dict(record)
    for k, v in d.items():
        if isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


def records_to_list(records):
    return [record_to_dict(r) for r in records]


async def get_pool():
    global pool
    if pool is None:
        dsn = os.environ.get('PG_URL', '')
        if dsn.startswith('postgres://'):
            dsn = dsn.replace('postgres://', 'postgresql://', 1)
        pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10, command_timeout=30)
    return pool


async def close_pool():
    global pool
    if pool:
        await pool.close()
        pool = None


async def init_database():
    """Initialize CRM schema, tables, and views"""
    p = await get_pool()
    async with p.acquire() as conn:
        # 0) Extensions
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

        # 1) Schema
        await conn.execute("CREATE SCHEMA IF NOT EXISTS crm;")

        # Auth table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.usuario (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                nombre TEXT,
                rol TEXT DEFAULT 'vendedor',
                created_at TIMESTAMPTZ DEFAULT now()
            );
        """)

        # 2.1) producto_aprobado
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.producto_aprobado (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                product_tmpl_odoo_id INT NOT NULL,
                aprobado BOOLEAN NOT NULL DEFAULT TRUE,
                motivo TEXT NULL,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                UNIQUE(product_tmpl_odoo_id)
            );
        """)

        # 2.2) partner_principal_override
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.partner_principal_override (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                contacto_partner_odoo_id INT NOT NULL,
                cuenta_partner_odoo_id INT NOT NULL,
                nota TEXT NULL,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                UNIQUE(contacto_partner_odoo_id)
            );
        """)

        # 2.3) cuenta
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.cuenta (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cuenta_partner_odoo_id INT NOT NULL,
                estado_comercial TEXT NOT NULL DEFAULT 'ACTIVO',
                clasificacion TEXT NULL,
                notas TEXT NULL,
                asignado_a TEXT NULL,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                UNIQUE(cuenta_partner_odoo_id)
            );
        """)

        # 2.4) contacto
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.contacto (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                contacto_partner_odoo_id INT NOT NULL,
                cuenta_partner_odoo_id INT NOT NULL,
                rol TEXT NULL,
                whatsapp TEXT NULL,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                UNIQUE(contacto_partner_odoo_id)
            );
        """)

        # 2.5) interaccion
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.interaccion (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cuenta_id UUID NOT NULL REFERENCES crm.cuenta(id),
                contacto_id UUID NULL REFERENCES crm.contacto(id),
                tipo TEXT NOT NULL,
                fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
                resumen TEXT NOT NULL,
                resultado TEXT NULL,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_interaccion_cuenta_fecha 
            ON crm.interaccion (cuenta_id, fecha DESC);
        """)

        # 2.6) tarea
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.tarea (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cuenta_id UUID NOT NULL REFERENCES crm.cuenta(id),
                contacto_id UUID NULL REFERENCES crm.contacto(id),
                tipo TEXT NOT NULL,
                due_at TIMESTAMPTZ NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDIENTE',
                prioridad INT DEFAULT 3,
                descripcion TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now(),
                done_at TIMESTAMPTZ NULL
            );
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tarea_status_due 
            ON crm.tarea (status, due_at);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tarea_cuenta 
            ON crm.tarea (cuenta_id);
        """)

        logger.info("CRM tables created successfully")

        # 3) Views - these depend on odoo schema
        await _create_views(conn)


async def _create_views(conn):
    """Create CRM views that read from odoo schema. Each view is wrapped in try/except."""

    # First, check what exists in odoo schema
    odoo_tables = []
    try:
        rows = await conn.fetch("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'odoo' AND table_type IN ('BASE TABLE', 'VIEW')
        """)
        odoo_tables = [r['table_name'] for r in rows]
        logger.info(f"Odoo tables/views found: {len(odoo_tables)}")
        logger.info(f"Odoo objects: {odoo_tables[:30]}...")
    except Exception as e:
        logger.warning(f"Could not query odoo schema: {e}")
        return

    # 3.1) v_partner_account_final - MUST cover ALL odoo partners
    try:
        if 'v_partner_account_map' in odoo_tables:
            await conn.execute("""
                CREATE OR REPLACE VIEW crm.v_partner_account_final AS
                SELECT 
                    p.odoo_id as contacto_partner_odoo_id,
                    COALESCE(
                        ov.cuenta_partner_odoo_id,
                        mp.cuenta_partner_id,
                        p.odoo_id
                    ) as cuenta_partner_odoo_id
                FROM odoo.res_partner p
                LEFT JOIN crm.partner_principal_override ov 
                    ON ov.contacto_partner_odoo_id = p.odoo_id
                LEFT JOIN odoo.v_partner_account_map mp 
                    ON mp.contacto_partner_id = p.odoo_id
                WHERE p.company_key = 'GLOBAL'
                  AND COALESCE(p.active, true) = true;
            """)
            logger.info("View crm.v_partner_account_final created (ALL odoo partners)")
        else:
            await conn.execute("""
                CREATE OR REPLACE VIEW crm.v_partner_account_final AS
                SELECT 
                    p.odoo_id as contacto_partner_odoo_id,
                    COALESCE(
                        ov.cuenta_partner_odoo_id,
                        p.odoo_id
                    ) as cuenta_partner_odoo_id
                FROM odoo.res_partner p
                LEFT JOIN crm.partner_principal_override ov 
                    ON ov.contacto_partner_odoo_id = p.odoo_id
                WHERE p.company_key = 'GLOBAL'
                  AND COALESCE(p.active, true) = true;
            """)
            logger.info("View crm.v_partner_account_final created (no odoo map)")
    except Exception as e:
        logger.warning(f"Could not create v_partner_account_final: {e}")

    # 3.1b) v_cuentas_libres - partners whose principal IS themselves
    try:
        await conn.execute("""
            CREATE OR REPLACE VIEW crm.v_cuentas_libres AS
            SELECT
                p.odoo_id AS cuenta_partner_odoo_id
            FROM odoo.res_partner p
            JOIN crm.v_partner_account_final m
                ON m.contacto_partner_odoo_id = p.odoo_id
            WHERE p.company_key = 'GLOBAL'
                AND COALESCE(p.active, true) = true
                AND m.cuenta_partner_odoo_id = p.odoo_id;
        """)
        logger.info("View crm.v_cuentas_libres created")
    except Exception as e:
        logger.warning(f"Could not create v_cuentas_libres: {e}")

    # 3.1c) v_contactos_vinculados - partners whose principal is NOT themselves
    try:
        await conn.execute("""
            CREATE OR REPLACE VIEW crm.v_contactos_vinculados AS
            SELECT
                p.odoo_id AS contacto_partner_odoo_id,
                m.cuenta_partner_odoo_id
            FROM odoo.res_partner p
            JOIN crm.v_partner_account_final m
                ON m.contacto_partner_odoo_id = p.odoo_id
            WHERE p.company_key = 'GLOBAL'
                AND COALESCE(p.active, true) = true
                AND m.cuenta_partner_odoo_id <> p.odoo_id;
        """)
        logger.info("View crm.v_contactos_vinculados created")
    except Exception as e:
        logger.warning(f"Could not create v_contactos_vinculados: {e}")

    # 3.1d) v_catalogo_con_stock - eligible products with stock, grouped by template (tiendas only)
    try:
        has_stock_loc_d = 'v_stock_by_product_location' in odoo_tables
        has_stock_loc_sl = 'stock_location' in odoo_tables
        if has_stock_loc_d and has_stock_loc_sl and 'v_product_variant_flat' in odoo_tables and 'product_template' in odoo_tables:
            await conn.execute("""
                CREATE OR REPLACE VIEW crm.v_catalogo_con_stock AS
                SELECT
                    pt.odoo_id as product_tmpl_id,
                    pt.name as nombre,
                    pt.marca,
                    pt.tipo,
                    pt.tela,
                    pt.entalle,
                    pt.tel,
                    pt.hilo,
                    pt.list_price,
                    SUM(s.available_qty) as stock_total_disponible,
                    COUNT(DISTINCT vv.product_product_id) as variantes_con_stock
                FROM odoo.v_stock_by_product_location s
                JOIN odoo.stock_location sl
                    ON sl.odoo_id = s.location_id
                    AND sl.usage = 'internal'
                    AND COALESCE(sl.active, true) = true
                    AND sl.x_nombre IS NOT NULL
                    AND btrim(sl.x_nombre) <> ''
                JOIN odoo.v_product_variant_flat vv
                    ON vv.company_key = 'GLOBAL' AND vv.product_product_id = s.product_id
                JOIN odoo.product_template pt
                    ON pt.company_key = 'GLOBAL' AND pt.odoo_id = vv.product_tmpl_id
                WHERE s.available_qty > 0
                    AND pt.sale_ok = true
                    AND pt.purchase_ok = false
                    AND pt.name NOT ILIKE '%correa%'
                    AND pt.name NOT ILIKE '%saco%'
                    AND pt.name NOT ILIKE '%bolsa%'
                GROUP BY pt.odoo_id, pt.name, pt.marca, pt.tipo, pt.tela,
                         pt.entalle, pt.tel, pt.hilo, pt.list_price;
            """)
            logger.info("View crm.v_catalogo_con_stock created (tiendas only)")
        else:
            logger.warning("Missing tables for v_catalogo_con_stock")
    except Exception as e:
        logger.warning(f"Could not create v_catalogo_con_stock: {e}")

    # 3.1e) v_catalogo_con_stock_variantes - variant-level stock detail (tiendas only, aggregated)
    try:
        has_stock_loc_e = 'v_stock_by_product_location' in odoo_tables
        has_stock_loc_sl_e = 'stock_location' in odoo_tables
        if has_stock_loc_e and has_stock_loc_sl_e and 'v_product_variant_flat' in odoo_tables and 'product_template' in odoo_tables:
            await conn.execute("""
                CREATE OR REPLACE VIEW crm.v_catalogo_con_stock_variantes AS
                SELECT
                    vv.product_tmpl_id,
                    vv.product_product_id,
                    vv.barcode,
                    vv.talla,
                    vv.color,
                    SUM(s.available_qty) as available_qty,
                    SUM(s.qty) as stock_total,
                    SUM(s.reserved_qty) as reserved_qty
                FROM odoo.v_stock_by_product_location s
                JOIN odoo.stock_location sl
                    ON sl.odoo_id = s.location_id
                    AND sl.usage = 'internal'
                    AND COALESCE(sl.active, true) = true
                    AND sl.x_nombre IS NOT NULL
                    AND btrim(sl.x_nombre) <> ''
                JOIN odoo.v_product_variant_flat vv
                    ON vv.company_key = 'GLOBAL' AND vv.product_product_id = s.product_id
                JOIN odoo.product_template pt
                    ON pt.company_key = 'GLOBAL' AND pt.odoo_id = vv.product_tmpl_id
                WHERE s.available_qty > 0
                    AND pt.sale_ok = true
                    AND pt.purchase_ok = false
                    AND pt.name NOT ILIKE '%correa%'
                    AND pt.name NOT ILIKE '%saco%'
                    AND pt.name NOT ILIKE '%bolsa%'
                GROUP BY vv.product_tmpl_id, vv.product_product_id, vv.barcode, vv.talla, vv.color;
            """)
            logger.info("View crm.v_catalogo_con_stock_variantes created (tiendas only)")
        else:
            logger.warning("Missing tables for v_catalogo_con_stock_variantes")
    except Exception as e:
        logger.warning(f"Could not create v_catalogo_con_stock_variantes: {e}")

    # 3.1f) v_catalogo_con_stock_variantes_loc - variant stock by location (tiendas only)
    try:
        has_stock_loc = 'v_stock_by_product_location' in odoo_tables
        has_stock_loc_sl_f = 'stock_location' in odoo_tables
        if has_stock_loc and has_stock_loc_sl_f and 'v_product_variant_flat' in odoo_tables and 'product_template' in odoo_tables:
            await conn.execute("""
                CREATE OR REPLACE VIEW crm.v_catalogo_con_stock_variantes_loc AS
                SELECT
                    vv.product_tmpl_id,
                    vv.product_product_id,
                    vv.barcode,
                    vv.talla,
                    vv.color,
                    s.location_id,
                    sl.x_nombre as tienda,
                    s.available_qty,
                    s.qty as stock_total,
                    s.reserved_qty
                FROM odoo.v_stock_by_product_location s
                JOIN odoo.stock_location sl
                    ON sl.odoo_id = s.location_id
                    AND sl.usage = 'internal'
                    AND COALESCE(sl.active, true) = true
                    AND sl.x_nombre IS NOT NULL
                    AND btrim(sl.x_nombre) <> ''
                JOIN odoo.v_product_variant_flat vv
                    ON vv.company_key = 'GLOBAL' AND vv.product_product_id = s.product_id
                JOIN odoo.product_template pt
                    ON pt.company_key = 'GLOBAL' AND pt.odoo_id = vv.product_tmpl_id
                WHERE s.available_qty > 0
                    AND pt.sale_ok = true
                    AND pt.purchase_ok = false
                    AND pt.name NOT ILIKE '%correa%'
                    AND pt.name NOT ILIKE '%saco%'
                    AND pt.name NOT ILIKE '%bolsa%';
            """)
            logger.info("View crm.v_catalogo_con_stock_variantes_loc created (tiendas only)")
        else:
            logger.warning("Missing tables for v_catalogo_con_stock_variantes_loc")
    except Exception as e:
        logger.warning(f"Could not create v_catalogo_con_stock_variantes_loc: {e}")

    # 3.2) v_productos_elegibles
    try:
        if 'product_template' in odoo_tables:
            # Check available columns
            cols = await conn.fetch("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_schema = 'odoo' AND table_name = 'product_template'
            """)
            col_names = [c['column_name'] for c in cols]
            logger.info(f"product_template columns: {col_names}")

            has_marca = 'x_marca' in col_names or 'marca' in col_names
            has_tipo = 'x_tipo' in col_names or 'tipo' in col_names
            has_tela = 'x_tela' in col_names or 'tela' in col_names
            has_entalle = 'x_entalle' in col_names or 'entalle' in col_names
            has_tel = 'x_tel' in col_names or 'tel' in col_names
            has_hilo = 'x_hilo' in col_names or 'hilo' in col_names
            has_company_key = 'company_key' in col_names

            marca_col = 'x_marca' if 'x_marca' in col_names else ('marca' if 'marca' in col_names else "NULL")
            tipo_col = 'x_tipo' if 'x_tipo' in col_names else ('tipo' if 'tipo' in col_names else "NULL")
            tela_col = 'x_tela' if 'x_tela' in col_names else ('tela' if 'tela' in col_names else "NULL")
            entalle_col = 'x_entalle' if 'x_entalle' in col_names else ('entalle' if 'entalle' in col_names else "NULL")
            tel_col = 'x_tel' if 'x_tel' in col_names else ('tel' if 'tel' in col_names else "NULL")
            hilo_col = 'x_hilo' if 'x_hilo' in col_names else ('hilo' if 'hilo' in col_names else "NULL")

            sale_ok_filter = "AND sale_ok = true" if 'sale_ok' in col_names else ""
            purchase_ok_filter = "AND purchase_ok = false" if 'purchase_ok' in col_names else ""
            active_filter = "AND COALESCE(active, true) = true" if 'active' in col_names else ""
            company_filter = "AND company_key = 'GLOBAL'" if has_company_key else ""
            write_date_col = 'write_date' if 'write_date' in col_names else 'NULL'

            view_sql = f"""
                CREATE OR REPLACE VIEW crm.v_productos_elegibles AS
                SELECT 
                    odoo_id,
                    name,
                    {marca_col} as marca,
                    {tipo_col} as tipo,
                    {tela_col} as tela,
                    {entalle_col} as entalle,
                    {tel_col} as tel,
                    {hilo_col} as hilo,
                    list_price,
                    {write_date_col} as odoo_write_date
                FROM odoo.product_template
                WHERE 1=1
                    {company_filter}
                    {sale_ok_filter}
                    {purchase_ok_filter}
                    {active_filter}
                    AND name NOT ILIKE '%correa%'
                    AND name NOT ILIKE '%bolsa%'
                    AND name NOT ILIKE '%saco%';
            """
            await conn.execute(view_sql)
            logger.info("View crm.v_productos_elegibles created")
        else:
            logger.warning("odoo.product_template not found, skipping v_productos_elegibles")
    except Exception as e:
        logger.warning(f"Could not create v_productos_elegibles: {e}")

    # 3.3) v_productos_crm (only approved)
    try:
        await conn.execute("""
            CREATE OR REPLACE VIEW crm.v_productos_crm AS
            SELECT e.*
            FROM crm.v_productos_elegibles e
            INNER JOIN crm.producto_aprobado p 
                ON p.product_tmpl_odoo_id = e.odoo_id AND p.aprobado = true;
        """)
        logger.info("View crm.v_productos_crm created")
    except Exception as e:
        logger.warning(f"Could not create v_productos_crm: {e}")

    # 3.4) v_ventas_pos_filtradas - complex view
    try:
        has_v_pos_line_full = 'v_pos_line_full' in odoo_tables
        has_pos_order_line = 'pos_order_line' in odoo_tables
        has_pos_order = 'pos_order' in odoo_tables
        has_variant_flat = 'v_product_variant_flat' in odoo_tables

        if has_v_pos_line_full:
            # Use the existing view
            vpl_cols = await conn.fetch("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_schema = 'odoo' AND table_name = 'v_pos_line_full'
            """)
            vpl_col_names = [c['column_name'] for c in vpl_cols]
            logger.info(f"v_pos_line_full columns: {vpl_col_names[:20]}")

            # Build the view using v_pos_line_full
            # Detect actual column names
            partner_col = next((c for c in ['contacto_partner_id', 'partner_id'] if c in vpl_col_names), None)
            tmpl_col = next((c for c in ['product_tmpl_id'] if c in vpl_col_names), None)
            cuenta_col = next((c for c in ['cuenta_partner_id'] if c in vpl_col_names), None)

            if not partner_col or not tmpl_col:
                logger.warning(f"v_pos_line_full missing required columns. partner={partner_col}, tmpl={tmpl_col}")
            else:
                # Use COALESCE for cuenta: override > existing cuenta_partner_id > self
                cuenta_expr = f"COALESCE(f.cuenta_partner_odoo_id, vpl.{cuenta_col})" if cuenta_col else "f.cuenta_partner_odoo_id"
                await conn.execute(f"""
                    CREATE OR REPLACE VIEW crm.v_ventas_pos_filtradas AS
                    SELECT 
                        vpl.*,
                        {cuenta_expr} as cuenta_partner_id_final
                    FROM odoo.v_pos_line_full vpl
                    LEFT JOIN crm.v_partner_account_final f 
                        ON f.contacto_partner_odoo_id = vpl.{partner_col}
                    WHERE vpl.{tmpl_col} IN (
                        SELECT product_tmpl_odoo_id FROM crm.producto_aprobado WHERE aprobado = true
                    );
                """)
                logger.info("View crm.v_ventas_pos_filtradas created (from v_pos_line_full)")

        elif has_pos_order_line and has_pos_order:
            # Build from base tables
            pol_cols = await conn.fetch("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_schema = 'odoo' AND table_name = 'pos_order_line'
            """)
            pol_col_names = [c['column_name'] for c in pol_cols]

            po_cols = await conn.fetch("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_schema = 'odoo' AND table_name = 'pos_order'
            """)
            po_col_names = [c['column_name'] for c in po_cols]

            logger.info(f"pos_order_line cols: {pol_col_names[:20]}")
            logger.info(f"pos_order cols: {po_col_names[:20]}")

            has_company_key_pol = 'company_key' in pol_col_names
            has_company_key_po = 'company_key' in po_col_names
            has_is_cancel = 'is_cancel' in po_col_names
            has_order_cancel = 'order_cancel' in po_col_names

            company_join = "o.company_key = l.company_key AND" if has_company_key_pol and has_company_key_po else ""
            company_select = "l.company_key," if has_company_key_pol else "'UNKNOWN' as company_key,"
            is_cancelled_expr = f"(COALESCE(o.is_cancel, false) OR COALESCE(o.order_cancel, false))" if has_is_cancel or has_order_cancel else "false"

            order_id_col = 'order_id' if 'order_id' in pol_col_names else 'odoo_id'
            partner_id_col = 'partner_id' if 'partner_id' in po_col_names else 'NULL'
            x_cliente_principal_col = 'x_cliente_principal' if 'x_cliente_principal' in po_col_names else 'NULL'

            variant_join = ""
            variant_select = ""
            template_join = ""
            template_select = ""
            tmpl_filter = ""

            if has_variant_flat:
                vv_cols = await conn.fetch("""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_schema = 'odoo' AND table_name = 'v_product_variant_flat'
                """)
                vv_col_names = [c['column_name'] for c in vv_cols]

                pp_id = 'product_product_id' if 'product_product_id' in vv_col_names else 'odoo_id'
                tmpl_id = 'product_tmpl_id' if 'product_tmpl_id' in vv_col_names else 'NULL'
                barcode_col = 'barcode' if 'barcode' in vv_col_names else 'NULL'
                talla_col = 'talla' if 'talla' in vv_col_names else ('x_talla' if 'x_talla' in vv_col_names else 'NULL')
                color_col = 'color' if 'color' in vv_col_names else ('x_color' if 'x_color' in vv_col_names else 'NULL')

                vv_ck = "vv.company_key = 'GLOBAL' AND" if 'company_key' in vv_col_names else ""
                variant_join = f"LEFT JOIN odoo.v_product_variant_flat vv ON {vv_ck} vv.{pp_id} = l.product_id"
                variant_select = f"vv.{tmpl_id} as product_tmpl_id, vv.{barcode_col} as barcode, vv.{talla_col} as talla, vv.{color_col} as color,"
                tmpl_filter = f"AND vv.{tmpl_id} IN (SELECT product_tmpl_odoo_id FROM crm.producto_aprobado WHERE aprobado = true)"
            
            if 'product_template' in odoo_tables and has_variant_flat:
                pt_cols = await conn.fetch("""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_schema = 'odoo' AND table_name = 'product_template'
                """)
                pt_col_names = [c['column_name'] for c in pt_cols]
                pt_ck = "pt.company_key = 'GLOBAL' AND" if 'company_key' in pt_col_names else ""
                marca_col = 'x_marca' if 'x_marca' in pt_col_names else ('marca' if 'marca' in pt_col_names else 'NULL')
                tipo_col = 'x_tipo' if 'x_tipo' in pt_col_names else ('tipo' if 'tipo' in pt_col_names else 'NULL')
                tela_col = 'x_tela' if 'x_tela' in pt_col_names else ('tela' if 'tela' in pt_col_names else 'NULL')
                entalle_col = 'x_entalle' if 'x_entalle' in pt_col_names else ('entalle' if 'entalle' in pt_col_names else 'NULL')

                template_join = f"LEFT JOIN odoo.product_template pt ON {pt_ck} pt.odoo_id = vv.product_tmpl_id"
                template_select = f"pt.{marca_col} as marca, pt.{tipo_col} as tipo, pt.{tela_col} as tela, pt.{entalle_col} as entalle,"

            qty_col = 'qty' if 'qty' in pol_col_names else '0'
            price_unit_col = 'price_unit' if 'price_unit' in pol_col_names else '0'
            discount_col = 'discount' if 'discount' in pol_col_names else '0'
            price_subtotal_col = 'price_subtotal' if 'price_subtotal' in pol_col_names else '0'
            date_order_col = 'date_order' if 'date_order' in po_col_names else 'NULL'
            state_col = 'state' if 'state' in po_col_names else "'unknown'"
            user_id_col = 'user_id' if 'user_id' in po_col_names else 'NULL'

            view_sql = f"""
                CREATE OR REPLACE VIEW crm.v_ventas_pos_filtradas AS
                SELECT 
                    {company_select}
                    o.{date_order_col} as date_order,
                    o.odoo_id as pos_order_id,
                    l.odoo_id as pos_order_line_id,
                    o.{partner_id_col} as contacto_partner_id,
                    COALESCE(f.cuenta_partner_odoo_id, o.{partner_id_col}) as cuenta_partner_id,
                    o.{user_id_col} as user_id,
                    o.{state_col} as state,
                    {is_cancelled_expr} as is_cancelled,
                    l.product_id,
                    {variant_select}
                    l.{qty_col} as qty,
                    l.{price_unit_col} as price_unit,
                    l.{discount_col} as discount,
                    l.{price_subtotal_col} as price_subtotal
                    {(',' + template_select.rstrip(',')) if template_select else ''}
                FROM odoo.pos_order_line l
                JOIN odoo.pos_order o ON {company_join} o.odoo_id = l.{order_id_col}
                {variant_join}
                {template_join}
                LEFT JOIN crm.v_partner_account_final f ON f.contacto_partner_odoo_id = o.{partner_id_col}
                WHERE 1=1 {tmpl_filter};
            """
            await conn.execute(view_sql)
            logger.info("View crm.v_ventas_pos_filtradas created (from base tables)")
        else:
            logger.warning("Required POS tables not found, skipping v_ventas_pos_filtradas")
    except Exception as e:
        logger.warning(f"Could not create v_ventas_pos_filtradas: {e}")
