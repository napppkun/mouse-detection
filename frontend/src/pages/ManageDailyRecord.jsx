import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";

const ManageDailyRecord = () => {
  const navigate = useNavigate();
  const [dailyRecords, setDailyRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDailyRecords = async () => {
      const token = localStorage.getItem("token");
      if (!token) return alert("กรุณาเข้าสู่ระบบก่อน");

      try {
        const response = await fetch(`${BACKEND_URL}/api/rats/daily-records`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "เกิดข้อผิดพลาดในการดึงข้อมูล");
        }

        setDailyRecords(Array.isArray(data) ? data : []); // ป้องกัน map error
      } catch (error) {
        console.error("Error fetching daily record data:", error);
        alert("ไม่สามารถโหลดข้อมูลบันทึกประจำวันได้");
      } finally {
        setLoading(false);
      }
    };

    fetchDailyRecords();
  }, []);

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm("คุณต้องการลบข้อมูลบันทึกประจำวันนี้ใช่หรือไม่?");
    if (!confirmDelete) return;
    const token = localStorage.getItem("token");
    if (!token) return alert("กรุณาเข้าสู่ระบบก่อน");

    try {
      const response = await fetch(`${BACKEND_URL}/api/rats/daily-record/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (response.ok) {
        alert("ลบข้อมูลสำเร็จ!");
        setDailyRecords((prev) => prev.filter((record) => record._id !== id));
      } else {
        alert("ลบไม่สำเร็จ: " + result.message);
      }
    } catch (error) {
      console.error("Error deleting daily record data:", error);
      alert("เกิดข้อผิดพลาดในการลบข้อมูล");
    }
  };


  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold">จัดการข้อมูลบันทึกประจำวัน</h2>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded mt-4"
        onClick={() => navigate("/create-daily-record")}
      >
        เพิ่มข้อมูลบันทึกประจำวัน
      </button>

      <div className="mt-4 bg-white p-6 rounded shadow">
        {loading ? (
          <p>กำลังโหลดข้อมูล...</p>
        ) : dailyRecords.length === 0 ? (
          <p>ไม่พบข้อมูลบันทึกประจำวัน</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-200">
                <th className="border p-2">Date</th>
                <th className="border p-2">Weight</th>
                <th className="border p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dailyRecords.map((record) => (
                <tr key={record._id}>
                  <td className="border p-2">{new Date(record.date).toLocaleDateString()}</td>
                  <td className="border p-2">{record.weight}</td>
                  <td className="border p-2">
                    <button
                      className="bg-yellow-500 text-white px-2 py-1 rounded"
                      onClick={() => navigate(`/edit-daily-record/${record._id}`)}
                    >
                      แก้ไข
                    </button>
                    <button
                      className="bg-red-500 text-white px-2 py-1 rounded ml-2"
                      onClick={() => handleDelete(record._id)}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ManageDailyRecord;
