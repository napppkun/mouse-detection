// src/pages/CreateTest.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  X,
  Upload,
  ChevronLeft,
  ChevronRight,
  Trash,
} from "lucide-react";
import { auth } from "../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/app.css";

const API_BASE = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://127.0.0.1:5000";
const MAX_VIDEOS = 10;

export default function CreateTest({ onNext, onPrev }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("Preparing…");
  const [uploadIndex, setUploadIndex] = useState(0);
  const [useTemplate, setUseTemplate] = useState(false);

  const [formData, setFormData] = useState({
    testName: "",
    behaviorTest: "",
    date: "",
    groups: [], // array ของ groupId ที่เลือกหลายอัน
    miceByGroup: {}, // { [groupId]: [{_id, code, dailyRecordId}] }
    videoPairsByGroup: {}, // { [groupId]: [{ video, mouseCode, dailyRecordId }] }
    targetQuadrant: "", // ใช้เมื่อเป็น MWM ("Q1"|"Q2"|"Q3"|"Q4")
  });

  const [availableDates, setAvailableDates] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);

  const [loading, setLoading] = useState({
    dates: false,
    groups: false,
    mice: false,
  });

  // === IMPORTANT: ให้ตรงกับ schema/ฝั่งวิเคราะห์ ===
  const behaviorTestOptions = [
    { value: "ElevatedPlusMaze", label: "Elevated Plus Maze" },
    { value: "Ymaze", label: "Y-maze" },
    { value: "MorrisWaterMaze", label: "Morris Water Maze" },
  ];

  // ---------------- helpers ----------------
  const ensureAuthedFetch = async (path) => {
    const u = auth.currentUser;
    if (!u) {
      alert("Please log in");
      navigate("/login", { replace: true, state: { from: location } });
      throw new Error("Unauthenticated");
    }
    const idToken = await u.getIdToken(true);
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (!res.ok) throw new Error(data?.message || text || "Request failed");
    return data;
  };

  async function getSignedUrl(filename, contentType) {
    const u = auth.currentUser;
    const token = await u.getIdToken(true);
    const res = await fetch(`${API_BASE}/api/uploads/sign`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filename, contentType }),
    });
    if (!res.ok) throw new Error("sign url failed");
    return await res.json(); // { uploadUrl, objectPath }
  }

  async function putToGcs(uploadUrl, file) {
    const r = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!r.ok) throw new Error("GCS upload failed");
  }

  async function registerUploadedVideo({ objectPath, file, mouseCode, dailyRecordId, testId }) {
    const u = auth.currentUser;
    const token = await u.getIdToken(true);
    const res = await fetch(`${API_BASE}/api/videos/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        objectPath,                  // "videos/<uid>/<uuid>-<ts>.mp4"
        originalName: file.name,
        mimetype: file.type,
        size: file.size,
        mouseCode,
        dailyRecordId,
        testId,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || "register failed");
    return json.data; // video doc
  }

  const addFilesToGroup = (groupId, files) => {
    const existed = new Set(
      (formData.videoPairsByGroup[groupId] || []).map((p) => p.video.name)
    );
    const toAdd = files
      .filter((f) => f.type.startsWith("video/"))
      .filter((f) => !existed.has(f.name))
      .map((f) => ({ video: f, mouseCode: "", dailyRecordId: "" }));
    if (toAdd.length) {
      setFormData((p) => ({
        ...p,
        videoPairsByGroup: {
          ...p.videoPairsByGroup,
          [groupId]: [...(p.videoPairsByGroup[groupId] || []), ...toAdd],
        },
      }));
    }
  };

  const removeVideoPair = (groupId, idx) => {
    setFormData((p) => ({
      ...p,
      videoPairsByGroup: {
        ...p.videoPairsByGroup,
        [groupId]: (p.videoPairsByGroup[groupId] || []).filter(
          (_, i) => i !== idx
        ),
      },
    }));
  };

  const setMouseForPair = (groupId, idx, code) => {
    const rec = (formData.miceByGroup[groupId] || []).find(
      (m) => m.code === code
    );
    setFormData((p) => ({
      ...p,
      videoPairsByGroup: {
        ...p.videoPairsByGroup,
        [groupId]: (p.videoPairsByGroup[groupId] || []).map((it, i) =>
          i === idx
            ? {
              ...it,
              mouseCode: code,
              dailyRecordId: rec?.dailyRecordId || "",
            }
            : it
        ),
      },
    }));
  };

  // ---------------- load chains ----------------
  useEffect(() => {
    (async () => {
      try {
        setLoading((s) => ({ ...s, dates: true }));
        const resp = await ensureAuthedFetch("/api/records/dates");
        const arr = Array.isArray(resp) ? resp : resp?.dates || [];
        setAvailableDates(arr);
      } catch (e) {
        console.error(e);
        setAvailableDates([]);
      } finally {
        setLoading((s) => ({ ...s, dates: false }));
      }
    })();
  }, []); // first mount

  // load groups เมื่อ date เปลี่ยน
  useEffect(() => {
    (async () => {
      if (!formData.date) {
        setAvailableGroups([]);
        setFormData((p) => ({
          ...p,
          groups: [],
          miceByGroup: {},
          videoPairsByGroup: {},
        }));
        return;
      }
      setLoading((s) => ({ ...s, groups: true }));
      try {
        const resp = await ensureAuthedFetch(
          `/api/records/groups?date=${encodeURIComponent(formData.date)}`
        );
        const arr = Array.isArray(resp) ? resp : resp?.groups || [];
        setAvailableGroups(arr);
        // reset selections if current ones not in list
        setFormData((p) => {
          const validIds = new Set(arr.map((g) => String(g._id)));
          const nextGroups = (p.groups || []).filter((id) =>
            validIds.has(String(id))
          );
          const nextMice = Object.fromEntries(
            nextGroups.map((id) => [id, p.miceByGroup?.[id] || []])
          );
          const nextPairs = Object.fromEntries(
            nextGroups.map((id) => [id, p.videoPairsByGroup?.[id] || []])
          );
          return {
            ...p,
            groups: nextGroups,
            miceByGroup: nextMice,
            videoPairsByGroup: nextPairs,
          };
        });
      } finally {
        setLoading((s) => ({ ...s, groups: false }));
      }
    })();
  }, [formData.date]);

  // ---------------- group select ----------------
  const groupOptions = availableGroups.map((g) => ({
    value: g._id,
    label: g.name || g._id,
  }));
  const onChangeGroups = async (nextIds) => {
    setFormData((p) => ({ ...p, groups: nextIds }));
    // fetch mice per new group
    for (const gid of nextIds) {
      if (formData.miceByGroup?.[gid]) continue;
      try {
        const data = await ensureAuthedFetch(
          `/api/records/mice?date=${encodeURIComponent(
            formData.date
          )}&group=${encodeURIComponent(gid)}`
        );
        const arr = Array.isArray(data) ? data : data?.mice || [];
        setFormData((p) => ({
          ...p,
          miceByGroup: { ...p.miceByGroup, [gid]: arr },
          videoPairsByGroup: {
            ...p.videoPairsByGroup,
            [gid]: p.videoPairsByGroup?.[gid] || [],
          },
        }));
      } catch {
        setFormData((p) => ({
          ...p,
          miceByGroup: { ...p.miceByGroup, [gid]: [] },
          videoPairsByGroup: { ...p.videoPairsByGroup, [gid]: [] },
        }));
      }
    }

    // remove mice/pairs for removed groups
    setFormData((p) => {
      const keep = new Set(nextIds.map(String));
      const mice = Object.fromEntries(
        Object.entries(p.miceByGroup || {}).filter(([k]) => keep.has(String(k)))
      );
      const pairs = Object.fromEntries(
        Object.entries(p.videoPairsByGroup || {}).filter(([k]) =>
          keep.has(String(k))
        )
      );
      return { ...p, miceByGroup: mice, videoPairsByGroup: pairs };
    });
  };

  // ---------------- clear mwm target when not mwm ----------------
  useEffect(() => {
    if (
      formData.behaviorTest !== "MorrisWaterMaze" &&
      formData.targetQuadrant
    ) {
      setFormData((p) => ({ ...p, targetQuadrant: "" }));
    }
  }, [formData.behaviorTest, formData.targetQuadrant]);

  const handleInputChange = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));


  const allPairs = formData.groups.flatMap(
    (gid) => formData.videoPairsByGroup[gid] || []
  );
  const ready =
    formData.testName.trim() &&
    formData.behaviorTest &&
    formData.date &&
    formData.groups.length > 0 &&
    (formData.behaviorTest !== "MorrisWaterMaze" ||
      !!formData.targetQuadrant) &&
    allPairs.length > 0 &&
    formData.groups.every(
      (gid) =>
        (formData.videoPairsByGroup[gid] || []).length > 0 &&
        (formData.videoPairsByGroup[gid] || []).every(
          (p) => p.mouseCode && p.dailyRecordId
        )
    );

  const handleNext = async () => {
    if (!ready) return;

    try {
      setIsSubmitting(true);
      setSubmitStatus("Creating test…");
      setUploadIndex(0);

      const u = auth.currentUser;
      if (!u) throw new Error("Please log in");
      const idToken = await u.getIdToken(true);

      const allPairs = formData.groups.flatMap(
        (gid) => formData.videoPairsByGroup[gid] || []
      );
      const uniq = new Set(allPairs.map((p) => p.mouseCode));
      if (uniq.size !== allPairs.length) {
        alert("Each mouse code can only be used once.");
        return;
      }

      // resolve groupIds
      const selectedGroupIds = formData.groups; // เป็น _id อยู่แล้วจาก multi-select

      // create Test
      const testRes = await fetch(`${API_BASE}/api/tests`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.testName,
          behaviorTest: formData.behaviorTest,
          date: formData.date,
          groups: selectedGroupIds, // backend รองรับ array: groups: [ObjectId]
        }),
      });
      const testJson = await testRes.json();
      if (!testRes.ok)
        throw new Error(testJson?.message || "Create test failed");
      const testId = testJson?.data?._id || testJson?._id;
      if (!testId) throw new Error("Missing testId from create test");

      // upload videos for each group
      const uploaded = [];
      for (const gid of selectedGroupIds) {
        const pairs = formData.videoPairsByGroup[gid] || [];
        for (const pair of pairs) {
          setUploadIndex((i) => i + 1);
          setSubmitStatus(`Uploading: ${pair.video.name}`);

          // 1) sign
          const { uploadUrl, objectPath } = await getSignedUrl(pair.video.name, pair.video.type);

          // 2) upload to GCS
          await putToGcs(uploadUrl, pair.video);

          // 3) register
          const vdoc = await registerUploadedVideo({
            objectPath,
            file: pair.video,
            mouseCode: pair.mouseCode,
            dailyRecordId: pair.dailyRecordId || "",
            testId,
          });

          // เก็บข้อมูลไว้เหมือนเดิม เพื่อไปหน้า edit-video
          uploaded.push({
            ...pair,
            videoId: vdoc?._id,
            serverUrl: vdoc?.path || vdoc?.processedPath || "",
          });
        }
      }

      // flatten videoPairs และไปหน้า EditVideo
      const state = {
        testId,
        behaviorTest: formData.behaviorTest,
        videoPairs: uploaded, // มี videoId + serverUrl แล้ว
        testName: formData.testName,
        testData: {
          testName: formData.testName,
          date: formData.date,
          behaviorTest: formData.behaviorTest,
        },
        targetQuadrant: formData.targetQuadrant || "Q1",
      };
      setSubmitStatus("Finalizing…");
      if (onNext && typeof onNext === "function") onNext(state);
      if (useTemplate) {
        navigate(`/template-detail/${testId}`, {
          state: {
            testId,
            behaviorTest: formData.behaviorTest,
            testName: formData.testName,
            videoPairs: uploaded,
            targetQuadrant: formData.targetQuadrant || "Q1",
          }
        });
        return; // ไม่ไป edit-video ตอนนี้
      }
      navigate(`/edit-video/${testId}`, { state });
    } catch (e) {
      console.error("Error creating test:", e);
      alert(e?.message || "Create test failed");
    } finally {
      setIsSubmitting(false);
      setSubmitStatus("Preparing…");
      setUploadIndex(0);
    }
  };

  const handlePrev = () =>
    onPrev && typeof onPrev === "function"
      ? onPrev()
      : navigate("/manage-test");

  function CustomSelect({
    value,
    onChange,
    options,
    placeholder,
    loading = false,
    disabled = false,
    searchable = true,
    clearable = true,
  }) {
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState("");
    const ref = useRef(null);

    const selected = options.find((o) => o.value === value);
    const filtered = useMemo(() => {
      const q = filter.trim().toLowerCase();
      return q && searchable
        ? options.filter((o) => o.label.toLowerCase().includes(q))
        : options;
    }, [options, filter, searchable]);

    useEffect(() => {
      const onDocClick = (e) => {
        if (!ref.current) return;
        if (!ref.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    const clearValue = (e) => {
      e.stopPropagation();
      if (disabled) return;
      onChange("");
      setFilter("");
      setOpen(false);
    };

    return (
      <div className={`select ${disabled ? "is-disabled" : ""}`} ref={ref}>
        <button
          type="button"
          className={`select-control ${open ? "is-open" : ""}`}
          onClick={() => !disabled && setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={`select-value ${selected ? "has-value" : ""}`}>
            {selected ? selected.label : placeholder}
          </span>
          {clearable && !!value && !disabled && (
            <span className="select-clear" onClick={clearValue} title="Clear">
              <X size={14} />
            </span>
          )}
          <ChevronDown className="select-caret" size={16} />
        </button>

        {open && (
          <div className="select-menu" role="listbox">
            {loading ? (
              <div className="select-empty">Loading…</div>
            ) : (
              <>
                {searchable && (
                  <input
                    autoFocus
                    className="select-search"
                    placeholder="Type to filter…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                )}
                <div className="select-options">
                  {filtered.length === 0 ? (
                    <div className="select-empty">No options</div>
                  ) : (
                    filtered.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`select-option ${opt.value === value ? "is-selected" : ""
                          }`}
                        onClick={() => {
                          onChange(opt.value);
                          setOpen(false);
                          setFilter("");
                        }}
                        role="option"
                        aria-selected={opt.value === value}
                      >
                        {opt.label}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-main">
      <div className="card" style={{ width: "100%", maxWidth: 860 }}>
        <h3>Create Test</h3>

        <div className="form-row onecol" style={{ marginTop: 10 }}>
          <div className="input-group">
            <input
              className="input"
              placeholder=" "
              value={formData.testName}
              onChange={(e) => handleInputChange("testName", e.target.value)}
            />
            <span className="user-label">Test Name *</span>
          </div>
        </div>

        <div className="form-row" style={{ gridTemplateColumns: "160px 1fr" }}>
          <label>Behavioral Test *</label>
          <CustomSelect
            value={formData.behaviorTest}
            onChange={(v) => handleInputChange("behaviorTest", v)}
            options={behaviorTestOptions}
            placeholder="Select behavioral test type"
            searchable={false}
            clearable={true}
          />
        </div>

        <div className="form-row" style={{ gridTemplateColumns: "160px 1fr" }}>
          <label>Date *</label>
          <CustomSelect
            value={formData.date}
            onChange={(v) => handleInputChange("date", v)}
            options={availableDates.map((d) => ({
              value: d,
              label: new Date(d).toLocaleDateString(),
            }))}
            placeholder="Select date"
            loading={loading.dates}
            searchable={true}
            clearable={true}
          />
        </div>

        <div className="form-row" style={{ gridTemplateColumns: "160px 1fr" }}>
          <label>Groups *</label>

          <div className="groups-field">
            <div className="tag-list">
              {groupOptions.map((opt) => {
                const active = formData.groups.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`chip ${active ? "is-selected" : ""}`}
                    aria-pressed={active}
                    onClick={() => {
                      const next = active
                        ? formData.groups.filter((id) => id !== opt.value)
                        : [...formData.groups, opt.value];
                      onChangeGroups(next);
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* สรุปผล: แสดงตลอดเพื่อคงพื้นที่ */}
            <div className="selected-groups">
              {formData.groups.length === 0 ? (
                <span className="muted placeholder">No groups selected</span>
              ) : (
                formData.groups.map((gid) => {
                  const g = availableGroups.find((x) => x._id === gid);
                  const label = g?.name || gid;
                  return (
                    <span key={`sel-${gid}`} className="badge">
                      {label}
                      <span
                        className="x"
                        title="Remove"
                        onClick={() =>
                          onChangeGroups(
                            formData.groups.filter((id) => id !== gid)
                          )
                        }
                      >
                        ×
                      </span>
                    </span>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {formData.behaviorTest === "MorrisWaterMaze" && (
          <div
            className="form-row"
            style={{ gridTemplateColumns: "160px 1fr" }}
          >
            <label>Target Quadrant *</label>
            <CustomSelect
              value={formData.targetQuadrant}
              onChange={(v) => handleInputChange("targetQuadrant", v)}
              options={[
                { value: "Q1", label: "Q1" },
                { value: "Q2", label: "Q2" },
                { value: "Q3", label: "Q3" },
                { value: "Q4", label: "Q4" },
              ]}
              placeholder="Select target quadrant"
              searchable={false}
              clearable={true}
            />
          </div>
        )}

        {/* <div className="form-row onecol" style={{ marginTop: 10 }}>
          <div
            className="btn-group"
            style={{ justifyContent: "space-between", width: "100%" }}
          >
            <label
              className="btn"
              style={{
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Upload size={16} />
              Choose File
              <input
                type="file"
                multiple
                accept="video/*"
                onChange={handleVideoUpload}
                hidden
              />
            </label>
            <div style={{ color: "#6b7280" }}>
              {formData.videoPairs.length > 0
                ? `${formData.videoPairs.length}/${MAX_VIDEOS} video(s)`
                : "No videos uploaded"}
            </div>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            * You can upload up to {MAX_VIDEOS} videos per test.
          </div>
        </div> */}

        {/* Group upload sections */}
        {formData.groups.map((gid) => {
          const mice = formData.miceByGroup[gid] || [];
          const pairs = formData.videoPairsByGroup[gid] || [];
          const used = new Set(pairs.map((p) => p.mouseCode).filter(Boolean));
          const options = mice
            .filter(
              (m) =>
                !used.has(m.code) || pairs.some((p) => p.mouseCode === m.code)
            ) // ให้แก้ลำดับของแถวตัวเองได้
            .map((m) => ({ value: m.code, label: m.code }));

          const gLabel =
            availableGroups.find((g) => g._id === gid)?.name || gid;

          return (
            <div
              key={gid}
              className="card"
              style={{ background: "#f8fafc", marginTop: 10 }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Group: {gLabel}
              </div>

              <div className="form-row onecol">
                <label
                  className="btn"
                  style={{
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Upload size={16} />
                  Choose File(s) for {gLabel}
                  <input
                    type="file"
                    multiple
                    accept="video/*"
                    hidden
                    onChange={(e) => {
                      const fs = Array.from(e.target.files || []);
                      addFilesToGroup(gid, fs);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="muted" style={{ marginTop: 6 }}>
                  {pairs.length > 0
                    ? `${pairs.length}/${MAX_VIDEOS} video(s)`
                    : "No videos uploaded"}
                </div>
              </div>

              <div
                className="card"
                style={{ background: "#eef2f7", marginTop: 8 }}
              >
                {pairs.length === 0 ? (
                  <div className="text-sm" style={{ color: "#6b7280" }}>
                    Upload videos for this group, then select mouse codes.
                  </div>
                ) : (
                  pairs.map((pair, index) => (
                    <div
                      key={`${gid}-${pair.video.name}-${index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 220px 36px",
                        gap: 10,
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {pair.video.name}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {(pair.video.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                      <CustomSelect
                        value={pair.mouseCode}
                        onChange={(v) => setMouseForPair(gid, index, v)}
                        options={options}
                        placeholder="Select mouse code"
                        loading={loading.mice}
                      />
                      <button
                        type="button"
                        onClick={() => removeVideoPair(gid, index)}
                        className="icon-btn danger"
                        aria-label="Remove video"
                        title="Remove video"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}

        <div className="form-row" style={{ gridTemplateColumns: "160px 1fr" }}>
          <label className="switch">
            <input type="checkbox" checked={useTemplate} onChange={e => setUseTemplate(e.target.checked)} />
            <span className="slider" />
          </label>
          <label>Create Template for all videos</label>
        </div>

        <div
          className="btn-group"
          style={{ justifyContent: "space-between", marginTop: 16 }}
        >
          <button type="button" className="btn" onClick={handlePrev}>
            <ChevronLeft size={16} /> Prev
          </button>
          <button
            type="button"
            className={`btn primary ${isSubmitting ? "is-loading" : ""}`}
            onClick={handleNext}
            disabled={!ready || isSubmitting}
          >
            {isSubmitting ? "Uploading…" : "Next"} <ChevronRight size={16} />
          </button>
        </div>
      </div>
      {/* Full-screen loading overlay */}
      {isSubmitting && (
        <div
          aria-live="polite"
          role="status"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(17,24,39,.55)",
            backdropFilter: "blur(2px)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
          }}
        >
          <div
            className="card"
            style={{
              width: 360,
              textAlign: "center",
              padding: 24,
              boxShadow: "0 10px 30px rgba(0,0,0,.2)",
            }}
          >
            <div
              className="spinner"
              style={{
                width: 36,
                height: 36,
                border: "3px solid #e5e7eb",
                borderTopColor: "#111827",
                borderRadius: "50%",
                margin: "0 auto 12px",
                animation: "spin 0.9s linear infinite",
              }}
            />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {submitStatus}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {uploadIndex > 0
                ? `Please keep this tab open (video ${uploadIndex}/${allPairs.length}).`
                : "Please keep this tab open."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
