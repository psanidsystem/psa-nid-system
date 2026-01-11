// PSA NID SYSTEM — Server + UI (Render-ready)
// - Serves static UI from /public
// - Google Sheets backend
// - Accounts sheet columns A–M include Province + Position
// - Login returns role + province + position
// - Office list uses Failed Registration sheet
// - Province filter uses COLUMN G (index 6)
// - Office "Updated" indicator uses J–P only (Date Contacted..Registration Center)
// - Dropdown options:
//    Means of Notification = Dropdown!A2:A
//    Recapture Status      = Dropdown!E2:E
// - Keeps USER TRN search/update routes (TRN Search & Q–S update)

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

function uniq(arr) {
  return [...new Set(arr)];
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
async function ensureAccountsColumns() {
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

async function loadAccounts() {
  const sheets = await getClient();
  await ensureAccountsColumns();

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

  await addLog("Create Account", email, `Role:${role} Province:${province} Position:${position || ""}`);
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

// ===== Date helpers for User TRN Update (Dec 25, 2025 format) =====
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

// ---- Dropdowns for REGISTER ----
// Positions = Dropdown!B2:B
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

    res.json({ success: true, positions: uniq(positions) });
  } catch (err) {
    console.error("Error in GET /api/positions:", err.message || err);
    res.status(500).json({ success: false, message: "Error reading positions." });
  }
});

// Provinces = Dropdown!D2:D
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

    res.json({ success: true, provinces: uniq(provinces) });
  } catch (err) {
    console.error("Error in GET /api/provinces:", err.message || err);
    res.status(500).json({ success: false, message: "Error reading provinces." });
  }
});

// ---- Admin eligibility ----
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

// ---- REGISTER ----
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

    if (accounts.some((a) => a.email.toLowerCase() === String(email).toLowerCase())) {
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

// ---- LOGIN (returns role + province + position) ----
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

// =============================================================
// ✅ OFFICE DROPDOWN OPTIONS
// Means of Notification: Dropdown!A2:A
// Recapture Status:      Dropdown!E2:E   ✅ (as you corrected)
// =============================================================
app.get("/api/means-notification", async (req, res) => {
  try {
    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!A2:A`,
    });

    const items = (result.data.values || [])
      .map((r) => String(r[0] || "").trim())
      .filter(Boolean);

    return res.json({ success: true, items: uniq(items) });
  } catch (err) {
    console.error("Error in GET /api/means-notification:", err.message || err);
    return res.status(500).json({ success: false, message: "Error reading means of notification." });
  }
});

app.get("/api/recapture-status-options", async (req, res) => {
  try {
    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!E2:E`,
    });

    const items = (result.data.values || [])
      .map((r) => String(r[0] || "").trim())
      .filter(Boolean);

    return res.json({ success: true, items: uniq(items) });
  } catch (err) {
    console.error("Error in GET /api/recapture-status-options:", err.message || err);
    return res.status(500).json({ success: false, message: "Error reading recapture status." });
  }
});

// =============================================================
// ✅ OFFICE LIST
// Province filter uses COLUMN G (index 6)
// Base columns used in list:
// B TRN, C Fullname, D Contact No, G Province
// Updated flag uses J–P only (index 9..15) => DateContacted..RegistrationCenter
// =============================================================
app.get("/api/failed-registrations", async (req, res) => {
  try {
    const provinceQ = String(req.query.province || "").trim().toLowerCase();
    const sheets = await getClient();

    // read A:P so we can compute updated (J..P)
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetFailed}!A2:P`,
    });

    const rows = result.data.values || [];

    const records = rows
      .map((r, i) => {
        const rowNumber = i + 2;

        const trn = String(r[1] || "").trim();       // B
        const fullname = String(r[2] || "").trim();  // C
        if (!trn) return null;

        const contactNo = String(r[3] || "").trim(); // D
        const province = String(r[6] || "").trim();  // G ✅ BASIS

        if (provinceQ && province.toLowerCase() !== provinceQ) return null;

        // ✅ Updated only if J..P has any value (exclude H & I)
        const updated = [r[9], r[10], r[11], r[12], r[13], r[14], r[15]]
          .some((v) => String(v || "").trim());

        return { rowNumber, trn, fullname, contactNo, province, updated };
      })
      .filter(Boolean);

    return res.json({ success: true, records });
  } catch (err) {
    console.error("Error in GET /api/failed-registrations:", err.message || err);
    return res.status(500).json({ success: false, message: "Error loading failed registrations." });
  }
});

// =============================================================
// ✅ GET SINGLE ROW (for autofill on left update panel)
// Reads A:P and computes updated same as list (J..P)
// =============================================================
app.get("/api/failed-registration-row", async (req, res) => {
  try {
    const rn = Number(req.query.rowNumber);
    if (!rn || rn < 2) return res.json({ success: false, message: "Invalid rowNumber." });

    const sheets = await getClient();

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetFailed}!A${rn}:P${rn}`,
    });

    const row = ((result.data.values || [])[0] || []);

    const updated = [row[9], row[10], row[11], row[12], row[13], row[14], row[15]]
      .some((v) => String(v || "").trim());

    const data = {
      rowNumber: rn,
      trn: String(row[1] || "").trim(),       // B
      fullname: String(row[2] || "").trim(),  // C
      contactNo: String(row[3] || "").trim(), // D
      province: String(row[6] || "").trim(),  // G
      updated,

      // H-P fields
      presentAddress: String(row[7] || "").trim(),        // H
      provincePresent: String(row[8] || "").trim(),       // I
      dateContacted: String(row[9] || "").trim(),         // J
      meansOfNotification: String(row[10] || "").trim(),  // K
      recaptureStatus: String(row[11] || "").trim(),      // L
      recaptureSchedule: String(row[12] || "").trim(),    // M
      provinceRegistration: String(row[13] || "").trim(), // N
      cityMunicipality: String(row[14] || "").trim(),     // O
      registrationCenter: String(row[15] || "").trim(),   // P
    };

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Error in GET /api/failed-registration-row:", err.message || err);
    return res.status(500).json({ success: false, message: "Error reading row." });
  }
});

// =============================================================
// ✅ UPDATE J–P only (exclude H & I per your request)
// J=DateContacted, K=Means, L=RecaptureStatus, M=RecaptureSchedule,
// N=Province(reg), O=City/Mun, P=RegistrationCenter
// =============================================================
app.post("/api/failed-registration-update", async (req, res) => {
  try {
    const {
      rowNumber,
      dateContacted,
      meansOfNotification,
      recaptureStatus,
      recaptureSchedule,
      provinceRegistration,
      cityMunicipality,
      registrationCenter,
    } = req.body || {};

    const rn = Number(rowNumber);
    if (!rn || rn < 2) return res.json({ success: false, message: "Invalid rowNumber." });

    const sheets = await getClient();

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetFailed}!J${rn}:P${rn}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          String(dateContacted || "").trim(),        // J
          String(meansOfNotification || "").trim(),  // K
          String(recaptureStatus || "").trim(),      // L
          String(recaptureSchedule || "").trim(),    // M
          String(provinceRegistration || "").trim(), // N
          String(cityMunicipality || "").trim(),     // O
          String(registrationCenter || "").trim(),   // P
        ]],
      },
    });

    await addLog("Office Update", "system", `Row ${rn} updated J:P`);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/failed-registration-update:", err.message || err);
    return res.status(500).json({ success: false, message: "Server error while updating record." });
  }
});

// =============================================================
// ✅ USER TRN SEARCH (reads Failed Registration A:S)
// =============================================================
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
      permanentAddress: row[5] || "",  // F (if you use)
      province: row[6] || "",          // G
      recaptureStatus: row[11] || "",  // L (if you show)
      recaptureSchedule: row[12] || "",// M
      status: row[16] || "",           // Q
      newTrn: row[17] || "",           // R
      dateOfRecapture: row[18] || "",  // S
      isoDateRecapture: tryParseDecStyleToISO(row[18] || ""),
    };

    return res.json({ success: true, record });
  } catch (err) {
    console.error("Error in POST /api/trn-search:", err.message || err);
    return res.status(500).json({ success: false, message: "Server error while searching TRN." });
  }
});

// =============================================================
// ✅ USER TRN UPDATE (updates Q:S)
// Q=Status, R=NewTRN, S=DateOfRecapture (formatted Dec 25, 2025)
// =============================================================
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

    // verify TRN matches row
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

    await addLog("TRN Update", "system", `TRN:${cleanTrn} Row:${rn} Q:S updated`);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/trn-update:", err.message || err);
    return res.status(500).json({ success: false, message: "Server error while saving update." });
  }
});

// ✅ 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server running on port " + PORT));
