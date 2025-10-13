// backend/services/gcsUploader.js
import { Storage } from "@google-cloud/storage";

const credentials = JSON.parse(process.env.GOOGLE_CLOUD_KEY);

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  credentials,
});

// ใช้ bucket เดียวกันทั้งไฟล์
const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET);

async function uploadFileToGCS(file) {
  return new Promise((resolve, reject) => {
    const { originalname, buffer } = file;
    const blob = bucket.file(originalname);

    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: file.mimetype,
    });

    blobStream.on("error", (err) => reject(err));

    blobStream.on("finish", async () => {
      try {
        // คืน signed URL เผื่อบัคเก็ตเป็น private
        const [url] = await blob.getSignedUrl({
          action: "read",
          expires: Date.now() + 24 * 60 * 60 * 1000, // 24 ชม.
        });
        resolve(url);
      } catch (e) {
        // fallback เป็น public URL (ใช้ได้ถ้าบัคเก็ต public)
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        resolve(publicUrl);
      }
    });

    blobStream.end(buffer);
  });
}

export async function uploadBufferToGCS(
  buffer,
  destPath,
  contentType = "application/octet-stream"
) {
  const file = bucket.file(destPath);
  await file.save(buffer, {
    contentType,
    resumable: false,
    validation: false,
  });

  // พยายามคืน signed URL (ใช้ได้เสมอแม้ bucket private)
  try {
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24 ชม.
    });
    return url;
  } catch (e) {
    // fallback เป็น public URL
    return `https://storage.googleapis.com/${bucket.name}/${destPath}`;
  }
}

async function deleteFileFromGCS(objectName) {
  try {
    await bucket.file(objectName).delete({ ignoreNotFound: true });
  } catch (e) {
    console.error("[GCS] delete error", objectName, e.message);
  }
}

export { uploadFileToGCS, deleteFileFromGCS };
