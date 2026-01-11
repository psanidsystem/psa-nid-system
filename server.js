// PSA NID SYSTEM — Server + UI (Render-ready)
// - Serves static UI from /public
// - Google Sheets backend
// - Accounts sheet columns A–M include Province + Position
// - Fix login to return role + province + position (needed by office.html)
// - Adds /api/failed-registrations (reads Failed Registration sheet)

const express = require("express");
const cors = require("cors");
const path = require("path");
const { google } = require("googleapis");
const { GoogleAuth } = require("google-auth-library");

const app = express();

// ===== Middlewares =====
app.use(cors());
app.use(express.json());

// ✅ Serve frontend from /public
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// ✅ Root route -> UI
app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "psa-nid-system", time: new Date().toISOString() });
});

// ===== Google Sheets Setup (ENV JSON) =====
function getCredentialsFromEnv() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) throw new Error("Missing env GOOGLE_APPLICATION_CREDENTIALS_JSON in Render.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON in GOOGLE_APPLICATION_CREDENTIALS_JSON.");
  }
}

const credentials = getCredentialsFromEnv();

const auth = new GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const spreadsheetId = "1RJ16ZSoYzFgeYUmeXo21PwkWfG07xC_5R8YqMAtys8s";

// Sheets
const sheetAccounts = "Accounts";
const sheetLogs = "Logs";
const sheetAdmin = "Admin";
const sheetDropdown = "Dropdown";
const sheetFailed = "Failed Registration";

// ===== Helpers =====
async function getClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

async function ensureLogsSheet(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === sheetLogs);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetLogs } } }] },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetLogs}!A1:D1`,
      valueInputOption: "RAW",
      requestBody: { values: [["Timestamp", "Action", "Email", "Details"]] },
    });
  }
}

async function addLog(action, email, details = "") {
  const sheets = await getClient();
  await ensureLogsSheet(sheets);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetLogs}!A:D`,
    valueInputOption: "RAW",
    requestBody: { values: [[new Date().toISOString(), action, email, details]] },
  });
}

// ✅ Ensure Accounts columns (A–M) including Province + Position
async function ensureColumns() {
  const sheets = await getClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetAccounts}!A1:M1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        "Email",
        "Password",
        "Role",
        "Status",
        "CreatedAt",
        "UpdatedAt",
        "LastLogin",
        "FirstName",
        "MiddleName",
        "LastName",
        "Viber",
        "Province",
        "Position",
      ]],
    },
  });

  await ensureLogsSheet(sheets);
}

// Load accounts (A–M)
async function loadAccounts() {
  const sheets = await getClient();
  await ensureColumns();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetAccounts}!A2:M`,
  });

  const rows = res.data.values || [];
  return rows
    .filter((r) => r[0])
    .map((r) => ({
      email: r[0] || "",
      password: r[1] || "",
      role: r[2] || "user",
      status: r[3] || "active",
      createdAt: r[4] || "",
      updatedAt: r[5] || "",
      lastLogin: r[6] || "",
      firstName: r[7] || "",
      middleName: r[8] || "",
      lastName: r[9] || "",
      viber: r[10] || "",
      province: r[11] || "",
      position: r[12] || "",
    }));
}

async function saveAccount({
  email, password, role, firstName, middleName, lastName, viber, province, position
}) {
  const sheets = await getClient();
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetAccounts}!A:M`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        email,
        password,
        role,
        "active",
        now,
        now,
        "",
        firstName,
        middleName || "",
        lastName,
        viber,
        province,
        position || "",
      ]],
    },
  });

  await addLog("Create Account", email, `Role: ${role}, Province: ${province}, Position: ${position || ""}`);
}

async function updateLastLogin(email) {
  const sheets = await getClient();
  const accounts = await loadAccounts();

  const index = accounts.findIndex((a) => a.email.toLowerCase() === email.toLowerCase());
  if (index === -1) return;

  const rowNumber = index + 2;
  const now = new Date().toISOString();

  // F = UpdatedAt, G = LastLogin
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetAccounts}!F${rowNumber}:G${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[now, now]] },
  });

  await addLog("Login", email, "User logged in");
}

// Admin allowed only if exists in Admin sheet (A=FN, B=MN, C=LN, D=Email)
async function isAuthorizedAdmin(firstName, middleName, lastName, email) {
  const sheets = await getClient();

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetAdmin}!A2:D`,
  });

  const rows = result.data.values || [];
  const fn = (firstName || "").toLowerCase().trim();
  const mn = (middleName || "").toLowerCase().trim();
  const ln = (lastName || "").toLowerCase().trim();
  const em = (email || "").toLowerCase().trim();

  return rows.some((row) => {
    const rFn = (row[0] || "").toLowerCase().trim();
    const rMn = (row[1] || "").toLowerCase().trim();
    const rLn = (row[2] || "").toLowerCase().trim();
    const rEm = (row[3] || "").toLowerCase().trim();
    return rFn === fn && rMn === mn && rLn === ln && rEm === em;
  });
}

// ===== Date helpers for Dec 25, 2025 format =====
function formatToDec25Style(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const d = new Date(yyyyMmDd + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}
function tryParseDecStyleToISO(text) {
  if (!text) return "";
  const d = new Date(text);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ========================= ROUTES ==============================

// ✅ Admin dashboard list
app.get("/api/accounts", async (req, res) => {
  try {
    const accounts = await loadAccounts();
    const safe = accounts.map(({ password, ...rest }) => rest);
    res.json(safe);
  } catch (err) {
    console.error("Error in GET /api/accounts:", err.message || err);
    res.status(500).json({ success: false, message: "Error loading accounts." });
  }
});

// GET provinces (Dropdown!D2:D)
app.get("/api/provinces", async (req, res) => {
  try {
    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!D2:D`,
    });

    const provinces = (result.data.values || [])
      .map((r) => (r[0] || "").trim())
      .filter(Boolean);

    res.json({ success: true, provinces: [...new Set(provinces)] });
  } catch (err) {
    console.error("Error in GET /api/provinces:", err.message || err);
    res.status(500).json({ success: false, message: "Error reading provinces." });
  }
});

// GET positions (Dropdown!B2:B)
app.get("/api/positions", async (req, res) => {
  try {
    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!B2:B`,
    });

    const positions = (result.data.values || [])
      .map((r) => (r[0] || "").trim())
      .filter(Boolean);

    res.json({ success: true, positions: [...new Set(positions)] });
  } catch (err) {
    console.error("Error in GET /api/positions:", err.message || err);
    res.status(500).json({ success: false, message: "Error reading positions." });
  }
});

// GET status options (Dropdown!C2:C)
app.get("/api/status-options", async (req, res) => {
  try {
    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!C2:C`,
    });

    const statuses = (result.data.values || [])
      .map((r) => (r[0] || "").trim())
      .filter(Boolean);

    res.json({ success: true, statuses: [...new Set(statuses)] });
  } catch (err) {
    console.error("Error in GET /api/status-options:", err.message || err);
    res.status(500).json({ success: false, message: "Error reading status options." });
  }
});

// REGISTER
app.post("/api/register", async (req, res) => {
  const {
    email, password, role,
    firstName, middleName, lastName,
    viber, province, position
  } = req.body || {};

  if (!email || !password || !role || !firstName || !lastName || !viber || !province || !position) {
    return res.json({ success: false, message: "Missing required fields." });
  }

  try {
    const accounts = await loadAccounts();

    if (accounts.some((a) => a.email.toLowerCase() === email.toLowerCase())) {
      return res.json({ success: false, message: "Email already exists" });
    }

    if (role === "admin") {
      const allowed = await isAuthorizedAdmin(firstName, middleName, lastName, email);
      if (!allowed) {
        await addLog("Admin Register Blocked", email, "Not in Admin sheet");
        return res.json({
          success: false,
          message: "Dili ka pwede mo-set og Admin Role (not authorized).",
        });
      }
    }

    await saveAccount({ email, password, role, firstName, middleName, lastName, viber, province, position });
    res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/register:", err.message || err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ✅ LOGIN (FIXED: returns role + province + position)
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.json({ success: false, message: "Missing email or password" });

  try {
    const accounts = await loadAccounts();
    const user = accounts.find((a) => a.email.toLowerCase() === String(email).toLowerCase());

    if (!user) return res.json({ success: false, message: "Invalid email or password" });
    if (user.password !== password) return res.json({ success: false, message: "Invalid email or password" });

    if ((user.status || "").toLowerCase() !== "active") {
      return res.json({ success: false, message: "Account is disabled." });
    }

    await updateLastLogin(email);

    return res.json({
      success: true,
      role: user.role || "user",
      province: user.province || "",
      position: user.position || "",
    });
  } catch (err) {
    console.error("Error in POST /api/login:", err.message || err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// Admin eligible
app.post("/api/admin-eligible", async (req, res) => {
  try {
    const { firstName, middleName, lastName, email } = req.body || {};
    if (!firstName || !lastName || !email) return res.json({ success: true, eligible: false });

    const eligible = await isAuthorizedAdmin(firstName, middleName, lastName, email);
    return res.json({ success: true, eligible });
  } catch (err) {
    console.error("Error in POST /api/admin-eligible:", err.message || err);
    return res.status(500).json({ success: false, eligible: false });
  }
});

// ✅ FAILED REGISTRATION LIST (Aligned to your sheet screenshot)
// Columns from screenshot:
// A No.
// B TRN
// C Fullname
// D Address (Permanent Address)
// E Province (for Address side)  ✅ USE THIS FOR FILTERING
// ✅ FAILED REGISTRATION LIST (BASE ON COLUMN G = Province)
// Based on your sheet screenshot:
// A No.
// B TRN
// C Fullname
// D (blank or separator column)
// E (maybe Address)
// F (blank)
// G Province ✅ THIS is your basis
// H Present Address
// I Province (for present address)
// ...
app.get("/api/failed-registrations", async (req, res) => {
  try {
    const provinceQ = String(req.query.province || "").trim().toLowerCase();

    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetFailed}!A2:M`,
    });

    const rows = result.data.values || [];

    const records = rows
      .filter((r) => (r[1] || "").toString().trim()) // must have TRN (col B)
      .map((r) => ({
        trn: (r[1] || "").toString().trim(),          // B
        fullname: (r[2] || "").toString().trim(),     // C
        contactNo: (r[3] || "").toString().trim(),    // (if naa) else blank
        emailAddress: (r[4] || "").toString().trim(), // (if naa) else blank
        permanentAddress: (r[5] || "").toString().trim(), // (if naa) else blank
        province: (r[6] || "").toString().trim(),     // ✅ G (index 6)
      }));

    const filtered = provinceQ
      ? records.filter((x) => String(x.province || "").trim().toLowerCase() === provinceQ)
      : records;

    return res.json({ success: true, records: filtered });
  } catch (err) {
    console.error("Error in GET /api/failed-registrations:", err.message || err);
    return res.status(500).json({ success: false, message: "Error loading failed registrations." });
  }
});


    const filtered = provinceQ
      ? records.filter((x) => String(x.province || "").trim().toLowerCase() === provinceQ)
      : records;

    return res.json({ success: true, records: filtered });
  } catch (err) {
    console.error("Error in GET /api/failed-registrations:", err.message || err);
    return res.status(500).json({ success: false, message: "Error loading failed registrations." });
  }
});

// TRN SEARCH
app.post("/api/trn-search", async (req, res) => {
  try {
    const { trn } = req.body || {};
    const cleanTrn = String(trn || "").trim();

    if (!/^\d{29}$/.test(cleanTrn)) {
      return res.json({ success: false, message: "Invalid TRN format. Must be 29 digits." });
    }

    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetFailed}!A2:S`,
    });

    const rows = result.data.values || [];
    const index = rows.findIndex((r) => (r[1] || "").trim() === cleanTrn);

    if (index === -1) {
      return res.json({ success: false, message: "TRN not found in Failed Registration." });
    }

    const row = rows[index] || [];
    const rowNumber = index + 2;

    const record = {
      rowNumber,
      trn: row[1] || "",
      fullname: row[2] || "",
      permanentAddress: row[3] || "",
      province: row[4] || "",
      recaptureStatus: row[11] || "",
      recaptureSchedule: row[12] || "",
      status: row[16] || "",
      newTrn: row[17] || "",
      dateOfRecapture: row[18] || "",
      isoDateRecapture: tryParseDecStyleToISO(row[18] || ""),
    };

    return res.json({ success: true, record });
  } catch (err) {
    console.error("Error in POST /api/trn-search:", err.message || err);
    return res.status(500).json({ success: false, message: "Server error while searching TRN." });
  }
});

// TRN UPDATE
app.post("/api/trn-update", async (req, res) => {
  try {
    const { rowNumber, trn, status, newTrn, dateOfRecapture } = req.body || {};
    const rn = Number(rowNumber);

    if (!rn || rn < 2) return res.json({ success: false, message: "Invalid rowNumber." });

    const cleanTrn = String(trn || "").trim();
    if (!/^\d{29}$/.test(cleanTrn)) return res.json({ success: false, message: "Invalid TRN format." });

    const cleanStatus = String(status || "").trim();
    if (!cleanStatus) return res.json({ success: false, message: "Status is required." });

    const cleanNewTrn = String(newTrn || "").trim();
    if (cleanNewTrn && !/^\d{29}$/.test(cleanNewTrn)) {
      return res.json({ success: false, message: "NEW TRN must be 29 digits (or leave blank)." });
    }

    const sheets = await getClient();

    const check = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetFailed}!B${rn}:B${rn}`,
    });
    const foundTrn = (((check.data.values || [])[0] || [])[0] || "").trim();
    if (foundTrn !== cleanTrn) {
      return res.json({ success: false, message: "Row mismatch. Please search again before saving." });
    }

    const formattedDate = formatToDec25Style(String(dateOfRecapture || "").trim());

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetFailed}!Q${rn}:S${rn}`,
      valueInputOption: "RAW",
      requestBody: { values: [[cleanStatus, cleanNewTrn, formattedDate]] },
    });

    await addLog("TRN Update", "system", `TRN: ${cleanTrn} | Row: ${rn} | QRS updated`);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/trn-update:", err.message || err);
    return res.status(500).json({ success: false, message: "Server error while saving update." });
  }
});

// ✅ 404 for API routes only
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ✅ Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server running on port " + PORT));

