"""DDL de startup del módulo CRM.

Crea (idempotente): schema crm, tablas operacionales, vistas y mv_cuenta_sales_kpi.
Orden: extension → schema → tablas → índices → vistas → materialized view.
"""
import time
from db import safe_acquire


async def ensure_startup_ddl():
    async with safe_acquire() as conn:

        # ── 0. Safety net: recrear vistas odoo.* si el backend odoo las borró ──
        # El migration.py de odoo hace DROP VIEW odoo.v_pos_line_real CASCADE,
        # lo que destruye por cascada todos los matviews del CRM que dependen
        # de ella. Los recreamos aquí antes de tocar cualquier matview.
        try:
            has_line_real = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.views
                    WHERE table_schema = 'odoo' AND table_name = 'v_pos_line_real'
                )
            """)
            if not has_line_real:
                print("[startup_ddl] odoo.v_pos_line_real ausente — recreando…")
                await conn.execute("""
                    CREATE OR REPLACE VIEW odoo.v_pos_line_real AS
                    SELECT v.*
                    FROM odoo.v_pos_line_full v
                    JOIN odoo.v_pos_order_real po_real
                        ON po_real.company_key = v.company_key
                        AND po_real.odoo_id = v.order_id
                    WHERE
                        (v.is_cancelled = false OR v.is_cancelled IS NULL)
                        AND (v.reserva IS NULL OR v.reserva = false)
                        AND (v.reserva_use_id = 0 OR v.reserva_use_id IS NULL)
                        AND v.product_tmpl_id NOT IN (
                            SELECT odoo_id FROM odoo.product_template
                            WHERE name ILIKE ANY (ARRAY[
                                '%correa%','%bolsa%','%paneton%','%probador%','%provador%',
                                '%saco%','%lapicero%','%publicitario%','%envio%','%envío%',
                                '%tallero%'
                            ])
                            OR (purchase_ok = true AND (marca IS NULL OR marca = ''))
                        )
                        AND NOT EXISTS (
                            SELECT 1 FROM produccion.prod_odoo_productos_enriq pe_excl
                            WHERE pe_excl.odoo_template_id = v.product_tmpl_id
                              AND pe_excl.estado = 'excluido'
                        )
                """)
                print("[startup_ddl] odoo.v_pos_line_real recreada OK")
        except Exception as e:
            print(f"[startup_ddl] WARN ensure v_pos_line_real: {e}")

        # ── 1. Extensión + schema ────────────────────────────────────────────
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
        await conn.execute("CREATE SCHEMA IF NOT EXISTS crm;")

        # ── 2. Tablas ────────────────────────────────────────────────────────

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.cuenta (
                id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cuenta_partner_odoo_id INT  NOT NULL,
                estado_comercial      TEXT NULL,
                clasificacion         TEXT NULL,
                notas                 TEXT NULL,
                asignado_a            TEXT NULL,
                created_at            TIMESTAMPTZ DEFAULT now(),
                updated_at            TIMESTAMPTZ DEFAULT now(),
                UNIQUE(cuenta_partner_odoo_id)
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.contacto (
                id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                contacto_partner_odoo_id INT  NOT NULL,
                cuenta_partner_odoo_id   INT  NOT NULL,
                rol                      TEXT NULL,
                whatsapp                 TEXT NULL,
                created_at               TIMESTAMPTZ DEFAULT now(),
                updated_at               TIMESTAMPTZ DEFAULT now(),
                UNIQUE(contacto_partner_odoo_id)
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.partner_principal_override (
                id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                contacto_partner_odoo_id INT  NOT NULL,
                cuenta_partner_odoo_id   INT  NOT NULL,
                nota                     TEXT NULL,
                created_at               TIMESTAMPTZ DEFAULT now(),
                updated_at               TIMESTAMPTZ DEFAULT now(),
                UNIQUE(contacto_partner_odoo_id)
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.pos_order_partner_override (
                id                  BIGSERIAL PRIMARY KEY,
                order_id            INT  NOT NULL,
                original_partner_id INT  NULL,
                new_owner_partner_id INT NOT NULL,
                reason              TEXT NULL,
                created_at          TIMESTAMPTZ DEFAULT now(),
                created_by          TEXT NULL,
                updated_at          TIMESTAMPTZ DEFAULT now(),
                updated_by          TEXT NULL,
                active              BOOLEAN NOT NULL DEFAULT true
            );
        """)

        # Columnas idempotentes en pos_order_partner_override (pueden ya existir)
        for col, defn in [
            ("updated_at", "TIMESTAMPTZ DEFAULT now()"),
            ("updated_by", "TEXT NULL"),
            ("active",     "BOOLEAN NOT NULL DEFAULT true"),
        ]:
            try:
                await conn.execute(
                    f"ALTER TABLE crm.pos_order_partner_override "
                    f"ADD COLUMN IF NOT EXISTS {col} {defn}"
                )
            except Exception:
                pass

        # Reemplaza unique plain por partial unique en pos_order_partner_override
        await conn.execute("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'pos_order_partner_override_order_id_key'
                ) THEN
                    ALTER TABLE crm.pos_order_partner_override
                        DROP CONSTRAINT pos_order_partner_override_order_id_key;
                END IF;
            END $$;
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.cuenta_vinculo (
                id             BIGSERIAL PRIMARY KEY,
                cuenta_id      UUID NOT NULL REFERENCES crm.cuenta(id),
                odoo_partner_id INT  NOT NULL,
                activo         BOOLEAN DEFAULT true,
                created_at     TIMESTAMPTZ DEFAULT now(),
                UNIQUE(cuenta_id, odoo_partner_id)
            );
        """)

        # ── Grupos comerciales (Sprint CRM-D4) ─────────────────────────────
        # Una cuenta puede pertenecer a un "grupo comercial" — varias cuentas
        # con dueños relacionados (familia, holding, sucursales) que comparten
        # un cliente "principal". Distinto de cuenta_vinculo (que une múltiples
        # odoo_partner_id a UNA misma cuenta CRM por dedupe).
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.grupo_comercial (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                nombre      TEXT NOT NULL,
                notas       TEXT,
                created_at  TIMESTAMPTZ DEFAULT now(),
                created_by  TEXT,
                updated_at  TIMESTAMPTZ DEFAULT now(),
                updated_by  TEXT
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.grupo_miembro (
                id            BIGSERIAL PRIMARY KEY,
                grupo_id      UUID NOT NULL REFERENCES crm.grupo_comercial(id) ON DELETE CASCADE,
                cuenta_id     UUID NOT NULL REFERENCES crm.cuenta(id),
                es_principal  BOOLEAN NOT NULL DEFAULT false,
                rol_descripcion TEXT,
                created_at    TIMESTAMPTZ DEFAULT now(),
                created_by    TEXT,
                UNIQUE(cuenta_id)
            );
        """)
        # Constraint: solo un principal por grupo (parcial unique)
        await conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_grupo_miembro_principal
                ON crm.grupo_miembro (grupo_id) WHERE es_principal = true;
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_grupo_miembro_grupo
                ON crm.grupo_miembro (grupo_id);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_grupo_miembro_cuenta
                ON crm.grupo_miembro (cuenta_id);
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.interaccion (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cuenta_id   UUID NOT NULL REFERENCES crm.cuenta(id),
                contacto_id UUID NULL     REFERENCES crm.contacto(id),
                tipo        TEXT NOT NULL,
                fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
                resumen     TEXT NOT NULL,
                resultado   TEXT NULL,
                created_at  TIMESTAMPTZ DEFAULT now()
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.tarea (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cuenta_id   UUID NOT NULL REFERENCES crm.cuenta(id),
                contacto_id UUID NULL     REFERENCES crm.contacto(id),
                tipo        TEXT NOT NULL,
                due_at      TIMESTAMPTZ NOT NULL,
                status      TEXT NOT NULL DEFAULT 'PENDIENTE',
                prioridad   INT  DEFAULT 3,
                descripcion TEXT NOT NULL,
                created_at  TIMESTAMPTZ DEFAULT now(),
                done_at     TIMESTAMPTZ NULL
            );
        """)

        # ── 3. ALTER TABLE: columnas soft-disable ────────────────────────────
        for tbl in ['crm.cuenta', 'crm.contacto']:
            for col, defn in [
                ("is_active",       "BOOLEAN NOT NULL DEFAULT true"),
                ("manual_inactive", "BOOLEAN NOT NULL DEFAULT false"),
                ("inactive_reason", "TEXT NULL"),
                ("inactive_at",     "TIMESTAMPTZ NULL"),
                ("inactive_by",     "TEXT NULL"),
            ]:
                try:
                    await conn.execute(
                        f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS {col} {defn}"
                    )
                except Exception:
                    pass

        # ── 4. ALTER TABLE: columnas de aprobación ───────────────────────────
        for tbl in ['crm.cuenta', 'crm.contacto']:
            for col, defn in [
                ("approval_status", "TEXT NOT NULL DEFAULT 'APPROVED'"),
                ("approved_at",     "TIMESTAMPTZ NULL"),
                ("approved_by",     "TEXT NULL"),
                ("approval_note",   "TEXT NULL"),
                ("last_seen_at",    "TIMESTAMPTZ DEFAULT now()"),
            ]:
                try:
                    await conn.execute(
                        f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS {col} {defn}"
                    )
                except Exception:
                    pass

        # ── 4d. Perfil editable (Sprint CRM-D4 v2) ───────────────────────────
        # Campos del "perfil de cuenta" editables desde el tab Info.
        # Los campos sincronizados desde Odoo (name/vat) NO se overridean —
        # solo añadimos campos CRM-específicos. Email/teléfono pueden tener
        # override local si la cuenta es contactable por canal distinto al
        # registrado en Odoo.
        for col, defn in [
            ("email_crm",          "TEXT"),
            ("telefono_crm",       "TEXT"),
            ("whatsapp_crm",       "TEXT"),
            ("tipo_negocio",       "TEXT"),                       # Boutique, Distribuidor, etc
            ("pais",               "TEXT DEFAULT 'PE'"),          # PE | BO
            ("departamento",       "TEXT"),                       # selector
            ("distrito",           "TEXT"),
            ("provincia",          "TEXT"),                       # selector
            ("direccion_crm",      "TEXT"),
            ("credito_linea",      "NUMERIC(14,2)"),              # tope crédito
            ("credito_usado",      "NUMERIC(14,2)"),              # consumido actual
            ("terminos_pago_dias", "INTEGER DEFAULT 30"),
            ("canal_preferido",    "TEXT"),                       # WhatsApp, Llamada, Visita
            ("foto_url",           "TEXT"),
            ("cliente_desde",      "DATE"),                       # fecha alta como cliente
            # ── Overrides locales que ganan sobre odoo.res_partner ────────
            # Patrón "enriquecido" (igual que prod_odoo_productos_enriq).
            # NULL = sin override → leer de Odoo.
            ("mayorista",          "BOOLEAN"),                    # override de rp.mayorista
        ]:
            try:
                await conn.execute(
                    f"ALTER TABLE crm.cuenta ADD COLUMN IF NOT EXISTS {col} {defn}"
                )
            except Exception:
                pass

        # ── 4b. ALTER TABLE: columnas extendidas de interaccion ──────────────
        # Heredadas del CRM viejo + auditoría new-style (created_by/updated_by/updated_at).
        # user_id se mantiene legacy (no se usa en endpoints nuevos).
        for col, defn in [
            ("user_id",     "UUID"),
            ("channel",     "TEXT"),
            ("outcome",     "TEXT"),
            ("happened_at", "TIMESTAMPTZ DEFAULT now()"),
            ("created_by",  "TEXT"),
            ("updated_by",  "TEXT"),
            ("updated_at",  "TIMESTAMPTZ"),
        ]:
            try:
                await conn.execute(
                    f"ALTER TABLE crm.interaccion ADD COLUMN IF NOT EXISTS {col} {defn}"
                )
            except Exception:
                pass
        # Backfill happened_at + forzar NOT NULL (idempotente)
        try:
            await conn.execute(
                "UPDATE crm.interaccion SET happened_at = COALESCE(created_at, now()) "
                "WHERE happened_at IS NULL"
            )
            await conn.execute(
                "ALTER TABLE crm.interaccion ALTER COLUMN happened_at SET NOT NULL"
            )
        except Exception:
            pass

        # ── 4c. ALTER TABLE: auditoría new-style en tarea ────────────────────
        # Mantenemos legacy nullable: title, priority, note, assigned_user_id.
        for col, defn in [
            ("created_by", "TEXT"),
            ("updated_by", "TEXT"),
            ("updated_at", "TIMESTAMPTZ"),
            ("asignado_a", "TEXT"),
        ]:
            try:
                await conn.execute(
                    f"ALTER TABLE crm.tarea ADD COLUMN IF NOT EXISTS {col} {defn}"
                )
            except Exception:
                pass

        # ── 4c-bis. ALTER TABLE: motivo de la tarea (CRM-D9) ─────────────────
        # 6 motivos canónicos para clasificación operativa. NULL permitido
        # para tareas heredadas. POST nuevo lo exigirá desde el frontend; el
        # CHECK acepta NULL para no romper datos existentes.
        try:
            await conn.execute(
                "ALTER TABLE crm.tarea ADD COLUMN IF NOT EXISTS motivo TEXT"
            )
        except Exception:
            pass
        # CHECK constraint idempotente: drop si existe (en caso de cambiar
        # valores en el futuro) y recrear con la lista canónica.
        try:
            await conn.execute("""
                ALTER TABLE crm.tarea DROP CONSTRAINT IF EXISTS tarea_motivo_check;
            """)
            await conn.execute("""
                ALTER TABLE crm.tarea ADD CONSTRAINT tarea_motivo_check
                CHECK (motivo IS NULL OR motivo IN (
                    'COBRAR', 'POST_VENTA', 'SEGUIMIENTO',
                    'VENDER', 'RECUPERAR', 'DEVOLVER_LLAMADA'
                ));
            """)
        except Exception:
            pass

        # ── 4d. CRM-D10: tracking de origen automático en crm.tarea ──────────
        # Permite identificar tareas generadas por automatizaciones (cron Cobrar,
        # post-venta, etc.) y evitar duplicados via UNIQUE (source_type, source_ref).
        # Tareas creadas manualmente quedan con ambos NULL.
        for col, defn in [
            ("source_type", "TEXT"),   # 'ODOO_CREDIT' por ahora; ampliable
            ("source_ref",  "TEXT"),   # id del registro origen (odoo_id del crédito)
        ]:
            try:
                await conn.execute(
                    f"ALTER TABLE crm.tarea ADD COLUMN IF NOT EXISTS {col} {defn}"
                )
            except Exception:
                pass
        # Constraint: ambos NULL o ambos NOT NULL (no se permite uno solo)
        try:
            await conn.execute("ALTER TABLE crm.tarea DROP CONSTRAINT IF EXISTS tarea_source_complete")
            await conn.execute("""
                ALTER TABLE crm.tarea ADD CONSTRAINT tarea_source_complete
                CHECK ((source_type IS NULL AND source_ref IS NULL)
                    OR (source_type IS NOT NULL AND source_ref IS NOT NULL))
            """)
        except Exception:
            pass

        # ── 4e. CRM-D10: mapping odoo_user_id → username CRM ─────────────────
        # Tabla pequeña, mantenida MANUALMENTE por el admin a medida que se
        # crean vendedoras en el CRM. El cron de automatización ignora con log
        # warning los créditos cuyo user_id Odoo no esté mapeado acá.
        try:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS crm.odoo_user_map (
                    odoo_user_id INT PRIMARY KEY,
                    crm_username TEXT NOT NULL,
                    nota         TEXT NULL,
                    created_at   TIMESTAMPTZ DEFAULT now()
                )
            """)
            # Seed inicial: matches confirmados con el usuario en CRM-D10
            # (Luz tiene 2 odoo_user_ids — 84 y 99 — ambos apuntan al mismo
            # username CRM "luzlarico").
            await conn.execute("""
                INSERT INTO crm.odoo_user_map (odoo_user_id, crm_username, nota)
                VALUES
                    (84, 'luzlarico', 'Luz Larico - Odoo res_users id=84 (login "Luz")'),
                    (99, 'luzlarico', 'Luz Larico - Odoo res_users id=99 (login "luz")')
                ON CONFLICT (odoo_user_id) DO NOTHING
            """)
        except Exception:
            pass

        # ── 5. Índices ───────────────────────────────────────────────────────
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_interaccion_cuenta_fecha
                ON crm.interaccion (cuenta_id, fecha DESC);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tarea_status_due
                ON crm.tarea (status, due_at);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tarea_cuenta
                ON crm.tarea (cuenta_id);
        """)
        # Índice para columna "Próxima tarea" en directorio de cuentas.
        # Soporta LATERAL: WHERE cuenta_id=? AND status='PENDIENTE' ORDER BY due_at, prioridad LIMIT 1.
        # Con este índice el plan es 1 index range scan → primer row + stop. Sin él, recorre
        # todas las tareas de la cuenta y filtra/ordena en memoria (50x más lento en cuentas activas).
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tarea_cuenta_status_due
                ON crm.tarea (cuenta_id, status, due_at, prioridad);
        """)
        # Índice parcial para filtro por motivo (CRM-D9). Cubre el EXISTS
        # del /api/cuentas/list?motivo=X y también el LATERAL CELDA que
        # prioriza COBRAR (CASE WHEN motivo=COBRAR THEN 0 ELSE 1 END).
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tarea_motivo_status
                ON crm.tarea (motivo, status)
                WHERE status = 'PENDIENTE';
        """)
        # CRM-D10: dedupe del cron de automatización. El cobrar.py hace
        # NOT EXISTS sobre (source_type, source_ref) para no crear tareas
        # duplicadas en cada ciclo. Índice parcial = solo automáticas.
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tarea_source
                ON crm.tarea (source_type, source_ref)
                WHERE source_type IS NOT NULL;
        """)
        # Índices para Mi Día (asignado_a + created_by son los filtros calientes)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS ix_tarea_asignado_status_due
                ON crm.tarea (asignado_a, status, due_at);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS ix_interaccion_created_by_happened
                ON crm.interaccion (created_by, happened_at DESC);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_cuenta_approval
                ON crm.cuenta (approval_status);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_contacto_approval
                ON crm.contacto (approval_status);
        """)
        await conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_override_order_active
                ON crm.pos_order_partner_override (order_id) WHERE active = true;
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_override_new_owner
                ON crm.pos_order_partner_override (new_owner_partner_id);
        """)
        # Motor de cadencia: filtra cuentas por vendedor asignado
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_cuenta_asignado_a
                ON crm.cuenta (asignado_a)
                WHERE asignado_a IS NOT NULL;
        """)

        # ── 5b. Constraints idempotentes (PK/UNIQUE/FK) ──────────────────────
        # Defensa contra restores desde dumps que pierden constraints. En cada
        # arranque se verifica que las constraints semánticas existan; si faltan
        # se agregan. No-op si ya están.
        expected_constraints = [
            ('crm.cuenta',                     'cuenta_pkey',                             'PRIMARY KEY (id)'),
            ('crm.cuenta',                     'cuenta_partner_odoo_id_key',              'UNIQUE (cuenta_partner_odoo_id)'),
            ('crm.contacto',                   'contacto_pkey',                           'PRIMARY KEY (id)'),
            ('crm.contacto',                   'contacto_partner_odoo_id_key',            'UNIQUE (contacto_partner_odoo_id)'),
            ('crm.partner_principal_override', 'partner_principal_override_pkey',         'PRIMARY KEY (id)'),
            ('crm.partner_principal_override', 'partner_principal_override_contacto_key', 'UNIQUE (contacto_partner_odoo_id)'),
            ('crm.pos_order_partner_override', 'pos_order_partner_override_pkey',         'PRIMARY KEY (id)'),
            ('crm.cuenta_vinculo',             'cuenta_vinculo_pkey',                     'PRIMARY KEY (id)'),
            ('crm.cuenta_vinculo',             'cuenta_vinculo_pair_key',                 'UNIQUE (cuenta_id, odoo_partner_id)'),
            ('crm.cuenta_vinculo',             'cuenta_vinculo_cuenta_fk',                'FOREIGN KEY (cuenta_id) REFERENCES crm.cuenta(id)'),
            ('crm.interaccion',                'interaccion_pkey',                        'PRIMARY KEY (id)'),
            ('crm.interaccion',                'interaccion_cuenta_fk',                   'FOREIGN KEY (cuenta_id) REFERENCES crm.cuenta(id)'),
            ('crm.interaccion',                'interaccion_contacto_fk',                 'FOREIGN KEY (contacto_id) REFERENCES crm.contacto(id)'),
            ('crm.tarea',                      'tarea_pkey',                              'PRIMARY KEY (id)'),
            ('crm.tarea',                      'tarea_cuenta_fk',                         'FOREIGN KEY (cuenta_id) REFERENCES crm.cuenta(id)'),
            ('crm.tarea',                      'tarea_contacto_fk',                       'FOREIGN KEY (contacto_id) REFERENCES crm.contacto(id)'),
        ]
        for table, conname, definition in expected_constraints:
            try:
                exists = await conn.fetchval(
                    "SELECT EXISTS (SELECT 1 FROM pg_constraint "
                    "WHERE conrelid = $1::regclass AND conname = $2)",
                    table, conname,
                )
                if not exists:
                    await conn.execute(
                        f"ALTER TABLE {table} ADD CONSTRAINT {conname} {definition}"
                    )
                    print(f"[startup_ddl] added {conname} on {table}")
            except Exception as e:
                print(f"[startup_ddl] WARN constraint {conname} on {table}: {e}")

        # ── 5c. Sistema de roles (Sprint CRM-D1) ─────────────────────────────
        # crm.usuario contiene metadata de rol/iniciales/whatsapp del CRM.
        # La autenticación sigue contra produccion.prod_usuarios (SSO Ventas);
        # crm.usuario solo guarda atributos CRM-específicos. password_hash se
        # mantiene para futura independencia, pero hoy NO se usa para login.
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.usuario (
                username        TEXT PRIMARY KEY,
                password_hash   TEXT NULL,
                nombre_completo TEXT,
                rol             TEXT NOT NULL DEFAULT 'vendedora'
                                CHECK (rol IN ('admin', 'supervisor', 'vendedora')),
                email           TEXT,
                whatsapp        TEXT,
                iniciales       TEXT,
                activo          BOOLEAN DEFAULT TRUE,
                created_at      TIMESTAMPTZ DEFAULT now(),
                ultimo_login    TIMESTAMPTZ
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS crm.usuario_cartera (
                id            BIGSERIAL PRIMARY KEY,
                username      TEXT NOT NULL REFERENCES crm.usuario(username),
                cuenta_id     UUID NOT NULL REFERENCES crm.cuenta(id),
                asignado_at   TIMESTAMPTZ DEFAULT now(),
                asignado_por  TEXT REFERENCES crm.usuario(username),
                activo        BOOLEAN DEFAULT TRUE,
                UNIQUE(username, cuenta_id)
            );
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_usuario_cartera_activo
                ON crm.usuario_cartera (username) WHERE activo = TRUE;
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_usuario_cartera_cuenta
                ON crm.usuario_cartera (cuenta_id) WHERE activo = TRUE;
        """)

        # Seed: admin eduard + supervisor responsable + 6 vendedoras (idempotente)
        seed_users = [
            ('eduard',      'Eduard Cárdenas',      'admin',      'EC'),
            ('admin',       'Administrador',        'admin',      'AD'),
            ('responsable', 'Responsable Ventas',   'supervisor', 'RV'),
            ('vendedora1',  'Vendedora 1',          'vendedora',  'V1'),
            ('vendedora2',  'Vendedora 2',          'vendedora',  'V2'),
            ('vendedora3',  'Vendedora 3',          'vendedora',  'V3'),
            ('vendedora4',  'Vendedora 4',          'vendedora',  'V4'),
            ('vendedora5',  'Vendedora 5',          'vendedora',  'V5'),
            ('vendedora6',  'Vendedora 6',          'vendedora',  'V6'),
        ]
        for username, nombre, rol, iniciales in seed_users:
            try:
                await conn.execute("""
                    INSERT INTO crm.usuario (username, nombre_completo, rol, iniciales, activo)
                    VALUES ($1, $2, $3, $4, true)
                    ON CONFLICT (username) DO NOTHING
                """, username, nombre, rol, iniciales)
            except Exception as e:
                print(f"[startup_ddl] WARN seed crm.usuario {username}: {e}")

        # Backfill: cualquier usuario en produccion.prod_usuarios que NO esté
        # en crm.usuario, se importa con rol 'vendedora' por default.
        try:
            await conn.execute("""
                INSERT INTO crm.usuario (username, nombre_completo, rol, iniciales, email, activo)
                SELECT pu.username,
                       COALESCE(pu.nombre_completo, pu.username),
                       'vendedora',
                       UPPER(SUBSTRING(COALESCE(pu.nombre_completo, pu.username) FROM 1 FOR 2)),
                       pu.email,
                       COALESCE(pu.activo, true)
                FROM produccion.prod_usuarios pu
                LEFT JOIN crm.usuario cu ON cu.username = pu.username
                WHERE cu.username IS NULL
                ON CONFLICT (username) DO NOTHING
            """)
        except Exception as e:
            print(f"[startup_ddl] WARN backfill prod_usuarios → crm.usuario: {e}")

        # Migración: crm.cuenta.asignado_a (string) → crm.usuario_cartera (FK).
        # Solo migra si el username existe en crm.usuario y la asignación no
        # existe ya. No borra crm.cuenta.asignado_a (compat con cadencia).
        try:
            migrated = await conn.fetchval("""
                WITH inserted AS (
                    INSERT INTO crm.usuario_cartera (username, cuenta_id, activo)
                    SELECT c.asignado_a, c.id, true
                    FROM crm.cuenta c
                    JOIN crm.usuario u ON u.username = c.asignado_a
                    WHERE c.asignado_a IS NOT NULL
                    ON CONFLICT (username, cuenta_id) DO NOTHING
                    RETURNING 1
                )
                SELECT COUNT(*) FROM inserted
            """)
            if migrated and int(migrated) > 0:
                print(f"[startup_ddl] migradas {migrated} asignaciones cuenta→cartera")
        except Exception as e:
            print(f"[startup_ddl] WARN migración asignado_a → usuario_cartera: {e}")

        # ── 6. Vistas ────────────────────────────────────────────────────────
        # Cada vista en try/except para tolerar tablas odoo faltantes.

        # 6.1 v_partner_account_final
        try:
            has_map = await conn.fetchval("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'odoo'
                      AND table_name = 'v_partner_account_map'
                )
            """)
            if has_map:
                await conn.execute("""
                    CREATE OR REPLACE VIEW crm.v_partner_account_final AS
                    SELECT
                        p.odoo_id AS contacto_partner_odoo_id,
                        COALESCE(
                            ov.cuenta_partner_odoo_id,
                            mp.cuenta_partner_id,
                            p.odoo_id
                        ) AS cuenta_partner_odoo_id
                    FROM odoo.res_partner p
                    LEFT JOIN crm.partner_principal_override ov
                        ON ov.contacto_partner_odoo_id = p.odoo_id
                    LEFT JOIN odoo.v_partner_account_map mp
                        ON mp.contacto_partner_id = p.odoo_id
                    WHERE p.company_key = 'GLOBAL'
                      AND COALESCE(p.active, true) = true;
                """)
            else:
                await conn.execute("""
                    CREATE OR REPLACE VIEW crm.v_partner_account_final AS
                    SELECT
                        p.odoo_id AS contacto_partner_odoo_id,
                        COALESCE(
                            ov.cuenta_partner_odoo_id,
                            p.odoo_id
                        ) AS cuenta_partner_odoo_id
                    FROM odoo.res_partner p
                    LEFT JOIN crm.partner_principal_override ov
                        ON ov.contacto_partner_odoo_id = p.odoo_id
                    WHERE p.company_key = 'GLOBAL'
                      AND COALESCE(p.active, true) = true;
                """)
        except Exception as e:
            print(f"[startup_ddl] WARN v_partner_account_final: {e}")

        # 6.2 v_cuenta_partners
        try:
            await conn.execute("""
                CREATE OR REPLACE VIEW crm.v_cuenta_partners AS
                -- Partner principal de la cuenta
                SELECT c.id AS cuenta_id, c.cuenta_partner_odoo_id AS partner_id
                FROM crm.cuenta c
                WHERE c.cuenta_partner_odoo_id IS NOT NULL
                UNION
                -- Links manuales
                SELECT cv.cuenta_id, cv.odoo_partner_id AS partner_id
                FROM crm.cuenta_vinculo cv
                WHERE cv.activo = true
                UNION
                -- Auto-linked via v_partner_account_final
                SELECT c.id AS cuenta_id, paf.contacto_partner_odoo_id AS partner_id
                FROM crm.cuenta c
                JOIN crm.v_partner_account_final paf
                    ON paf.cuenta_partner_odoo_id = c.cuenta_partner_odoo_id
                WHERE c.cuenta_partner_odoo_id IS NOT NULL
                UNION
                -- Hijos: commercial_partner_id
                SELECT c.id AS cuenta_id, rp.odoo_id AS partner_id
                FROM crm.cuenta c
                JOIN odoo.res_partner rp
                    ON rp.company_key = 'GLOBAL'
                    AND rp.commercial_partner_id = c.cuenta_partner_odoo_id
                WHERE c.cuenta_partner_odoo_id IS NOT NULL
                UNION
                -- Hijos: parent_id
                SELECT c.id AS cuenta_id, rp.odoo_id AS partner_id
                FROM crm.cuenta c
                JOIN odoo.res_partner rp
                    ON rp.company_key = 'GLOBAL'
                    AND rp.parent_id = c.cuenta_partner_odoo_id
                WHERE c.cuenta_partner_odoo_id IS NOT NULL;
            """)
        except Exception as e:
            print(f"[startup_ddl] WARN v_cuenta_partners: {e}")

        # 6.3 v_cuentas_libres
        try:
            await conn.execute("""
                CREATE OR REPLACE VIEW crm.v_cuentas_libres AS
                SELECT p.odoo_id AS cuenta_partner_odoo_id
                FROM odoo.res_partner p
                JOIN crm.v_partner_account_final m
                    ON m.contacto_partner_odoo_id = p.odoo_id
                WHERE p.company_key = 'GLOBAL'
                  AND COALESCE(p.active, true) = true
                  AND m.cuenta_partner_odoo_id = p.odoo_id;
            """)
        except Exception as e:
            print(f"[startup_ddl] WARN v_cuentas_libres: {e}")

        # 6.4 v_contactos_vinculados
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
        except Exception as e:
            print(f"[startup_ddl] WARN v_contactos_vinculados: {e}")

        # 6.5 v_comercial_order_header
        # Consume vistas centralizadas odoo.v_pos_order_real / odoo.v_pos_line_real,
        # que ya aplican TODOS los filtros de "venta real" (canceladas, reservas,
        # palabras prohibidas, anti-NV-duplicado, productos basura, estado=excluido).
        # doc_tipo siempre = 'SALE' (las vistas excluyen reservas).
        try:
            await conn.execute("DROP VIEW IF EXISTS crm.v_comercial_order_header CASCADE;")
            await conn.execute("""
                CREATE VIEW crm.v_comercial_order_header AS
                SELECT
                    'SALE'::text  AS doc_tipo,
                    po.odoo_id    AS order_id,
                    po.name       AS order_name,
                    po.date_order,
                    po.state,
                    po.amount_total,
                    po.partner_id,
                    COALESCE(
                        ov_po.new_owner_partner_id,
                        paf.cuenta_partner_odoo_id,
                        po.partner_id
                    ) AS owner_partner_id,
                    rp_owner.name AS owner_partner_name,
                    (ov_po.order_id IS NOT NULL) AS has_override,
                    CASE WHEN ov_po.order_id IS NOT NULL
                         THEN rp_orig.name ELSE NULL END AS original_partner_name,
                    agg.qty_total,
                    agg.lines_count
                FROM odoo.v_pos_order_real po
                JOIN (
                    -- INNER JOIN: excluye órdenes huérfanas (todas sus líneas
                    -- son productos prohibidos filtrados en v_pos_line_real).
                    SELECT v.order_id,
                           SUM(v.qty)        AS qty_total,
                           COUNT(*)          AS lines_count
                    FROM odoo.v_pos_line_real v
                    GROUP BY v.order_id
                ) agg ON agg.order_id = po.odoo_id
                LEFT JOIN crm.pos_order_partner_override ov_po
                    ON ov_po.order_id = po.odoo_id AND ov_po.active = true
                LEFT JOIN crm.v_partner_account_final paf
                    ON po.partner_id = paf.contacto_partner_odoo_id
                LEFT JOIN odoo.res_partner rp_owner
                    ON COALESCE(
                           ov_po.new_owner_partner_id,
                           paf.cuenta_partner_odoo_id,
                           po.partner_id
                       ) = rp_owner.odoo_id
                    AND rp_owner.company_key = 'GLOBAL'
                LEFT JOIN odoo.res_partner rp_orig
                    ON ov_po.order_id IS NOT NULL
                    AND rp_orig.odoo_id = po.partner_id
                    AND rp_orig.company_key = 'GLOBAL';
            """)
        except Exception as e:
            print(f"[startup_ddl] WARN v_comercial_order_header: {e}")

        # ── 7. Materialized view: mv_cuenta_sales_kpi ────────────────────────
        # Consume odoo.v_pos_order_real y odoo.v_pos_line_real (single source of truth
        # de "venta real"). IF NOT EXISTS para no perder datos en cada reinicio.
        # Si se necesita cambiar el schema: DROP manualmente y reiniciar.
        try:
            await conn.execute("""
                CREATE MATERIALIZED VIEW IF NOT EXISTS crm.mv_cuenta_sales_kpi AS
                -- ROLLUP COMPLETO: cada partner se reduce al PRINCIPAL de su grupo
                -- CRM (DNI + RUC + vinculados se tratan como UNA cuenta comercial).
                -- Sin este rollup, un cliente que compra con DNI y luego con su RUC
                -- aparecía como dos cuentas separadas (y una de ellas "perdida"
                -- aunque la otra siguiera activa).
                WITH partner_to_principal AS (
                    -- partner_id (Odoo) → cuenta_partner_odoo_id (principal del grupo CRM)
                    SELECT
                        vcp.partner_id,
                        c.cuenta_partner_odoo_id AS principal_partner_id
                    FROM crm.v_cuenta_partners vcp
                    JOIN crm.cuenta c ON c.id = vcp.cuenta_id
                ),
                all_orders AS (
                    -- Cada orden suma al PRINCIPAL del grupo (o al partner directo
                    -- si no está agrupado). Excluye órdenes huérfanas.
                    SELECT
                        COALESCE(
                            ptp.principal_partner_id,
                            ov_po.new_owner_partner_id,
                            po.cliente_efectivo_id
                        )                                                    AS cuenta_id,
                        MAX(po.date_order)                                   AS last_purchase_date,
                        COUNT(*) FILTER (WHERE po.date_order >= CURRENT_DATE - 365) AS orders_12m,
                        COUNT(*)                                              AS orders_total
                    FROM odoo.v_pos_order_real po
                    JOIN (
                        SELECT DISTINCT v.order_id FROM odoo.v_pos_line_real v
                    ) li ON li.order_id = po.odoo_id
                    LEFT JOIN crm.pos_order_partner_override ov_po
                        ON ov_po.order_id = po.odoo_id AND ov_po.active = true
                    LEFT JOIN partner_to_principal ptp
                        ON ptp.partner_id = COALESCE(ov_po.new_owner_partner_id, po.cliente_efectivo_id)
                    GROUP BY COALESCE(
                        ptp.principal_partner_id,
                        ov_po.new_owner_partner_id,
                        po.cliente_efectivo_id
                    )
                ),
                top_store AS (
                    SELECT DISTINCT ON (sub.cuenta_id)
                        sub.cuenta_id, sub.tienda
                    FROM (
                        SELECT
                            COALESCE(
                                ptp.principal_partner_id,
                                ov_po.new_owner_partner_id,
                                po.cliente_efectivo_id
                            ) AS cuenta_id,
                            COALESCE(
                                sl.x_nombre,
                                CASE SPLIT_PART(po.name, '/', 1)
                                    WHEN 'BOSH GAMARRA'          THEN 'BOOSH'
                                    WHEN 'G209'                  THEN 'GM209'
                                    WHEN 'GaleriaAzul'           THEN 'AZUL'
                                    WHEN 'Gamarra207A'           THEN 'GM207'
                                    WHEN 'Grau 238'              THEN 'GR238'
                                    WHEN 'Grau238'               THEN 'GR238'
                                    WHEN 'Grau 555-'             THEN 'GR55'
                                    WHEN 'Sebastian Barranca 1556' THEN 'GM218'
                                    WHEN 'Venta Taller'          THEN 'TALLER'
                                    WHEN 'Zapaton'               THEN 'ZAP'
                                    ELSE NULL
                                END
                            ) AS tienda,
                            COUNT(*) AS cnt
                        FROM (
                            SELECT po2.*, ROW_NUMBER() OVER (
                                PARTITION BY COALESCE(
                                    ptp2.principal_partner_id,
                                    ov2.new_owner_partner_id,
                                    po2.cliente_efectivo_id
                                )
                                ORDER BY po2.date_order DESC
                            ) AS rn
                            FROM odoo.v_pos_order_real po2
                            JOIN (
                                SELECT DISTINCT v.order_id FROM odoo.v_pos_line_real v
                            ) li2 ON li2.order_id = po2.odoo_id
                            LEFT JOIN crm.pos_order_partner_override ov2
                                ON ov2.order_id = po2.odoo_id AND ov2.active = true
                            LEFT JOIN partner_to_principal ptp2
                                ON ptp2.partner_id = COALESCE(ov2.new_owner_partner_id, po2.cliente_efectivo_id)
                        ) po
                        LEFT JOIN crm.pos_order_partner_override ov_po
                            ON ov_po.order_id = po.odoo_id AND ov_po.active = true
                        LEFT JOIN partner_to_principal ptp
                            ON ptp.partner_id = COALESCE(ov_po.new_owner_partner_id, po.cliente_efectivo_id)
                        LEFT JOIN odoo.stock_location sl
                            ON sl.odoo_id = po.location_id AND sl.company_key = 'GLOBAL'
                            AND sl.x_nombre IS NOT NULL AND btrim(sl.x_nombre) <> ''
                        WHERE po.rn <= 5
                        GROUP BY
                            COALESCE(
                                ptp.principal_partner_id,
                                ov_po.new_owner_partner_id,
                                po.cliente_efectivo_id
                            ),
                            COALESCE(
                                sl.x_nombre,
                                CASE SPLIT_PART(po.name, '/', 1)
                                    WHEN 'BOSH GAMARRA'          THEN 'BOOSH'
                                    WHEN 'G209'                  THEN 'GM209'
                                    WHEN 'GaleriaAzul'           THEN 'AZUL'
                                    WHEN 'Gamarra207A'           THEN 'GM207'
                                    WHEN 'Grau 238'              THEN 'GR238'
                                    WHEN 'Grau238'               THEN 'GR238'
                                    WHEN 'Grau 555-'             THEN 'GR55'
                                    WHEN 'Sebastian Barranca 1556' THEN 'GM218'
                                    WHEN 'Venta Taller'          THEN 'TALLER'
                                    WHEN 'Zapaton'               THEN 'ZAP'
                                    ELSE NULL
                                END
                            )
                    ) sub
                    WHERE sub.tienda IS NOT NULL
                    ORDER BY sub.cuenta_id, sub.cnt DESC
                ),
                filtered_qty AS (
                    SELECT
                        COALESCE(
                            ptp.principal_partner_id,
                            ov_po.new_owner_partner_id,
                            v.cuenta_partner_id
                        )                                                   AS cuenta_id,
                        COALESCE(SUM(CASE WHEN v.date_order >= CURRENT_DATE - 365
                                         THEN v.qty ELSE 0 END), 0)::bigint AS qty_12m,
                        COALESCE(SUM(v.qty), 0)::bigint                     AS qty_total,
                        COALESCE(SUM(CASE WHEN v.date_order >= date_trunc('year', CURRENT_DATE)
                                         THEN v.qty ELSE 0 END), 0)::bigint AS qty_ytd_cur,
                        COALESCE(SUM(CASE
                            WHEN v.date_order >= (date_trunc('year', CURRENT_DATE) - interval '1 year')
                             AND v.date_order <  (CURRENT_DATE - interval '1 year' + interval '1 day')
                            THEN v.qty ELSE 0 END), 0)::bigint              AS qty_ytd_p1,
                        COALESCE(SUM(CASE
                            WHEN v.date_order >= (date_trunc('year', CURRENT_DATE) - interval '2 years')
                             AND v.date_order <  (CURRENT_DATE - interval '2 years' + interval '1 day')
                            THEN v.qty ELSE 0 END), 0)::bigint              AS qty_ytd_p2
                    FROM odoo.v_pos_line_real v
                    LEFT JOIN crm.pos_order_partner_override ov_po
                        ON ov_po.order_id = v.order_id AND ov_po.active = true
                    LEFT JOIN partner_to_principal ptp
                        ON ptp.partner_id = COALESCE(ov_po.new_owner_partner_id, v.cuenta_partner_id)
                    GROUP BY COALESCE(
                        ptp.principal_partner_id,
                        ov_po.new_owner_partner_id,
                        v.cuenta_partner_id
                    )
                )
                SELECT
                    ao.cuenta_id,
                    ao.last_purchase_date,
                    ao.orders_12m::bigint,
                    ao.orders_total::bigint,
                    COALESCE(fq.qty_12m,    0) AS qty_12m,
                    COALESCE(fq.qty_total,  0) AS qty_total,
                    COALESCE(fq.qty_ytd_cur,0) AS qty_ytd_cur,
                    COALESCE(fq.qty_ytd_p1, 0) AS qty_ytd_p1,
                    COALESCE(fq.qty_ytd_p2, 0) AS qty_ytd_p2,
                    ts.tienda
                FROM all_orders ao
                LEFT JOIN filtered_qty fq ON fq.cuenta_id = ao.cuenta_id
                LEFT JOIN top_store   ts ON ts.cuenta_id  = ao.cuenta_id;
            """)

            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cuenta_kpi_pk
                    ON crm.mv_cuenta_sales_kpi (cuenta_id);
            """)

            # Refresh inicial solo si está vacía (primera vez o tras DROP manual)
            kpi_count = await conn.fetchval(
                "SELECT COUNT(*) FROM crm.mv_cuenta_sales_kpi"
            )
            if kpi_count == 0:
                t0 = time.monotonic()
                try:
                    await conn.execute(
                        "REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_cuenta_sales_kpi"
                    )
                except Exception:
                    await conn.execute(
                        "REFRESH MATERIALIZED VIEW crm.mv_cuenta_sales_kpi"
                    )
                elapsed = time.monotonic() - t0
                print(f"[startup_ddl] mv_cuenta_sales_kpi primer refresh en {elapsed:.1f}s")
            else:
                print(f"[startup_ddl] mv_cuenta_sales_kpi ya poblada ({kpi_count} filas)")

        except Exception as e:
            print(f"[startup_ddl] WARN mv_cuenta_sales_kpi: {e}")

        # ── 8. Índices auxiliares en odoo.* (aceleran build de matviews y otros) ──
        # IF NOT EXISTS hace que sean idempotentes. CONCURRENTLY no se puede dentro
        # de una transacción implícita, pero asyncpg auto-commits cada execute.
        try:
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_pos_order_line_order_id
                ON odoo.pos_order_line(order_id)
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_pos_order_partner_id
                ON odoo.pos_order(partner_id) WHERE partner_id IS NOT NULL
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_pos_order_x_cliente_principal
                ON odoo.pos_order(x_cliente_principal) WHERE x_cliente_principal IS NOT NULL
            """)
        except Exception as e:
            print(f"[startup_ddl] WARN índices odoo.pos_order*: {e}")

        # ── 9. Matview crm.mv_pos_line_cuenta + sus 4 índices ──
        # Pre-resuelve cuenta_partner_id (con override aplicado) sobre v_pos_line_real.
        # Reduce latencia de queries YoY de 12s → 50ms (~250x más rápido).
        # Refresh nocturno: scheduler en server.py a las 3am Lima.
        try:
            await conn.execute("""
                CREATE MATERIALIZED VIEW IF NOT EXISTS crm.mv_pos_line_cuenta AS
                SELECT
                  COALESCE(ov_po.new_owner_partner_id, v.cuenta_partner_id) AS cuenta_partner_id,
                  v.pos_order_line_id   AS line_id,
                  v.order_id,
                  v.date_order,
                  v.qty,
                  v.price_unit,
                  v.price_subtotal,
                  v.product_id,
                  v.product_tmpl_id,
                  v.marca,
                  v.tipo,
                  v.entalle,
                  v.tela,
                  v.talla,
                  v.color,
                  v.barcode,
                  EXTRACT(YEAR  FROM v.date_order)::int AS anio,
                  EXTRACT(MONTH FROM v.date_order)::int AS mes
                FROM odoo.v_pos_line_real v
                LEFT JOIN crm.pos_order_partner_override ov_po
                  ON ov_po.order_id = v.order_id AND ov_po.active = true
                WHERE COALESCE(ov_po.new_owner_partner_id, v.cuenta_partner_id) IS NOT NULL
                WITH NO DATA
            """)

            # Índice único requerido para REFRESH CONCURRENTLY
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_pos_line_cuenta_pk
                ON crm.mv_pos_line_cuenta(line_id)
            """)
            # Índice principal: filtra por cuenta + año (90% de queries YoY)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_mv_pos_line_cuenta_partner_year
                ON crm.mv_pos_line_cuenta(cuenta_partner_id, anio)
            """)
            # Para queries con rango de fechas (YTD, default 12m)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_mv_pos_line_cuenta_partner_date
                ON crm.mv_pos_line_cuenta(cuenta_partner_id, date_order)
            """)
            # Para Vista Clasificación (group by marca/tipo/entalle)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_mv_pos_line_cuenta_partner_marca_tipo
                ON crm.mv_pos_line_cuenta(cuenta_partner_id, marca, tipo, entalle)
            """)

            # Refresh inicial sólo si la matview está vacía (primera vez).
            # En arranques posteriores no la recargamos: el scheduler nocturno
            # mantiene los datos al día (más el safety check de >25h).
            count = await conn.fetchval("SELECT COUNT(*) FROM crm.mv_pos_line_cuenta")
            if count == 0:
                t0 = time.monotonic()
                await conn.execute("REFRESH MATERIALIZED VIEW crm.mv_pos_line_cuenta")
                await conn.execute("ANALYZE crm.mv_pos_line_cuenta")
                elapsed = time.monotonic() - t0
                print(f"[startup_ddl] mv_pos_line_cuenta primer refresh en {elapsed:.1f}s")
            else:
                print(f"[startup_ddl] mv_pos_line_cuenta ya poblada ({count} filas)")
        except Exception as e:
            print(f"[startup_ddl] WARN mv_pos_line_cuenta: {e}")

        # ── 10. Matview crm.mv_cuenta_estado (Sprint CRM-D2) ─────────────────
        # Calcula tier (oro/plata/bronce), recencia, frecuencia esperada y
        # estado_auto (vip/activo/nuevo/en_riesgo/dormido/perdido) por cuenta.
        # Lee de mv_cuenta_sales_kpi + mv_pos_line_cuenta + odoo.res_partner.
        # Refresh nocturno coordinado con las otras matviews.
        try:
            await conn.execute("""
                CREATE MATERIALIZED VIEW IF NOT EXISTS crm.mv_cuenta_estado AS
                WITH amounts AS (
                    -- Suma de ventas por cuenta (12m + total) leyendo del matview
                    -- de líneas que ya tiene el cuenta_partner_id resuelto.
                    SELECT
                        cuenta_partner_id AS cuenta_id,
                        SUM(price_subtotal) FILTER (
                            WHERE date_order >= CURRENT_DATE - 365
                        )::numeric(14,2) AS amount_12m,
                        SUM(price_subtotal)::numeric(14,2) AS amount_total,
                        SUM(price_subtotal) FILTER (
                            WHERE date_order >= date_trunc('month', CURRENT_DATE)
                        )::numeric(14,2) AS amount_mtd
                    FROM crm.mv_pos_line_cuenta
                    GROUP BY cuenta_partner_id
                ),
                base AS (
                    SELECT
                        rp.odoo_id AS cuenta_partner_odoo_id,
                        rp.name,
                        rp.display_name,
                        rp.city,
                        rp.phone,
                        rp.mobile,
                        rp.vat,
                        -- Override CRM gana sobre Odoo
                        COALESCE(cu.mayorista, rp.mayorista, false) AS mayorista,
                        COALESCE(rp.x_no_llamar, false) AS no_llamar,
                        kpi.last_purchase_date,
                        COALESCE(kpi.orders_12m, 0) AS orders_12m,
                        COALESCE(kpi.orders_total, 0) AS orders_total,
                        COALESCE(kpi.qty_12m, 0) AS qty_12m,
                        COALESCE(am.amount_12m, 0)::numeric(14,2) AS amount_12m,
                        COALESCE(am.amount_total, 0)::numeric(14,2) AS amount_total,
                        COALESCE(am.amount_mtd, 0)::numeric(14,2) AS amount_mtd,
                        cu.id AS crm_cuenta_id,
                        cu.created_at AS crm_created_at,
                        -- Fecha de creación REAL del partner en Odoo. En Odoo el
                        -- cliente se crea AL momento de su primera venta, así que
                        -- esta fecha ≈ fecha primera compra. Sirve para detectar
                        -- "clientes nuevos" (pocas compras + alta reciente).
                        rp.odoo_create_date AS partner_created_at,
                        cu.estado_comercial,
                        cu.clasificacion,
                        cu.asignado_a,
                        (CURRENT_DATE - kpi.last_purchase_date::date) AS recencia_dias,
                        -- Depto canónico (override CRM > state_name Odoo). UPPER
                        -- + sin tildes para matchear contra la lista de 25
                        -- deptos peruanos al clasificar por percentil.
                        UPPER(translate(
                            COALESCE(NULLIF(cu.departamento, ''), rp.state_name::text, ''),
                            'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN'
                        )) AS depto_raw
                    FROM odoo.res_partner rp
                    JOIN crm.mv_cuenta_sales_kpi kpi ON kpi.cuenta_id = rp.odoo_id
                    LEFT JOIN amounts am ON am.cuenta_id = rp.odoo_id
                    LEFT JOIN crm.cuenta cu ON cu.cuenta_partner_odoo_id = rp.odoo_id
                    WHERE rp.company_key = 'GLOBAL'
                ),
                ranked AS (
                    SELECT *,
                        -- Frecuencia esperada: si tiene >=2 órdenes/12m, asume
                        -- ciclo regular. Si no, NULL (no se puede inferir).
                        CASE WHEN orders_12m >= 2
                             THEN ROUND(365.0 / NULLIF(orders_12m, 0)::numeric, 1)
                             ELSE NULL
                        END AS freq_dias_estimada,
                        -- valor_base: el MAYOR entre LTV histórico y ventas 12m.
                        -- Rescata clientes que vendieron mucho antes pero pararon
                        -- (no quedan como Bajo solo porque su 12m está bajo).
                        GREATEST(
                            COALESCE(amount_total, 0),
                            COALESCE(amount_12m, 0)
                        )::float AS valor_base,
                        -- depto efectivo para particionar: si es uno de los 25
                        -- peruanos canónicos lo usamos; sino va a 'SIN_DEPTO'
                        -- (los sin-depto se agruparán juntos al final como bajo).
                        CASE WHEN depto_raw IN (
                            'AMAZONAS','ANCASH','APURIMAC','AREQUIPA','AYACUCHO',
                            'CAJAMARCA','CALLAO','CUSCO','HUANCAVELICA','HUANUCO',
                            'ICA','JUNIN','LA LIBERTAD','LAMBAYEQUE','LIMA',
                            'LORETO','MADRE DE DIOS','MOQUEGUA','PASCO','PIURA',
                            'PUNO','SAN MARTIN','TACNA','TUMBES','UCAYALI'
                        ) THEN depto_raw ELSE 'SIN_DEPTO' END AS depto_efectivo
                    FROM base
                ),
                clasificado AS (
                    -- Calcula posición de cada cliente dentro de su depto
                    -- ordenado por valor_base DESC (mejor cliente = rn 1).
                    SELECT *,
                        ROW_NUMBER() OVER (
                            PARTITION BY depto_efectivo
                            ORDER BY valor_base DESC, cuenta_partner_odoo_id ASC
                        ) AS rn_depto,
                        COUNT(*) OVER (PARTITION BY depto_efectivo) AS dept_total
                    FROM ranked
                ),
                final_clasif AS (
                    -- TIER por percentil dentro del depto:
                    --   estrella → top 10%
                    --   alto     → 10-25%
                    --   medio    → 25-40%
                    --   bajo     → 60% restante
                    -- Deptos chicos (<10 clientes): garantizar niveles si alcanza.
                    --   1 cliente   → estrella
                    --   2 clientes  → estrella + bajo
                    --   3 clientes  → estrella + alto + bajo
                    --   4 clientes  → estrella + alto + medio + bajo
                    --   5-9         → estrella(1) + alto(1) + medio(1) + bajo(N-3)
                    -- Clientes sin depto válido → siempre bajo.
                    SELECT *,
                        CASE
                            WHEN depto_efectivo = 'SIN_DEPTO' THEN 'bajo'
                            WHEN dept_total < 10 THEN
                                CASE
                                    WHEN rn_depto = 1                          THEN 'estrella'
                                    WHEN rn_depto = 2 AND dept_total >= 3      THEN 'alto'
                                    WHEN rn_depto = 3 AND dept_total >= 4      THEN 'medio'
                                    ELSE 'bajo'
                                END
                            WHEN (rn_depto::float / dept_total::float) <= 0.10 THEN 'estrella'
                            WHEN (rn_depto::float / dept_total::float) <= 0.25 THEN 'alto'
                            WHEN (rn_depto::float / dept_total::float) <= 0.40 THEN 'medio'
                            ELSE 'bajo'
                        END AS tier
                    FROM clasificado
                )
                SELECT *,
                    -- Estado automático — 5 estados simples basados en
                    -- recencia absoluta de la última compra:
                    --   nuevo     → 1-3 compras Y creado hace ≤60 días
                    --   activo    → última compra ≤60 días
                    --   alerta    → última compra entre 61-120 días
                    --   olvidado  → última compra entre 121-180 días
                    --   perdido   → última compra hace más de 180 días
                    --   sin_data  → fallback (sin last_purchase_date)
                    -- Nota: el TIER (oro/plata/bronce) es independiente del
                    -- estado — un cliente puede ser tier=oro AND estado=alerta.
                    CASE
                        -- NUEVO tiene prioridad sobre activo (mismo rango de
                        -- recencia) para distinguir leads recién enganchados
                        WHEN orders_total BETWEEN 1 AND 3
                             AND partner_created_at IS NOT NULL
                             AND partner_created_at >= NOW() - INTERVAL '60 days'
                            THEN 'nuevo'
                        WHEN recencia_dias IS NULL
                            THEN 'sin_data'
                        WHEN recencia_dias > 180
                            THEN 'perdido'
                        WHEN recencia_dias > 120
                            THEN 'olvidado'
                        WHEN recencia_dias > 60
                            THEN 'alerta'
                        ELSE 'activo'
                    END AS estado_auto,
                    -- Score de prioridad: combina urgencia (recencia/freq) con
                    -- valor (amount_12m). Mayor score = más prioritario para
                    -- mostrar primero en la cola. NULLIF defensivo en divisor.
                    COALESCE(
                        CASE
                            WHEN recencia_dias IS NULL THEN 0
                            WHEN freq_dias_estimada IS NULL OR freq_dias_estimada = 0 THEN
                                LEAST(recencia_dias::float / 60.0, 5.0)
                            ELSE LEAST(
                                recencia_dias::float / NULLIF(freq_dias_estimada, 0)::float,
                                5.0
                            )
                        END * (1.0 + LEAST(COALESCE(amount_12m, 0)::float / 50000.0, 4.0)),
                        0
                    ) AS prioridad_score
                FROM final_clasif
            """)
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cuenta_estado_pk
                    ON crm.mv_cuenta_estado (cuenta_partner_odoo_id);
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_mv_cuenta_estado_auto
                    ON crm.mv_cuenta_estado (estado_auto);
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_mv_cuenta_estado_asignado
                    ON crm.mv_cuenta_estado (asignado_a, estado_auto)
                    WHERE asignado_a IS NOT NULL;
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_mv_cuenta_estado_prioridad
                    ON crm.mv_cuenta_estado (prioridad_score DESC NULLS LAST);
            """)
            # D6) Equipo de ventas — extender crm.usuario con campos de perfil
            try:
                await conn.execute("""
                    ALTER TABLE crm.usuario
                      ADD COLUMN IF NOT EXISTS telefono         TEXT,
                      ADD COLUMN IF NOT EXISTS color_hex        TEXT,
                      ADD COLUMN IF NOT EXISTS tiendas          TEXT[],
                      ADD COLUMN IF NOT EXISTS marcas           TEXT[],
                      ADD COLUMN IF NOT EXISTS fecha_ingreso    DATE,
                      ADD COLUMN IF NOT EXISTS meta_mensual     NUMERIC(14,2),
                      ADD COLUMN IF NOT EXISTS notas            TEXT,
                      ADD COLUMN IF NOT EXISTS es_equipo_ventas BOOLEAN DEFAULT false;
                """)
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_usuario_equipo
                    ON crm.usuario(es_equipo_ventas) WHERE es_equipo_ventas = true;
                """)
            except Exception as e:
                print(f"[startup_ddl] WARN crm.usuario extender: {e}")

            # D7) Configuración global del CRM (app_config) + tracking de IA
            try:
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS crm.app_config (
                        key        TEXT PRIMARY KEY,
                        value      TEXT,
                        updated_at TIMESTAMPTZ DEFAULT now(),
                        updated_by TEXT
                    );
                """)
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS crm.ai_usage (
                        id            BIGSERIAL PRIMARY KEY,
                        provider      TEXT NOT NULL,
                        model         TEXT,
                        input_tokens  INTEGER DEFAULT 0,
                        output_tokens INTEGER DEFAULT 0,
                        cost_usd      NUMERIC(10,6) DEFAULT 0,
                        purpose       TEXT,
                        cuenta_id     INTEGER,
                        success       BOOLEAN DEFAULT true,
                        created_at    TIMESTAMPTZ DEFAULT now(),
                        created_by    TEXT
                    );
                """)
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_ai_usage_created
                    ON crm.ai_usage(created_at DESC);
                """)
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_ai_usage_provider
                    ON crm.ai_usage(provider, created_at DESC);
                """)
            except Exception as e:
                print(f"[startup_ddl] WARN app_config / ai_usage: {e}")

            # D7) Vinculo dismissed — pares de grupos descartados para fusión
            try:
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS crm.vinculo_dismissed (
                        partner_a    INT NOT NULL,
                        partner_b    INT NOT NULL,
                        reason       TEXT,
                        dismissed_at TIMESTAMPTZ DEFAULT now(),
                        dismissed_by TEXT,
                        PRIMARY KEY (partner_a, partner_b),
                        CHECK (partner_a < partner_b)
                    );
                """)
            except Exception as e:
                print(f"[startup_ddl] WARN vinculo_dismissed: {e}")

            # D7) Locales comerciales — múltiples puntos de venta por cuenta
            # Una cuenta puede tener varios locales (calle, galería, mercado,
            # boutique, mall). Uno de ellos se marca como principal. Geocoded
            # para mostrar en mapa interactivo (Leaflet).
            try:
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS crm.cuenta_local (
                        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        cuenta_partner_odoo_id INT  NOT NULL,
                        nombre                 TEXT,
                        tipo                   TEXT NOT NULL DEFAULT 'calle'
                                               CHECK (tipo IN ('galeria','calle','mercado','boutique','mall','otro')),
                        referencia             TEXT,
                        direccion              TEXT,
                        distrito               TEXT,
                        departamento           TEXT,
                        pais                   TEXT DEFAULT 'PE',
                        horario                TEXT,
                        latitud                NUMERIC(10,7),
                        longitud               NUMERIC(10,7),
                        es_principal           BOOLEAN NOT NULL DEFAULT false,
                        foto_url               TEXT,
                        activo                 BOOLEAN NOT NULL DEFAULT true,
                        created_at             TIMESTAMPTZ DEFAULT now(),
                        created_by             TEXT,
                        updated_at             TIMESTAMPTZ DEFAULT now(),
                        updated_by             TEXT
                    );
                """)
                # Solo un local principal por cuenta (parcial unique)
                await conn.execute("""
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_cuenta_local_principal
                        ON crm.cuenta_local (cuenta_partner_odoo_id)
                        WHERE es_principal = true AND activo = true;
                """)
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_cuenta_local_cuenta
                        ON crm.cuenta_local (cuenta_partner_odoo_id)
                        WHERE activo = true;
                """)
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_cuenta_local_tipo
                        ON crm.cuenta_local (tipo) WHERE activo = true;
                """)
            except Exception as e:
                print(f"[startup_ddl] WARN crm.cuenta_local: {e}")

            # D6) Pipeline comercial — asignación de seguimiento del día
            try:
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS crm.asignacion_seguimiento (
                        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        cuenta_partner_odoo_id INT  NOT NULL,
                        asignado_a             TEXT NOT NULL,
                        asignado_por           TEXT NOT NULL,
                        asignado_at            TIMESTAMPTZ DEFAULT NOW(),
                        estado                 TEXT NOT NULL DEFAULT 'asignados',
                        moved_at               TIMESTAMPTZ DEFAULT NOW(),
                        marca                  TEXT,
                        nota                   TEXT,
                        reprogramar_para       DATE,
                        cerrada                BOOLEAN DEFAULT FALSE,
                        closed_at              TIMESTAMPTZ,
                        created_at             TIMESTAMPTZ DEFAULT NOW(),
                        updated_at             TIMESTAMPTZ DEFAULT NOW(),
                        CHECK (estado IN ('asignados','contactado','interesado','catalogo_enviado',
                                           'pedido_en_conversacion','pago_pendiente','compro',
                                           'reprogramar','no_responde','no_interesado'))
                    );
                """)
                await conn.execute("""
                    CREATE UNIQUE INDEX IF NOT EXISTS uniq_asignacion_activa
                    ON crm.asignacion_seguimiento(cuenta_partner_odoo_id, asignado_a, (COALESCE(marca, '')))
                    WHERE cerrada = false;
                """)
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_asig_vendedor ON crm.asignacion_seguimiento(asignado_a) WHERE cerrada = false")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_asig_cuenta ON crm.asignacion_seguimiento(cuenta_partner_odoo_id)")
                await conn.execute("CREATE INDEX IF NOT EXISTS idx_asig_estado ON crm.asignacion_seguimiento(estado) WHERE cerrada = false")
            except Exception as e:
                print(f"[startup_ddl] WARN asignacion_seguimiento: {e}")

            estado_count = await conn.fetchval(
                "SELECT COUNT(*) FROM crm.mv_cuenta_estado"
            )
            if estado_count == 0:
                t0 = time.monotonic()
                try:
                    await conn.execute(
                        "REFRESH MATERIALIZED VIEW CONCURRENTLY crm.mv_cuenta_estado"
                    )
                except Exception:
                    await conn.execute(
                        "REFRESH MATERIALIZED VIEW crm.mv_cuenta_estado"
                    )
                elapsed = time.monotonic() - t0
                print(f"[startup_ddl] mv_cuenta_estado primer refresh en {elapsed:.1f}s")
            else:
                print(f"[startup_ddl] mv_cuenta_estado ya poblada ({estado_count} filas)")
        except Exception as e:
            print(f"[startup_ddl] WARN mv_cuenta_estado: {e}")
