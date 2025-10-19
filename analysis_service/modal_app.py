# analysis_service/modal_app.py
import os, json, sys
import modal

app = modal.App("mouse-analysis")

BASE_ENV = {
    "USE_CUDA": "1",
    "GPU_WORKERS": "1",
    "CPU_WORKERS": "2",
    "BACKEND_URL": "https://backend-360969085581.asia-southeast1.run.app",
}

image = modal.Image.from_dockerfile("Dockerfile").env(BASE_ENV)

GPU_TYPE = "T4"  

@app.function(
    image=image,
    gpu=GPU_TYPE,
    memory="16Gi",
    timeout=7200,
    scaledown_window=300,
    min_containers=1,      # เดิม keep_warm
    max_containers=10,      # เดิม concurrency_limit
    secrets=[modal.Secret.from_name("mouse-secrets")],
)
@modal.asgi_app()
def fastapi_app():
    # โค้ดของคุณอยู่ใน analysis_service (WORKDIR /app จาก Dockerfile)
    # ถ้า main.py import ผ่านได้อยู่แล้ว ไม่ต้องแก้ sys.path
    # แต่ถ้าต้องการชัวร์:
    sys.path.append("/app")
    # ถ้ามี SA JSON ใน secret ชื่อ GCP_SA_JSON ให้เขียนไฟล์ชั่วคราว
    sa_json = os.environ.get("GCP_SA_JSON")
    if sa_json and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        cred_path = "/tmp/gcp.json"
        with open(cred_path, "w") as f:
            f.write(sa_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path

    from main import app as application
    return application
