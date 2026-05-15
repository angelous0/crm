FROM python:3.11-slim

WORKDIR /app

# Dependencias del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python primero (caché de capas)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código
COPY . .

# Variables de entorno por defecto (override desde EasyPanel)
ENV PORT=8004 \
    HOST=0.0.0.0 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8004

# Healthcheck — EasyPanel lo usa para saber si el container está sano
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8004/docs || exit 1

# Producción: SIN --reload, con workers > 1 si tenés CPU para gastar
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8004", "--log-level", "info", "--workers", "1"]
