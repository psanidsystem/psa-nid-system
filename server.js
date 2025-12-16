require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Serve your frontend (put html/assets inside /public)
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const SHEET_ID = process.env.SHEET_ID;

// ===== Google Auth =====
function getServiceAccount() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  // fallback to file if provided
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return require(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS));
  }
  throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS");
}

function getSheetsClient() {
  const creds = getServiceAccount();
  const auth = new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  return google.sheets({ version: "v4", auth });
}

async function readRange(range) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  });
  return res.data.values || [];
}

async function updateRange(range, values) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
  return res.data;
}

async function appendRange(range, values) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
  return res.data;
}

function ok(res, payload = {}) {
  res.json({ success: true, ...payload });
}
function bad(res, message = "Request failed", code = 400) {
  res.status(code).json({ success: false, message });
}

// ===== Sheet Names (edit these to match your Google Sheet tabs) =====
const TAB_USERS = "Users";          // Users!A:Z  (email, passwordHash, role, firstName, middleName, lastName, viber, position, province)
const TAB_TRN = "TRN";              // TRN!A:Z    (TRN records)
const TAB_OPTIONS = "Options";      // Options!A:Z (optional dropdown lists)

// ===== Helpers =====
function isoFromDateInput(dateStr) {
  // dateStr = "YYYY-MM-DD"
  if (!dateStr) return "";
  return dateStr;
}

// ===== Routes =====

// Health check
app.get("/api/health", (req, res) => ok(res, { message: "API running" }));

// ---- Dropdowns (OPTIONAL) ----
// If you don't have Options sheet, you can hardcode arrays.
app.get("/api/status-options", async (req, res) => {
  try {
    // Example: Options sheet column A starting row 2: statuses
    // Options!A2:A
    const rows = await readRange(`${TAB_OPTIONS}!A2:A`);
    const statuses = rows.map(r => (r[0] || "").trim()).filter(Boolean);

    // fallback
    if (!statuses.length) {
      return ok(res, { statuses: ["For Recapture", "Scheduled", "Completed", "No Record"] });
    }
    ok(res, { statuses });
  } catch (e) {
    ok(res, { statuses: ["For Recapture", "Scheduled", "Completed", "No Record"] });
  }
});

app.get("/api/positions", async (req, res) => {
  try {
    const rows = await readRange(`${TAB_OPTIONS}!B2:B`);
    const positions = rows.map(r => (r[0] || "").trim()).filter(Boolean);
    ok(res, { positions: positions.length ? positions : ["Clerk", "Encoder", "Supervisor"] });
  } catch {
    ok(res, { positions: ["Clerk", "Encoder", "Supervisor"] });
  }
});

app.get("/api/provinces", async (req, res) => {
  try {
    const rows = await readRange(`${TAB_OPTIONS}!C2:C`);
    const provinces = rows.map(r => (r[0] || "").trim()).filter(Boolean);
    ok(res, { provinces: provinces.length ? provinces : ["Cebu", "Bohol", "Negros Oriental"] });
  } catch {
    ok(res, { provinces: ["Cebu", "Bohol", "Negros Oriental"] });
  }
});

// ---- Auth (BASIC) ----
app.post("/api/register", async (req, res) => {
  try {
    const {
      email, password, role,
      firstName, middleName, lastName,
      viber, position, province
    } = req.body || {};

    if (!email || !password) return bad(res, "Email and password are required.");

    const users = await readRange(`${TAB_USERS}!A2:Z`);
    const exists = users.some(r => (r[0] || "").toLowerCase() === email.toLowerCase());
    if (exists) return bad(res, "Email already registered.");

    const hash = await bcrypt.hash(password, 10);

    await appendRange(`${TAB_USERS}!A2:Z`, [[
      email.trim(),
      hash,
      role || "user",
      (firstName || "").trim(),
      (middleName || "").trim(),
      (lastName || "").trim(),
      (viber || "").trim(),
      (position || "").trim(),
      (province || "").trim(),
      new Date().toISOString()
    ]]);

    ok(res);
  } catch (e) {
    console.error(e);
    bad(res, "Register failed.", 500);
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return bad(res, "Missing credentials.");

    const users = await readRange(`${TAB_USERS}!A2:Z`);
    const row = users.find(r => (r[0] || "").toLowerCase() === email.toLowerCase());
    if (!row) return bad(res, "Invalid email or password.");

    const hash = row[1] || "";
    const role = row[2] || "user";
    const match = await bcrypt.compare(password, hash);
    if (!match) return bad(res, "Invalid email or password.");

    ok(res, { role });
  } catch (e) {
    console.error(e);
    bad(res, "Login failed.", 500);
  }
});

// ---- Admin eligible (OPTIONAL) ----
app.post("/api/admin-eligible", async (req, res) => {
  // If you don’t need this now, you can just always return eligible:false
  ok(res, { eligible: false });
});

// ✅✅ TRN SEARCH (THIS FIXES YOUR ERROR) ✅✅
app.post("/api/trn-search", async (req, res) => {
  try {
    const trn = String(req.body?.trn || "").replace(/\D/g, "");
    if (!/^\d{29}$/.test(trn)) return bad(res, "Invalid TRN. Must be 29 digits.");

    // Expected TRN sheet columns (EDIT if your sheet differs):
    // A: TRN
    // B: Fullname
    // C: Permanent Address
    // D: Recapture Status
    // E: Recapture Schedule
    // F: Status (dropdown)
    // G: New TRN
    // H: Date of Recapture (YYYY-MM-DD)
    const rows = await readRange(`${TAB_TRN}!A2:H`);
    if (!rows.length) return bad(res, "No TRN data found in sheet.");

    const idx = rows.findIndex(r => String(r[0] || "").trim() === trn);
    if (idx === -1) return bad(res, "TRN not found.");

    const r = rows[idx];
    const rowNumber = idx + 2; // +2 because data starts at row 2

    ok(res, {
      record: {
        rowNumber,
        trn: (r[0] || "").trim(),
        fullname: (r[1] || "").trim(),
        permanentAddress: (r[2] || "").trim(),
        recaptureStatus: (r[3] || "").trim(),
        recaptureSchedule: (r[4] || "").trim(),
        status: (r[5] || "").trim(),
        newTrn: (r[6] || "").trim(),
        isoDateRecapture: (r[7] || "").trim(),
      }
    });
  } catch (e) {
    console.error(e);
    bad(res, "Server error while searching TRN.", 500);
  }
});

// ✅ TRN UPDATE
app.post("/api/trn-update", async (req, res) => {
  try {
    const { rowNumber, trn, status, newTrn, dateOfRecapture } = req.body || {};
    if (!rowNumber) return bad(res, "Missing rowNumber.");
    if (!status) return bad(res, "Status is required.");

    const cleanTrn = String(trn || "").replace(/\D/g, "");
    const cleanNewTrn = String(newTrn || "").replace(/\D/g, "").slice(0, 29);
    const isoDate = isoFromDateInput(dateOfRecapture);

    // Write back to columns F,G,H of that row
    // F: status, G: newTrn, H: date
    const range = `${TAB_TRN}!F${rowNumber}:H${rowNumber}`;
    await updateRange(range, [[status, cleanNewTrn, isoDate]]);

    ok(res);
  } catch (e) {
    console.error(e);
    bad(res, "Server error while saving.", 500);
  }
});

// Fallback route for SPA / direct nav
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
