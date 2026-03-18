FROM python:3.12-slim

WORKDIR /app

# Dependances systeme pour curl_cffi (utilisee par la lib lbc)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic/ alembic/
COPY src/ src/
COPY main.py .

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn src.api:app --host 0.0.0.0 --port 8000"]
