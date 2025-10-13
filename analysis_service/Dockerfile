FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3-venv \
    python-is-python3 \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    ln -sf /usr/bin/pip3 /usr/bin/pip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p scripts/results/videos scripts/results/excel

ENV PORT=8000 \
    USE_CUDA=1 \
    GPU_WORKERS=4 \
    CPU_WORKERS=2 \
    MODEL_PATH=scripts/model/rat_seg.pt

EXPOSE 8000

# (CMD นี้ Modal จะไม่ใช้เวลารัน function ก็ไม่เป็นไร)
CMD ["gunicorn","main:app","--workers","1","--worker-class","uvicorn.workers.UvicornWorker","--bind","0.0.0.0:8000","--timeout","7200","--worker-tmp-dir","/dev/shm","--access-logfile","-","--error-logfile","-","--log-level","info"]
