# analysis_service/modal_app.py
import os, sys
import modal

app = modal.App("mouse-analysis")

BASE_ENV = {
    "USE_CUDA": "1",
    "GPU_WORKERS": "1",
    "CPU_WORKERS": "2",
    # ANALYSIS_FPS ควบคุมว่า inference กี่ fps (ค่าเริ่ม 5)
    # เพิ่มได้ถ้าต้องการความแม่นยำขึ้น แต่จะช้าลง
    "ANALYSIS_FPS": "5",
    # throttle push_progress HTTP call ทุก N วินาที (ค่าเริ่ม 5)
    "PUSH_INTERVAL": "5.0",
}

image = modal.Image.from_dockerfile("Dockerfile").env(BASE_ENV)

GPU_TYPE = "T4"

@app.function(
    image=image,
    gpu=GPU_TYPE,
    memory="16Gi",
    timeout=7200,           # 2 ชั่วโมง (วิดีโอยาวสุด)
    scaledown_window=600,   # เพิ่มจาก 300 → 600: container อยู่นาน 10 นาทีหลังไม่มีงาน
                            # ลด cold start เพราะไม่ต้องโหลด YOLO model บ่อย
    min_containers=1,       # keep 1 container warm ตลอด
    max_containers=10,
    secrets=[modal.Secret.from_name("mouse-secrets")],
)
@modal.asgi_app()
def fastapi_app():
    sys.path.append("/app")

    # เขียน GCP service account JSON จาก secret
    sa_json = os.environ.get("GCP_SA_JSON")
    if sa_json and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        cred_path = "/tmp/gcp.json"
        with open(cred_path, "w") as f:
            f.write(sa_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path

    from main import app as application
    return application