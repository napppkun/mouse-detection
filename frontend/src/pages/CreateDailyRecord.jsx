import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";

const CreateDailyRecord = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    date: "",
    weight: "",
    group: "",
    volumeIntake: "",
    rat: "",
  });

  const [loading, setLoading] = useState(true);
  const [rats, setRats] = useState([]);

  useEffect(() => {
    const fetchRats = async () => {
      const token = localStorage.getItem("token");
      if (!token) return alert("กรุณาเข้าสู่ระบบก่อน");

      try {
        const response = await fetch(`${BACKEND_URL}/api/rats`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "เกิดข้อผิดพลาดในการดึงข้อมูล");
        }

        setRats(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Error fetching rat data:", error);
        alert("ไม่สามารถโหลดข้อมูลหนูทดลองได้");
      } finally {
        setLoading(false);
      }
    };

    fetchRats();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) return alert("กรุณาเข้าสู่ระบบก่อน");

    try {
      const response = await fetch(`${BACKEND_URL}/api/daily-records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "เกิดข้อผิดพลาดในการสร้างข้อมูล");
      }

      alert("สร้างข้อมูลสำเร็จ!");
      navigate(`/rat/${formData.rat}/daily-record`);
    } catch (error) {
      console.error("Error creating daily record:", error);
      alert("ไม่สามารถสร้างข้อมูลได้");
    }
  };

  if (loading) return <p>กำลังโหลดข้อมูล...</p>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold">เพิ่มข้อมูล Daily Record</h2>
      <form onSubmit={handleSubmit} className="mt-4">
        <div className="mb-4">
          <label className="block mb-1">วันที่ทำการทดลอง</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            className="border p-2 w-full"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">น้ำหนัก (กรัม)</label>
          <input
            type="number"
            name="weight"
            value={formData.weight}
            onChange={handleChange}
            className="border p-2 w-full"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">Group</label>
          <select
            name="group"
            value={formData.group}
            onChange={handleChange}
            className="border p-2 w-full"
            required
          >
            <option value="">เลือกกลุ่มยา</option>
            {/* Map through group options here */}
          </select>
        </div>
        <div className="mb-4">
          <label className="block mb-1">ปริมาณน้ำที่ดื่ม</label>
          <input
            type="number"
            name="volumeIntake"
            value={formData.volumeIntake}
            onChange={handleChange}
            className="border p-2 w-full"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1">หนูทดลอง</label>
          <select
            name="rat"
            value={formData.rat}
            onChange={handleChange}
            className="border p-2 w-full"
            required
          >
            <option value="">เลือกหนูทดลอง</option>
            {rats.map((rat) => (
              <option key={rat._id} value={rat._id}>
                {rat.code}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
          สร้างข้อมูล
        </button>
      </form>
    </div>
  );
};

export default CreateDailyRecord;
