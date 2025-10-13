// utils/dateOnly.js
// ฟังก์ชันสำหรับแปลงวันที่เป็น Date ที่เวลาเที่ยงคืน UTC
export const dateOnlyUTC = (input) => {
    if (!input) {
      const now = new Date();
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    }
    // รองรับทั้ง "YYYY-MM-DD" และ Date
    const iso = typeof input === "string"
      ? input
      : new Date(input).toISOString().slice(0, 10);
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  