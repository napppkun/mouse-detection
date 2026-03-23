# upload_model.py
import modal

model_volume = modal.Volume.from_name("mouse-model", create_if_missing=True)

@app.function(volumes={"/model": model_volume})
def upload():
    import shutil
    shutil.copy("/app/rat_seg.pt", "/model/rat_seg.pt")
    model_volume.commit()