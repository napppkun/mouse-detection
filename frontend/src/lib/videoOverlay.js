// src/lib/videoOverlay.js
export function getVideoContentBox(videoEl) {
    const vw = videoEl.videoWidth || 0;
    const vh = videoEl.videoHeight || 0;
    const r = videoEl.getBoundingClientRect();
    if (!vw || !vh || !r.width || !r.height) {
        return { left: r.left, top: r.top, width: r.width, height: r.height, scaleX: 1, scaleY: 1 };
    }
    const videoAR = vw / vh;
    const elemAR = r.width / r.height;
    let contentW, contentH, offsetX, offsetY;
    if (elemAR > videoAR) {
        contentH = r.height; contentW = contentH * videoAR; offsetX = (r.width - contentW) / 2; offsetY = 0;
    } else {
        contentW = r.width; contentH = contentW / videoAR; offsetX = 0; offsetY = (r.height - contentH) / 2;
    }
    return {
        left: r.left + offsetX,
        top: r.top + offsetY,
        width: contentW,
        height: contentH,
        scaleX: contentW / vw,
        scaleY: contentH / vh,
    };
}