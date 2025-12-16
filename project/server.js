const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve your frontend files
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

/* =========================================================
   MOCK DATABASE (replace with Google Sheets later)
   ========================================================= */
let TRN_DATA = [
  {
    trn: "74600200620191020240321012107",
    fullname: "JUAN DELA CRUZ",
    permanentAddress: "CEBU CITY",
    recaptureStatus: "FOR RECAPTURE",
    recaptureSchedule: "2025-02-10",
    status: "FOR RECAPTURE",
    newTrn: "",
    isoDateRecapture: ""
  }
];

/* =========================================================
   API ROUTES
   ========================================================= */

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "API running" });
});

// Status options
app.get("/api/status-options", (req, res) => {
  res.json({
    success: true,
    statuses: ["FOR RECAPTURE", "SCHEDULED", "COMPLETED", "NO RECORD"]
  });
});

// 🔍 TRN SEARCH (THIS FIXES YOUR ERROR)
app.post("/api/trn-search", (req, res) => {
  const trn = String(req.body?.trn || "").replace(/\D/g, "");
  if (!/^\d{29}$/.test(trn)) {
    return res.status(400).json({ success: false, message: "Invalid TRN. Must be 29 digits." });
  }

  const record = TRN_DATA.find(r => String(r.trn).trim() === trn);
  if (!record) {
    return res.status(404).json({ success: false, message: "TRN not found." });
  }

  // rowNumber mock (for sheets update)
  res.json({
    success: true,
    record: { ...record, rowNumber: 2 }
  });
});

// 💾 TRN UPDATE
app.post("/api/trn-update", (req, res) => {
  const payload = req.body || {};

  if (!payload?.status) {
    return res.status(400).json({ success: false, message: "Status is required." });
  }

  // mock save: update in memory
  const trn = String(payload.trn || "").replace(/\D/g, "");
  const idx = TRN_DATA.findIndex(r => String(r.trn).trim() === trn);

  if (idx !== -1) {
    TRN_DATA[idx].status = payload.status;
    TRN_DATA[idx].newTrn = String(payload.newTrn || "").replace(/\D/g, "").slice(0, 29);
    TRN_DATA[idx].isoDateRecapture = String(payload.dateOfRecapture || "");
  }

  res.json({ success: true, message: "Saved" });
});

// (Optional) Simple login/register mock so your index.html still works
app.post("/api/login", (req, res) => {
  // Always allow and return role user (you can wire real auth later)
  res.json({ success: true, role: "user" });
});

app.post("/api/register", (req, res) => {
  res.json({ success: true });
});

// Fallback (for direct refresh)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});
