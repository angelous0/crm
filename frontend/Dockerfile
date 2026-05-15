# ── Stage 1: build con Node ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copio package.json + lock primero para cachear el install
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# El URL del backend se inyecta en build-time (CRA lo embebe en el bundle).
# EasyPanel debe pasar este ARG al construir la imagen.
ARG REACT_APP_BACKEND_URL=https://crm.ambissionindustries.cloud
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Copio el resto del código y construyo
COPY . .
RUN npm run build

# ── Stage 2: nginx para servir el bundle estático ──────────────────
FROM nginx:1.27-alpine

# Quito la config default y pongo la nuestra
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copio el build del stage anterior
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

# NOTA: deshabilitamos el HEALTHCHECK del Dockerfile.
# nginx:1.27-alpine no garantiza `wget` con flags `--spider`/`--tries`
# funcionando consistentemente, lo que provocaba que Docker marcara
# el container como `unhealthy` aunque nginx estuviera sirviendo OK,
# y EasyPanel respondía con SIGQUIT (kill) en bucle.
# EasyPanel hace su propio chequeo TCP externo del puerto 80, así que
# no necesitamos uno custom acá.
HEALTHCHECK NONE

CMD ["nginx", "-g", "daemon off;"]
