// controllers/uploads.js
import { Storage } from "@google-cloud/storage";
import { v4 as uuid } from "uuid";

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  credentials: JSON.parse(process.env.GOOGLE_CLOUD_KEY),
});
const bucketName = process.env.GOOGLE_CLOUD_BUCKET;

export async function getSignedUploadUrl(req, res) {
  try {
    const ownerUid = req.user.ownerUid || req.user.uid;
    const { filename, contentType } = req.body || {};
    if (!filename || !contentType) {
      return res.status(400).json({ message: "filename & contentType required" });
    }

    const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
    const objectPath = `videos/${ownerUid}/${uuid()}-${Date.now()}${ext}`;
    const file = storage.bucket(bucketName).file(objectPath);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000, // 15 นาที
      contentType,
    });

    return res.json({ uploadUrl: url, objectPath });
  } catch (e) {
    console.error("getSignedUploadUrl error:", e);
    return res.status(500).json({ message: e.message });
  }
}
