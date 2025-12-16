const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend from /public
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

/* =========================================================
   MOCK DATABASE (replace with Google Sheets later)
   ========================================================= */

// USERS DB
const USERS = []; 
// format: { email, passHash, role, firstName, middleName, lastName, viber, position, province }

// OPTIONS
const POSITIONS = ["Encoder", "Clerk", "Supervisor"];
const PROVINCES = ["Cebu", "Bohol", "Negros Oriental"];
const STATUSES = ["FOR RECAPTURE", "SCHEDULED", "COMPLETED", "NO RECORD"];

// TRN DB
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

/* =========================================================
   HELPERS
   ========================================================= */

function ok(res, payload = {}) {
  res.json({ success: true, ...payload });
}
function bad(res, message = "Request failed", code = 400) {
  res.status(code).json({ success: false, message });
}

/* =========================================================
   ROUTES
   ========================================================= */

// Health
app.get("/api/health", (req, res) => ok(res, { message: "API running" }));

// Dropdowns
app.get("/api/positions", (req, res) => ok(res, { positions: POSITIONS }));
app.get("/api/provinces", (req, res) => ok(res, { provinces: PROVINCES }));
app.get("/api/status-options", (req, res) => ok(res, { statuses: STATUSES }));

// Admin eligibility (optional)
app.post("/api/admin-eligible", (req, res) => {
  // your previous logic was "optional"; keep false by default
  ok(res, { eligible: false });
});

// Register
app.post("/api/register", async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");

    if (!email || !password) return bad(res, "Email and password are required.");

    const exists = USERS.some(u => u.email === email);
    if (exists) return bad(res, "Email already registered.");

    const passHash = await bcrypt.hash(password, 10);

    USERS.push({
      email,
      passHash,
      role: b.role || "user",
      firstName: (b.firstName || "").trim(),
      middleName: (b.middleName || "").trim(),
      lastName: (b.lastName || "").trim(),
      viber: (b.viber || "").trim(),
      position: (b.position || "").trim(),
      province: (b.province || "").trim()
    });

    ok(res);
  } catch (e) {
    console.error(e);
    bad(res, "Register failed.", 500);
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");

    const user = USERS.find(u => u.email === email);
    if (!user) return bad(res, "Invalid email or password.", 401);

    const match = await bcrypt.compare(password, user.passHash);
    if (!match) return bad(res, "Invalid email or password.", 401);

    ok(res, { role: user.role || "user" });
  } catch (e) {
    console.error(e);
    bad(res, "Login failed.", 500);
  }
});

// ✅ TRN SEARCH (this fixes "Route not found" + makes your search work)
app.post("/api/trn-search", (req, res) => {
  const trn = String(req.body?.trn || "").replace(/\D/g, "");
  if (!/^\d{29}$/.test(trn)) return bad(res, "Invalid TRN. Must be 29 digits.");

  const found = TRN_DATA.find(r => String(r.trn).trim() === trn);
  if (!found) return bad(res, "TRN not found.", 404);

  // rowNumber is for sheet updates; keep mock value
  ok(res, { record: { ...found, rowNumber: 2 } });
});

// ✅ TRN UPDATE
app.post("/api/trn-update", (req, res) => {
  const p = req.body || {};
  const trn = String(p.trn || "").replace(/\D/g, "");

  if (!p.status) return bad(res, "Status is required.");

  const idx = TRN_DATA.findIndex(r => String(r.trn).trim() === trn);
  if (idx === -1) return bad(res, "TRN not found.", 404);

  TRN_DATA[idx].status = String(p.status || "");
  TRN_DATA[idx].newTrn = String(p.newTrn || "").replace(/\D/g, "").slice(0, 29);
  TRN_DATA[idx].isoDateRecapture = String(p.dateOfRecapture || "");

  ok(res, { message: "Saved" });
});

// Fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`✅ Server running: http://localhost:${PORT}`));
