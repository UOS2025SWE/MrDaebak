FROM python:3.11-slim

WORKDIR /app

# psycopg2 등의 빌드 의존성 (wheel이 없는 경우 대비)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# uv 설치
RUN pip install --upgrade pip uv

# uv가 CPython 3.11을 사용하도록 강제 (미리 릴리스 버전 다운로드 방지)
ENV UV_PYTHON=3.11

COPY pyproject.toml uv.lock /app/
RUN uv sync --no-dev --python 3.11

COPY backend /app/backend

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]