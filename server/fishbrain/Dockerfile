FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FISH_BRAIN_PORT=8091 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
WORKDIR /app
RUN useradd --create-home --uid 1000 brain
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py connectome.py README.md UPSTREAM.md ./
COPY data ./data
USER brain
EXPOSE 8091
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import json,urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:8091/health',timeout=2))['ready']"
CMD ["python", "worker.py"]
