import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { auth } from "../firebase";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";

// แปลงเป็น YYYY-MM-DD ตามเวลาไทย (+7)
const toThaiYMD = (src) => {
  const d = new Date(src);
  d.setHours(d.getHours() + 7);
  return d.toISOString().split("T")[0];
};

export default function EditDailyRecord() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mouseId, recordId } = useParams();

  const [formData, setFormData] = useState({
    date: "",
    weight: "",
    groupName: "",
  });
  const [volumeIntake, setVolumeIntake] = useState("");
  const [usedDates, setUsedDates] = useState([]);
  const [loading, setLoading] = useState(true);

  // วันนี้ (ไทย) สำหรับ max
  const maxDate = toThaiYMD(new Date());

  useEffect(() => {
    const fetchRecordAndDates = async () => {
      try {
        setLoading(true);

        const user = auth.currentUser;
        if (!user) {
          alert("Please log in");
          navigate("/login", { replace: true, state: { from: location } });
          return;
        }
        const idToken = await user.getIdToken(true);

        // 1) ดึงข้อมูล record เดิม
        const r1 = await fetch(`${BACKEND_URL}/api/records/${recordId}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const rec = await r1.json();
        if (!r1.ok) throw new Error(rec?.message || "Failed to fetch record");

        setFormData({
          date: toThaiYMD(rec.date),
          weight: rec?.weight ?? "",
          groupName: rec?.group?.name ?? "",
        });

        const w = parseFloat(rec?.weight ?? 0);
        const vi = Math.min((Number.isFinite(w) ? w : 0) / 200, 0.2);
        setVolumeIntake(vi.toFixed(3));

        // 2) ดึงวันที่ที่ใช้แล้วของหนูตัวนี้ (ยกเว้น record ปัจจุบัน)
        const r2 = await fetch(`${BACKEND_URL}/api/mice/${mouseId}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const mouse = await r2.json();
        if (!r2.ok) throw new Error(mouse?.message || "Failed to fetch mouse");

        const dateList = (mouse.dailyRecord ?? [])
          .filter((x) => x._id !== recordId)
          .map((x) => toThaiYMD(x.date));
        setUsedDates(dateList);
      } catch (err) {
        console.error("Error fetching data:", err);
        alert(err.message || "Error fetching data");
      } finally {
        setLoading(false);
      }
    };

    fetchRecordAndDates();
  }, [recordId, mouseId, navigate, location]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...formData, [name]: value };
    setFormData(next);

    if (name === "weight") {
      const weightVal = parseFloat(value);
      if (!Number.isNaN(weightVal) && weightVal >= 0) {
        setVolumeIntake(Math.min(weightVal / 200, 0.2).toFixed(3));
      } else {
        setVolumeIntake("");
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (usedDates.includes(formData.date)) {
      alert("Existing record for this date. Please choose another date.");
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        alert("Please log in");
        navigate("/login", { replace: true, state: { from: location } });
        return;
      }
      const idToken = await user.getIdToken(true);

      const res = await fetch(`${BACKEND_URL}/api/records/${recordId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(formData),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || "Could not edit");

      alert("Edit successful!");
      // กลับไปหน้าเดิม (Mouse Detail) หรือ fallback ไปที่ /mouse/:id
      if (location.key !== "default") navigate(-1);
      else navigate(`/mouse/${mouseId}`, { replace: true });
    } catch (err) {
      console.error(err);
      alert(err.message || "Error connecting to server.");
    }
  };

  if (loading) return <div className="card" style={{ maxWidth: 780, margin: "0 auto" }}>Loading...</div>;

  return (
    <div className="card" style={{ maxWidth: 780, margin: "0 auto" }}>
      {/* Toolbar */}
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Edit Daily Record</h3>
        <div className="btn-group">
          {/* <button type="button" className="btn" onClick={() => (location.key !== "default" ? navigate(-1) : navigate(`/mouse/${mouseId}`))}>
            Back
          </button> */}

        </div>
      </div>

      {/* Form */}
      <form id="editRecordForm" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>Date</label>
          <input
            className="input"
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            min="2020-01-01"
            max={maxDate}
            required
          />
        </div>
        {usedDates.includes(formData.date) && (
          <p style={{ color: "var(--danger)", marginTop: -8, marginBottom: 8 }}>
            Existing record for this date. Please choose another date.
          </p>
        )}

        <div className="form-row">
          <label>Group</label>
          <input
            className="input"
            type="text"
            name="groupName"
            value={formData.groupName}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-row">
          <label>Body weight (g)</label>
          <input
            className="input"
            type="number"
            name="weight"
            min="0"
            step="any"
            value={formData.weight}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-row">
          <label>Volume Intake (mL)</label>
          <input
            className="input"
            type="text"
            value={volumeIntake}
            readOnly
          />
        </div>

        <button type="submit" form="editRecordForm" className="btn primary">
            submit
          </button>
      </form>
    </div>
  );
}
