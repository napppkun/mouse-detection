# analysis_service/modal_app.py
import os, sys
import modal

app = modal.App("mouse-analysis")

BASE_ENV = {
    "USE_CUDA": "1",
    "GPU_WORKERS": "1",
    "CPU_WORKERS": "2",
    "ANALYSIS_FPS": "5",
    "PUSH_INTERVAL": "5.0",
}

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install([
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "libxrender-dev",
        "libgomp1",
        "wget",
    ])
    .pip_install_from_requirements("requirements.txt")
    .add_local_dir(".", remote_path="/app")
    .run_commands(
        "mkdir -p /app/scripts/results/videos /app/scripts/results/excel"
    )
    .env(BASE_ENV)
)

GPU_TYPE = "T4"

@app.function(
    image=image,
    gpu=GPU_TYPE,
    memory="16Gi",
    timeout=7200,
    scaledown_window=600,
    min_containers=1,
    max_containers=10,
    secrets=[modal.Secret.from_name("mouse-secrets")],
)
@modal.asgi_app()
def fastapi_app():
    sys.path.append("/app")

    sa_json = os.environ.get("GCP_SA_JSON")
    if sa_json and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        cred_path = "/tmp/gcp.json"
        with open(cred_path, "w") as f:
            f.write(sa_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path

    from main import app as application
    return application