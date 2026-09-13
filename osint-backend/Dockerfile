FROM golang:1.23-alpine AS mosint-builder

RUN go install github.com/alpkeskin/mosint/v3/cmd/mosint@v3.0.0


FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV MOSINT_BIN=/usr/local/bin/mosint
ENV MOSINT_CONFIG=/app/.mosint.yaml

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=mosint-builder /go/bin/mosint /usr/local/bin/mosint

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN test -x /usr/local/bin/mosint
RUN mosint --help >/dev/null

EXPOSE 10000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
