FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FLY_BRAIN_ROOT=/opt/fly-brain \
    FLY_BRAIN_DEVICE=cpu FLY_BRAIN_THREADS=2 FLY_BRAIN_PORT=8090 \
    FLY_BRAIN_ENGINE=fast NUMBA_NUM_THREADS=2
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
COPY setup.py upstream.json ./
RUN python setup.py --root /opt/fly-brain && useradd --create-home --uid 1000 brain \
    && chown -R brain:brain /opt/fly-brain /app
COPY worker.py populations.py fastfly.py ./
USER brain
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s --start-period=120s --retries=3 \
  CMD python -c "import json,urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:8090/health',timeout=2))['ready']"
CMD ["python", "worker.py"]
