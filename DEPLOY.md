# Deploy CRM B2B en EasyPanel (Hostinger)

Dominio final: **https://crm.ambissionindustries.cloud**

## 📦 Lo que vamos a deployar

```
EasyPanel project "crm-hilo":
├── crm-backend  (FastAPI, puerto 8004 interno)
├── crm-frontend (Nginx servidor de React, puerto 80 interno)
└── postgres     (ya existe — la DB compartida con Ventas)
```

El **dominio público** apunta al `crm-frontend`. Nginx interno del frontend hace proxy de `/api/*` al `crm-backend` por la red privada del proyecto (sub-ms).

---

## 🚀 Pasos en EasyPanel

### 1. Crear (o reutilizar) el proyecto

EasyPanel → **+ Project** → nombre `crm-hilo`.
(Si querés meter todo —Ventas + CRM + Producción— en el mismo proyecto, mejor: networking interno gratis entre todos.)

### 2. Deploy del backend

EasyPanel → tu proyecto → **+ Service** → **App**.

**Configuración:**
- **Name**: `crm-backend`
- **Source**: GitHub (apuntá al repo)
  - **Build path**: `crm/backend`
  - **Dockerfile**: `Dockerfile` (ya está en esa carpeta)
- **Environment variables** (pestaña Env):
  ```
  DATABASE_URL=postgresql://admin:admin@postgres:5432/datos
  JWT_SECRET_KEY=<tu secret actual>
  CORS_ORIGINS=https://crm.ambissionindustries.cloud
  ODOO_BACKEND_URL=http://odoo-backend:8002
  VENTAS_VIVO_INTERVAL=30
  VENTAS_VIVO_TIMEOUT=50
  ```
  > **Importante**: `DATABASE_URL` usa hostname `postgres` (el container de Postgres en el mismo proyecto), no la IP pública. Por eso será **<1ms** por query en vez de 300ms.
- **Port**: `8004` (no exponer público — solo se accede vía proxy del frontend)

Click **Deploy**.

### 3. Deploy del frontend

EasyPanel → tu proyecto → **+ Service** → **App**.

**Configuración:**
- **Name**: `crm-frontend`
- **Source**: GitHub (mismo repo)
  - **Build path**: `crm/frontend`
  - **Dockerfile**: `Dockerfile`
- **Build args**:
  ```
  REACT_APP_BACKEND_URL=https://crm.ambissionindustries.cloud
  ```
  > Este URL se "embute" en el bundle JS en build-time (React lo lee en compile). El browser llamará a `https://crm.ambissionindustries.cloud/api/*` y nginx lo redirige internamente.
- **Port**: `80`
- **Domains**: agregar `crm.ambissionindustries.cloud`
  - EasyPanel ofrece Let's Encrypt automático — activalo

Click **Deploy**.

### 4. Configurar el DNS

En el panel de tu dominio (Hostinger DNS o donde tengas `ambissionindustries.cloud`):

```
Tipo:   A
Host:   crm
Valor:  <IP pública del VPS>     ← srv1039344.hstgr.cloud
TTL:    300
```

Esperá 5-10 min a que propague.

### 5. Verificar

Una vez propagado el DNS:

```bash
curl -I https://crm.ambissionindustries.cloud/
# → HTTP/2 200 + Server: nginx

curl -I https://crm.ambissionindustries.cloud/api/docs
# → HTTP/2 200 (FastAPI Swagger)
```

Abrir en browser → debería pedir login.

---

## 🔐 Variables de entorno mínimas

Lo único OBLIGATORIO a configurar antes de deployar:

| Variable | Donde | Valor |
|---|---|---|
| `DATABASE_URL` | crm-backend env | `postgresql://admin:admin@postgres:5432/datos` |
| `JWT_SECRET_KEY` | crm-backend env | random string (mantener IGUAL al que tenés ahora para no invalidar tokens) |
| `CORS_ORIGINS` | crm-backend env | `https://crm.ambissionindustries.cloud` |
| `ODOO_BACKEND_URL` | crm-backend env | `http://odoo-backend:8002` (si el backend Odoo vive en el mismo proyecto) |
| `REACT_APP_BACKEND_URL` | crm-frontend build args | `https://crm.ambissionindustries.cloud` |

---

## 🧪 Probar antes en local (opcional)

Antes de pushear a producción:

```bash
cd crm
# Crear archivo .env con tus valores
cat > .env <<EOF
DATABASE_URL=postgresql://admin:admin@72.60.241.216:9595/datos?sslmode=disable
JWT_SECRET_KEY=tu_secret
CORS_ORIGINS=http://localhost
PUBLIC_BACKEND_URL=http://localhost
ODOO_BACKEND_URL=http://host.docker.internal:8002
EOF

docker compose up --build
```

Abrir http://localhost — deberías ver el login.

---

## 🔄 Actualizar después de cambios

Cada vez que pushees a la rama (main o la que apuntes en EasyPanel):

- EasyPanel tiene **auto-deploy** si conectaste el webhook de GitHub
- Sino, click manual **"Redeploy"** en cada servicio

---

## 🛠️ Troubleshooting

**El frontend carga pero `/api/*` devuelve 502**
→ El backend no está corriendo o no responde. Revisar logs del `crm-backend` en EasyPanel.

**El backend no se conecta a la DB**
→ Verificar que `DATABASE_URL` use hostname `postgres` (no la IP) y que el container de Postgres esté en el MISMO proyecto.

**El frontend se queda en pantalla blanca**
→ Probablemente `REACT_APP_BACKEND_URL` mal configurado. Como se inyecta en build-time, requiere **rebuild** (no basta con cambiar la env var).

**Slow queries**
→ Si las queries siguen lentas, no es Hostinger sino el código. Avisame y optimizamos.
