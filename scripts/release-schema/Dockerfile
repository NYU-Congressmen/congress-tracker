FROM python:3.13-slim

RUN pip install --no-cache-dir 'psycopg[binary]==3.3.6'
COPY check.py /app/check.py
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/python", "-I", "/app/check.py"]
