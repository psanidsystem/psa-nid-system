const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// serve frontend
app.use(express.static(path.join(__dirname, "public")));

const PORT = 3000;

/* ===========================
   MOCK DATA (TRN DATABASE)
   =========================== */
const TRN_DATA = [
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

/* ===========================
   API ROUTES
   =========================== */

// health
app.get("/api/health", (req, res) => {
  res.json({ success: true });
});

// status dropdown
app.get("/api/status-options", (req, res) => {
  res.json({
    statuses: ["FOR RECAPTURE", "SCHEDULED", "COMPLETED", "NO RECORD"]
  });
});

// 🔍 TRN SEARCH (FIXED)
app.post("/api/trn-search", (req, res) => {
  const trn = String(req.body.trn || "").replace(/\D/g, "");

  if (!/^\d{29}$/.test(trn)) {
    return res.json({ success: false, message: "Invalid TRN" });
  }

  const record = TRN_DATA.find(r => r.trn === trn);
  if (!record) {
    return res.json({ success: false, message: "TRN not found" });
  }

  res.json({
    success: true,
    record: {
      ...record,
      rowNumber: 1
    }
  });
});

// 💾 SAVE UPDATE
app.post("/api/trn-update", (req, res) => {
  res.json({ success: true });
});

// fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(PORT, () => {
  console.log("✅ Server running at http://localhost:" + PORT);
});
