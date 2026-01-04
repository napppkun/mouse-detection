// src/pages/TestDetail.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import "../styles/app.css";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer, Label
} from "recharts";
import TrajectoryCanvas from "../components/TrajectoryCanvas.jsx";

const BACKEND_URL = window._env_?.BACKEND_URL || process.env.BACKEND_URL || "http://localhost:5000";
const API_BASE = `${BACKEND_URL}/api/tests`;
const FILE_PROXY = `${BACKEND_URL}/api/files/proxy`;

export default function TestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [test, setTest] = useState(null);
  const [downloads, setDownloads] = useState({ success: false, data: [], counts: {} });
  const [reportUrl, setReportUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [idToken, setIdToken] = useState("");
  const tokenRef = useRef("");

  // Visualization states
  const [vizTab, setVizTab] = useState("test"); // 'mouse' | 'group' | 'test'
  const [selectedGroupForViz, setSelectedGroupForViz] = useState("ALL");
  const [selectedMouseForViz, setSelectedMouseForViz] = useState("ALL");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        alert("Please log in");
        navigate("/login", { replace: true, state: { from: `/tests/${id}` } });
        return;
      }
      const tok = await u.getIdToken(false);
      tokenRef.current = tok;
      setIdToken(tok);
      hydrate(tok);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function hydrate(tok) {
    try {
      setLoading(true);
      setErr("");
      const [tRes, dRes] = await Promise.all([
        fetch(`${API_BASE}/${id}`, { headers: { Authorization: `Bearer ${tok || idToken}` } }),
        fetch(`${API_BASE}/${id}/downloads`, { headers: { Authorization: `Bearer ${tok || idToken}` } }),
      ]);
      if (!tRes.ok) throw new Error((await tRes.text().catch(() => "")) || "Failed to fetch test");
      if (!dRes.ok) throw new Error((await dRes.text().catch(() => "")) || "Failed to fetch downloads");

      const tJson = await tRes.json();
      const dJson = await dRes.json();

      const testData = tJson?.data || tJson?.test || tJson;
      setTest(testData);
      setDownloads(dJson || { success: false, data: [], counts: {} });
      setReportUrl(testData?.resultExcelPath || "");
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function buildOrRefreshReport() {
    try {
      const r = await fetch(`${API_BASE}/${id}/report/build`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const rj = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(rj?.message || "Failed to build report");
      if (rj?.reportUrl) setReportUrl(rj.reportUrl);
      else alert("Report built but URL not returned.");
    } catch (e) {
      alert(e.message || "Build report failed");
    }
  }

  const status = String(test?.status || "").toLowerCase();
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  const processedItems = useMemo(
    () =>
      Array.isArray(downloads?.data)
        ? downloads.data.filter((x) => x.processedVideoUrl || x.excelUrl || x.analysisResults)
        : [],
    [downloads]
  );

  const viaProxy = (rawUrl, filename = "", opts = {}) => {
    const params = new URLSearchParams({
      url: rawUrl,
      filename,
      token: idToken,
      ...(opts.inline ? { inline: "1" } : {}),
    });
    return `${FILE_PROXY}?${params.toString()}`;
  };

  const downloadTestExcel = async () => {
    try {
      if (!reportUrl) throw new Error("Report URL not ready");
      const namePart = (test?.name || `test_${id}`).replace(/[^\w.\-]+/g, "_");
      const mazePart = (test?.behaviorTest || "report").replace(/[^\w.\-]+/g, "_");
      const niceName = `${namePart}_${mazePart}.xlsx`;

      const q = new URLSearchParams({ url: reportUrl, filename: niceName });
      const resp = await fetch(`${FILE_PROXY}?${q.toString()}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!resp.ok) throw new Error((await resp.text().catch(() => "")) || "Download failed");

      const blob = await resp.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = niceName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      alert(e.message || "Download failed");
    }
  };

  const excelEmbedUrl = reportUrl
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(reportUrl)}`
    : "";

  async function downloadAllZip() {
    try {
      const resp = await fetch(`${API_BASE}/${id}/downloads/zip`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!resp.ok) throw new Error(await resp.text());
      const cd = resp.headers.get("Content-Disposition") || "";
      let filename = `test_${id}_results.zip`;
      const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
      if (star && star[1]) {
        try { filename = decodeURIComponent(star[1]); } catch { }
      } else {
        const q = cd.match(/filename="([^"]+)"/i);
        const p = cd.match(/filename=([^;]+)/i);
        const pick = (q && q[1]) || (p && p[1]);
        if (pick) filename = pick.trim();
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "Download failed");
    }
  }

  // === Visualization helpers ===
  const behavior = String(test?.behaviorTest || "").toLowerCase();
  const targetQuadrant = String(test?.targetQuadrant || "Q1").toUpperCase();

  const getRegionsForMouse = (mouseCode) => {
    if (!mouseCode || !test?.boundingBoxes) return [];

    let mapObj = null;
    if (Array.isArray(test.boundingBoxes) && test.boundingBoxes.length > 0) {
      mapObj = test.boundingBoxes[0];
    } else if (!Array.isArray(test.boundingBoxes)) {
      mapObj = test.boundingBoxes;
    }

    if (!mapObj || typeof mapObj !== 'object') return [];

    const regions = mapObj[mouseCode];
    if (!Array.isArray(regions)) return [];

    return regions;
  };

  const getGroupNameOfMouse = (mouseCode) => {
    if (!Array.isArray(test?.groupDetails)) return "Ungrouped";
    for (const g of test.groupDetails) {
      const arr = Array.isArray(g.mice) ? g.mice : [];
      const codes = arr.map((x) =>
        typeof x === "string" ? x : (x?.mouseCode || x?.code || x?.name || "")
      );
      if (codes.includes(mouseCode)) return g.name || "Group";
    }
    return "Ungrouped";
  };

  const pickNum = (obj, keys = []) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim() && !isNaN(+v)) return +v;
    }
    return undefined;
  };

  const pickCoreMetrics = (raw) => {
    if (!raw || typeof raw !== "object") return {};
    if (raw.epm) return raw.epm;
    if (raw.ymaze) return raw.ymaze;
    if (raw.mwm) return raw.mwm;
    return raw;
  };

  const extractEPM = (rawRes) => {
    const res = pickCoreMetrics(rawRes);
    const open = pickNum(res, ["time_open", "timeOpen", "openTime", "open_time_sec", "open_total_seconds"]);
    const closed = pickNum(res, ["time_closed", "timeClosed", "closedTime", "closed_time_sec", "closed_total_seconds"]);
    if (open !== undefined && closed !== undefined) return { open, closed };

    const reg = res?.regions || res?.per_region || res?.regionStats || null;
    if (reg) {
      const o1 = pickNum(reg?.open_arm_1, ["time", "time_sec", "seconds", "dwell"]);
      const o2 = pickNum(reg?.open_arm_2, ["time", "time_sec", "seconds", "dwell"]);
      const c1 = pickNum(reg?.closed_arm_1, ["time", "time_sec", "seconds", "dwell"]);
      const c2 = pickNum(reg?.closed_arm_2, ["time", "time_sec", "seconds", "dwell"]);
      const openSum = [o1, o2].filter((x) => x !== undefined).reduce((a, b) => a + b, 0);
      const closedSum = [c1, c2].filter((x) => x !== undefined).reduce((a, b) => a + b, 0);
      if (!isNaN(openSum) || !isNaN(closedSum)) return { open: openSum || 0, closed: closedSum || 0 };
    }

    const oa1 = pickNum(res, ["open_arm_1"]); const oa2 = pickNum(res, ["open_arm_2"]);
    const ca1 = pickNum(res, ["closed_arm_1"]); const ca2 = pickNum(res, ["closed_arm_2"]);
    if ([oa1, oa2, ca1, ca2].some((v) => v !== undefined)) {
      const openSum = [oa1, oa2].filter((x) => x !== undefined).reduce((a, b) => a + b, 0);
      const closedSum = [ca1, ca2].filter((x) => x !== undefined).reduce((a, b) => a + b, 0);
      return { open: openSum || 0, closed: closedSum || 0 };
    }
    return null;
  };

  const extractYmaze = (rawRes) => {
    const res = pickCoreMetrics(rawRes);
    const pctFromSummary = pickNum(res?.summary, ["alternation_percent"]);
    if (pctFromSummary !== undefined) return { alternationPct: pctFromSummary };
    const pct = pickNum(res, [
      "percent_alternation",
      "alternation_percent",
      "alternationPercent",
      "percentAlternation",
      "alternation_rate_percent",
    ]);
    return pct !== undefined ? { alternationPct: pct } : null;
  };

  const extractMWM = (rawRes) => {
    const metrics = pickCoreMetrics(rawRes);
    const t = pickNum(metrics, [
      "target_quadrant_time",
      "target_quadrant_time_sec",
      "time_in_target_quadrant",
      "targetTimeSec",
      "target_time_sec",
    ]);
    if (t !== undefined) return { targetTime: t };

    const quad = metrics?.quadrants || metrics?.per_quadrant || metrics?.regions || null;
    if (quad && quad[targetQuadrant]) {
      if (typeof quad[targetQuadrant] === "number") {
        return { targetTime: quad[targetQuadrant] };
      }
      const q = pickNum(quad[targetQuadrant], ["time", "time_sec", "seconds", "dwell"]);
      if (q !== undefined) return { targetTime: q };
    }
    return null;
  };

  // Build visualization data
  const vizData = useMemo(() => {
    const rows = [];
    for (const item of processedItems) {
      const group = getGroupNameOfMouse(item.mouseCode || "");
      const res = item.analysisResults || item.analysis_results || item.results || {};
      if (!res || typeof res !== "object") continue;

      if (behavior.includes("elevated") || behavior.includes("epm")) {
        const epm = extractEPM(res);
        if (epm) rows.push({ group, mouseCode: item.mouseCode, ...epm });
      } else if (behavior.includes("ymaze") || behavior === "y-maze" || behavior === "y maze") {
        const y = extractYmaze(res);
        if (y) rows.push({ group, mouseCode: item.mouseCode, ...y });
      } else if (behavior.includes("mwm") || behavior.includes("morris")) {
        const m = extractMWM(res);
        if (m) rows.push({ group, mouseCode: item.mouseCode, ...m });
      }
    }
    if (!rows.length) return { kind: "none", data: [], rawRows: [] };

    // Per Test: group averages
    const by = new Map();
    for (const r of rows) {
      if (!by.has(r.group)) by.set(r.group, []);
      by.get(r.group).push(r);
    }

    if (behavior.includes("elevated") || behavior.includes("epm")) {
      const data = Array.from(by.entries()).map(([group, arr]) => {
        const open = arr.reduce((a, b) => a + (b.open || 0), 0) / arr.length;
        const closed = arr.reduce((a, b) => a + (b.closed || 0), 0) / arr.length;
        return { group, open: +open.toFixed(2), closed: +closed.toFixed(2) };
      });
      return { kind: "epm", data, rawRows: rows };
    }

    if (behavior.includes("ymaze") || behavior === "y-maze" || behavior === "y maze") {
      const data = Array.from(by.entries()).map(([group, arr]) => {
        const pct = arr.reduce((a, b) => a + (b.alternationPct || 0), 0) / arr.length;
        return { group, alternationPct: +pct.toFixed(2) };
      });
      return { kind: "ymaze", data, rawRows: rows };
    }

    if (behavior.includes("mwm") || behavior.includes("morris")) {
      const data = Array.from(by.entries()).map(([group, arr]) => {
        const t = arr.reduce((a, b) => a + (b.targetTime || 0), 0) / arr.length;
        return { group, targetTime: +t.toFixed(2) };
      });
      return { kind: "mwm", data, rawRows: rows };
    }

    return { kind: "none", data: [], rawRows: [] };
  }, [processedItems, behavior, test, targetQuadrant]);

  // Per Group: individual mice per group
  const vizDataPerGroup = useMemo(() => {
    if (!vizData.rawRows || vizData.kind === "none") return [];

    const rowsByGroup = new Map();
    for (const row of vizData.rawRows) {
      if (!rowsByGroup.has(row.group)) rowsByGroup.set(row.group, []);
      rowsByGroup.get(row.group).push(row);
    }

    return Array.from(rowsByGroup.entries()).map(([groupName, rows]) => {
      if (vizData.kind === "epm") {
        const chartData = rows.map(r => ({
          mouse: r.mouseCode,
          open: r.open || 0,
          closed: r.closed || 0
        }));
        return { group: groupName, kind: "epm", data: chartData };
      } else if (vizData.kind === "ymaze") {
        const chartData = rows.map(r => ({
          mouse: r.mouseCode,
          alternationPct: r.alternationPct || 0
        }));
        return { group: groupName, kind: "ymaze", data: chartData };
      } else if (vizData.kind === "mwm") {
        const chartData = rows.map(r => ({
          mouse: r.mouseCode,
          targetTime: r.targetTime || 0
        }));
        return { group: groupName, kind: "mwm", data: chartData };
      }
      return null;
    }).filter(Boolean);
  }, [vizData]);

  // Render chart helper
  const renderChart = (data, kind, xKey, xLabel) => {
    if (kind === "epm") {
      return (
        <BarChart data={data} margin={{ top: 8, right: 16, left: 30, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey}>
            <Label value={xLabel} offset={-10} position="insideBottom" />
          </XAxis>
          <YAxis label={{ value: "Seconds", angle: -90, position: "center", dx: -15 }} />
          <Tooltip />
          <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: "16px" }} />
          <Bar dataKey="open" name="Open arms (s)" fill="#22c55e" />
          <Bar dataKey="closed" name="Closed arms (s)" fill="#ef4444" />
        </BarChart>
      );
    } else if (kind === "ymaze") {
      return (
        <BarChart data={data} margin={{ top: 8, right: 16, left: 30, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey}>
            <Label value={xLabel} offset={-10} position="insideBottom" />
          </XAxis>
          <YAxis label={{ value: "% Alternation", angle: -90, position: "center", dx: -15 }} domain={[0, 100]} />
          <Tooltip />
          <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: "16px" }} />
          <Bar dataKey="alternationPct" name="Percent alternation" fill="#3b82f6" />
        </BarChart>
      );
    } else if (kind === "mwm") {
      return (
        <BarChart data={data} margin={{ top: 8, right: 16, left: 30, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey}>
            <Label value={xLabel} offset={-10} position="insideBottom" />
          </XAxis>
          <YAxis label={{ value: "Seconds (Target quadrant)", angle: -90, position: "center", dx: -15 }} />
          <Tooltip />
          <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: "16px" }} />
          <Bar dataKey="targetTime" name={`Time in ${targetQuadrant}`} fill="#0ea5e9" />
        </BarChart>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="app-main">
        <div className="main-wrap">
          <div className="card"><p>Loading Test…</p></div>
        </div>
      </div>
    );
  }
  if (err) {
    return (
      <div className="app-main">
        <div className="main-wrap">
          <div className="card"><p style={{ color: "var(--danger)" }}>{err}</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-main">
      <div className="main-wrap" style={{ display: "grid", gap: 16 }}>
        {/* Header */}
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>{test?.name || "-"}</h3>
              <div className="muted" style={{ marginTop: 4 }}><span className="capitalize">{test?.behaviorTest}</span></div>
              <div className="muted" style={{ marginTop: 2 }}><span className="capitalize">{test?.status}</span></div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isCompleted && processedItems.length > 0 && (
                <button className="btn" onClick={downloadAllZip}>Download All (ZIP)</button>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="card" style={{ display: "grid", gap: 16 }}>
          <h4 style={{ margin: 0 }}>Results</h4>

          {isFailed ? (
            <div style={{ display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 18, color: "var(--danger)", marginBottom: 8 }}>
                This test has failed.
              </div>
              {test?.processingError ? (
                <div className="muted" style={{ maxWidth: 680 }}>
                  {String(test.processingError)}
                </div>
              ) : (
                <div className="muted">Please try running the analysis again.</div>
              )}
            </div>
          ) : !isCompleted || processedItems.length === 0 ? (
            <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
              <div className="spinner" />
              <div className="muted" style={{ marginTop: 8 }}>Processing… results will appear here</div>
            </div>
          ) : (
            <>
              {/* Excel preview */}
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button className="btn" onClick={buildOrRefreshReport}>Build/Refresh Excel</button>
                  {reportUrl && (
                    <button className="btn" onClick={downloadTestExcel}>
                      Download Excel
                    </button>
                  )}
                </div>
                {reportUrl ? (
                  <iframe
                    title="excel-preview"
                    src={excelEmbedUrl}
                    style={{ width: "100%", height: 480, border: "1px solid var(--border)" }}
                  />
                ) : (
                  <div className="muted">Excel not available</div>
                )}
              </div>

              {/* Visualization Tabs */}
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button
                    className={`btn ${vizTab === "mouse" ? "btn-primary" : ""}`}
                    onClick={() => setVizTab("mouse")}
                  >
                    Per Mouse
                  </button>
                  <button
                    className={`btn ${vizTab === "group" ? "btn-primary" : ""}`}
                    onClick={() => setVizTab("group")}
                  >
                    Per Group
                  </button>
                  <button
                    className={`btn ${vizTab === "test" ? "btn-primary" : ""}`}
                    onClick={() => setVizTab("test")}
                  >
                    Per Test
                  </button>
                </div>

                <h4 style={{ margin: "8px 0" }}>
                  {vizTab === "test" ? "Visualization (Per Test)" :
                    vizTab === "group" ? "Visualization (Per Group)" :
                      "Visualization (Per Mouse)"}
                </h4>

                {/* Per Mouse Tab */}
                {vizTab === "mouse" && (
                  <>
                    {vizData.kind === "none" || processedItems.length === 0 ? (
                      <div className="muted">No analysis data to visualize.</div>
                    ) : (
                      <>
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                            Select Mouse:
                          </label>
                          <select
                            value={selectedMouseForViz}
                            onChange={(e) => setSelectedMouseForViz(e.target.value)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 4,
                              border: "1px solid var(--border)",
                              minWidth: 200
                            }}
                          >
                            <option value="ALL">All Mice</option>
                            {processedItems.map((item) => (
                              <option key={item.id} value={item.mouseCode}>
                                {item.mouseCode}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div
                          style={{
                            marginBottom: 16,
                            fontSize: 12,
                            backgroundColor: "#f8fafc",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: "8px 12px",
                            color: "#4b5563",
                          }}
                        >
                          <div>
                            <strong>S</strong> = Starting Point
                            (Green Circle)
                          </div>
                          <div>
                            <strong>E</strong> = Ending Point
                            (Red Circle)
                          </div>
                          <div>
                            The trajectory changes from{" "}
                            <span style={{ fontWeight: 600, color: "#3b82f6" }}>blue</span>{" "}
                            to{" "}
                            <span style={{ fontWeight: 600, color: "#ef4444" }}>red</span>{" "}
                            over time.
                          </div>
                        </div>

                        {selectedMouseForViz === "ALL" ? (
                          <div style={{ display: 'grid', gap: 24 }}>
                            {processedItems.map((item) => {
                              const regionsForMouse = getRegionsForMouse(item.mouseCode);
                              return (
                                <div key={item.id} style={{ width: "100%", minHeight: 400 }}>
                                  <h5 style={{ margin: '0 0 8px 0' }}>{item.mouseCode}</h5>
                                  <TrajectoryCanvas
                                    videoId={item.id}
                                    token={idToken}
                                    mazeType={test?.behaviorTest}
                                    regions={regionsForMouse}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : selectedMouseForViz ? (
                          (() => {
                            const selectedItem = processedItems.find(i => i.mouseCode === selectedMouseForViz);
                            if (!selectedItem) return <div className="muted">Mouse not found</div>;

                            const regionsForMouse = getRegionsForMouse(selectedItem.mouseCode);

                            return (
                              <TrajectoryCanvas
                                videoId={selectedItem.id}
                                token={idToken}
                                mazeType={test?.behaviorTest}
                                regions={regionsForMouse}
                              />
                            );
                          })()
                        ) : (
                          <div className="muted">Please select a mouse</div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Per Group */}
                {vizTab === "group" && (
                  <>
                    {vizData.kind === "none" ? (
                      <div className="muted">No analysis data to visualize.</div>
                    ) : (
                      <>
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                            Select Group:
                          </label>
                          <select
                            value={selectedGroupForViz}
                            onChange={(e) => setSelectedGroupForViz(e.target.value)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 4,
                              border: "1px solid var(--border)",
                              minWidth: 200
                            }}
                          >
                            <option value="ALL">All Groups</option>
                            {vizDataPerGroup.map((g) => (
                              <option key={g.group} value={g.group}>
                                {g.group}
                              </option>
                            ))}
                          </select>
                        </div>

                        {selectedGroupForViz === "ALL" ? (
                          <div style={{ display: "grid", gap: 24 }}>
                            {vizDataPerGroup.map((groupData) => (
                              <div key={groupData.group} style={{ width: "100%", height: 360 }}>
                                <h5 style={{ margin: "0 0 8px 0" }}>{groupData.group}</h5>
                                <ResponsiveContainer>
                                  {renderChart(groupData.data, groupData.kind, "mouse", "Mouse")}
                                </ResponsiveContainer>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            {(() => {
                              const groupData = vizDataPerGroup.find(g => g.group === selectedGroupForViz);
                              if (!groupData) return <div className="muted">No data for selected group.</div>;
                              return (
                                <div style={{ width: "100%", height: 360 }}>
                                  <ResponsiveContainer>
                                    {renderChart(groupData.data, groupData.kind, "mouse", "Mouse")}
                                  </ResponsiveContainer>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Per Test */}
                {vizTab === "test" && (
                  <>
                    {vizData.kind === "none" ? (
                      <div className="muted">No analysis data to visualize.</div>
                    ) : (
                      <div style={{ width: "100%", height: 360 }}>
                        <ResponsiveContainer>
                          {renderChart(vizData.data, vizData.kind, "group", "Group")}
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}