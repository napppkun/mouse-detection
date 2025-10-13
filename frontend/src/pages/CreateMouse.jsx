// CreateMouse.jsx
import React, { useState } from "react";
import { auth } from "../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/app.css";

import DatePicker, { registerLocale } from "react-datepicker";
import enGB from "date-fns/locale/en-GB";
import "react-datepicker/dist/react-datepicker.css";
registerLocale("en-GB", enGB);

// แปลง Date -> "YYYY-MM-DD" ตามเวลาไทย (+7)
const toThaiYYYYMMDD = (d) => {
  const tz7 = 7 * 60 * 60 * 1000;
  const x = new Date(d.getTime() + tz7);
  return x.toISOString().split("T")[0];
};

// วันนี้ตามเวลาไทย (string และ Date สำหรับ maxDate)
const todayTHString = toThaiYYYYMMDD(new Date());
const todayTHDate = new Date(todayTHString);

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";

const CreateMouse = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    code: "",
    groupName: "",
    weight: "",
    date: todayTHString, // daily record แรก = วันนี้ (ไทย)
  });
  const [volumeIntake, setVolumeIntake] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;

    // อัปเดตทั่วไป
    setFormData((prev) => ({ ...prev, [name]: value }));

    // คำนวณปริมาตรเมื่อพิมพ์น้ำหนัก
    if (name === "weight") {
      const w = parseFloat(value);
      if (!Number.isNaN(w) && w >= 0) {
        const calc = Math.min(w / 200, 0.2);
        setVolumeIntake(calc.toFixed(3));
      } else {
        if (!Number.isNaN(w) && w < 0) alert("น้ำหนักต้องมากกว่าหรือเท่ากับ 0");
        setVolumeIntake("");
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const u = auth.currentUser;
    if (!u) {
      alert("Please log in");
      navigate("/login", { replace: true, state: { from: location } });
      return;
    }

    const idToken = await u.getIdToken(true);
    const payload = {
      code: formData.code,
      groupName: formData.groupName,
      weight: formData.weight,
      volumeIntake,
      date: formData.date, // ส่งแบบ YYYY-MM-DD (ไทย)
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/mice/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const data = (() => { try { return JSON.parse(text); } catch { return { message: text }; } })();

      if (!res.ok) {
        alert("Could not create data: " + (data.message || res.statusText));
        return;
      }

      alert(`Create successfully: ${data.mice?.code || formData.code}`);
      navigate("/manage-mice", { replace: true });
    } catch (err) {
      console.error("Create mouse error:", err);
      alert("Error connect API");
    }
  };

  return (
    <div className="app-main">
      <div className="card" style={{ maxWidth: 640, width: "100%" }}>
        <h3>Create Mouse</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="date">Start date</label>
            <DatePicker
              id="date"
              locale="en-GB"               // ปฏิทินภาษาอังกฤษ
              dateFormat="dd/MM/yyyy"      // รูปแบบอังกฤษ
              selected={new Date(formData.date)}
              maxDate={todayTHDate}        // ไม่เกินวันนี้ (ไทย)
              onChange={(d) => {
                if (!d) return;
                const ymd = toThaiYYYYMMDD(d);
                if (ymd <= todayTHString) {
                  setFormData((p) => ({ ...p, date: ymd }));
                }
              }}
              showPopperArrow
              placeholderText="dd/mm/yyyy"
            />
          </div>

          <div className="form-row onecol">
            <div className="input-group">
              <input
                className="input"
                id="code"
                name="code"
                value={formData.code}
                onChange={handleChange}
                placeholder=" "
                required
              />
              <span className="user-label">CODE</span>
            </div>
          </div>    

          <div className="form-row onecol">
            <div className="input-group">
              <input
                className="input"
                id="groupName"
                name="groupName"
                value={formData.groupName}
                onChange={handleChange}
                placeholder=" "
                required
              />
              <span className="user-label">Group</span>
            </div>
          </div>

          
          <div className="form-row onecol">
            <div className="input-group">
              <input
                className="input"
                id="weight"
                name="weight"
                type="number"
                min="0"
                step="any"
                value={formData.weight}
                onChange={handleChange}
                placeholder=" "
                required
              />
              <span className="user-label">Body weight (g)</span>
            </div>
          </div>

          <div className="form-row onecol">
            <div className="input-group">
              <input className="input" id="volumeIntake" value={volumeIntake} readOnly placeholder=" " />
              <span className="user-label">Volume intake (mL)</span>
            </div>
          </div>

          <div className="form-row">
            <span />
            <button type="submit" className="btn primary">Submit</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateMouse;