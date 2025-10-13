# services/gcs_uploader.py
import os, mimetypes, posixpath
from datetime import timedelta
from google.cloud import storage

def upload_to_gcs(local_path: str, folder: str, *, expires_hours: int = 48) -> str:
    """
    Upload file then return a V4 signed URL (works with UBLA buckets).
    """
    client = storage.Client(project=os.environ.get("GOOGLE_CLOUD_PROJECT"))
    bucket = client.bucket(os.environ["GOOGLE_CLOUD_BUCKET"])

    filename = os.path.basename(local_path)
    # ใช้ '/' เสมอ (กัน backslash บน Windows)
    blob_name = posixpath.join(folder.strip("/"), filename)
    blob = bucket.blob(blob_name)

    # เดา content-type
    ctype, _ = mimetypes.guess_type(filename)
    if not ctype:
        if filename.lower().endswith(".avi"):
            ctype = "video/x-msvideo"
        elif filename.lower().endswith(".mp4"):
            ctype = "video/mp4"
        else:
            ctype = "application/octet-stream"

    # อัปโหลด
    blob.upload_from_filename(local_path, content_type=ctype)

    # *** ห้ามใช้ make_public() เมื่อเปิด UBLA ***
    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=expires_hours),
        method="GET",
    )
    return url
