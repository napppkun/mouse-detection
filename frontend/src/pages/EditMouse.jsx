import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";

const EditMouse = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    species: "",
    weight: "",
    medicine: "",
    dose: "",
  });

  // ดึงข้อมูลหนูทดลองตาม ID
  useEffect(() => {
    const fetchMouse = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/mice/${id}`);
        const data = await response.json();
        setFormData(data);
      } catch (error) {
        console.error("Error fetching rat data:", error);
      }
    };

    fetchMouse();
  }, [id]);

  // อัปเดตค่าฟอร์ม
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // ส่งข้อมูลอัปเดตไปที่ API
  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(`${BACKEND_URL}/api/mice/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        alert("อัปเดตข้อมูลสำเร็จ!");
        navigate("/manage-mouse");
      } else {
        alert("เกิดข้อผิดพลาดในการอัปเดตข้อมูล");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold">แก้ไขข้อมูลหนูทดลอง</h2>

      <form onSubmit={handleSubmit} className="mt-4 bg-white p-6 rounded shadow">
        {/* ID (ห้ามแก้ไข) */}
        <label className="block mb-2">ID</label>
        <input type="text" value={id} className="w-full p-2 border rounded mb-4 bg-gray-200" disabled />

        <label className="block mb-2">สายพันธุ์</label>
        <input type="text" name="species" value={formData.species} onChange={handleChange} className="w-full p-2 border rounded mb-4" required />

        <label className="block mb-2">น้ำหนัก (กรัม)</label>
        <input type="number" name="weight" value={formData.weight} onChange={handleChange} className="w-full p-2 border rounded mb-4" required />

        <label className="block mb-2">ยา</label>
        <input type="text" name="medicine" value={formData.medicine} onChange={handleChange} className="w-full p-2 border rounded mb-4" required />

        <label className="block mb-2">โดส</label>
        <input type="text" name="dose" value={formData.medicine} onChange={handleChange} className="w-full p-2 border rounded mb-4" required />

        <div className="flex justify-between">
          {/* ปุ่มย้อนกลับ */}
          <button type="button" className="text-blue-500 hover:underline" onClick={() => navigate("/manage-mouse")}>
            ← ก่อนหน้า
          </button>

          {/* ปุ่มบันทึก */}
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditMouse;