// REAL SERVER — PSA System using Google Sheets (NO HASHING VERSION)
// Includes: Provinces dropdown + Admin role validation + Failed Registration TRN Search + Update Q–S
// Adds: Status dropdown from Dropdown!C2:C
// Adds: Position dropdown from Dropdown!B2:B
// Returns: Recapture Status & Schedule when TRN found

const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// ===== Google Sheets Setup =====
const KEYFILEPATH = path.join(__dirname, "service-account-key.json");
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES,
});

// ===== Your Google Sheet =====
const spreadsheetId = "1RJ16ZSoYzFgeYUmeXo21PwkWfG07xC_5R8YqMAtys8s";

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

// Create Logs sheet if missing
async function ensureLogsSheet(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some((s) => s.properties.title === sheetLogs);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetLogs } } }],
      },
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

  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetLogs}!A:D`,
    valueInputOption: "RAW",
    requestBody: { values: [[now, action, email, details]] },
  });
}

// Ensure Accounts columns exist (A–L)
async function ensureColumns() {
  const sheets = await getClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetAccounts}!A1:L1`,
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
      ]],
    },
  });

  await ensureLogsSheet(sheets);
}

// Load accounts (A–L)
async function loadAccounts() {
  const sheets = await getClient();
  await ensureColumns();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetAccounts}!A2:L`,
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
    }));
}

async function saveAccount({
  email,
  password,
  role,
  firstName,
  middleName,
  lastName,
  viber,
  province,
}) {
  const sheets = await getClient();
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetAccounts}!A:L`,
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
      ]],
    },
  });

  await addLog("Create Account", email, `Role: ${role}, Province: ${province}`);
}

async function updateLastLogin(email) {
  const sheets = await getClient();
  const accounts = await loadAccounts();

  const index = accounts.findIndex(
    (a) => a.email.toLowerCase() === email.toLowerCase()
  );
  if (index === -1) return;

  const rowNumber = index + 2;
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetAccounts}!F${rowNumber}:G${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[now, now]] },
  });

  await addLog("Login", email, "User logged in");
}

// ? Admin role allowed only if match exists in Admin sheet (A=FN, B=MN, C=LN, D=Email)
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

// ===== Date Format Helpers for Column S (Dec 25, 2025) =====
function formatToDec25Style(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const d = new Date(yyyyMmDd + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
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

// GET provinces (Dropdown!D2:D)
app.get("/api/provinces", async (req, res) => {
  try {
    const sheets = await getClient();

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!D2:D`,
    });

    const rows = result.data.values || [];
    const provinces = rows
      .map((r) => (r[0] || "").trim())
      .filter((v) => v.length > 0);

    const unique = [...new Set(provinces)];
    res.json({ success: true, provinces: unique });
  } catch (err) {
    console.error("Error in GET /api/provinces:", err);
    res.status(500).json({ success: false, message: "Error reading provinces." });
  }
});

// ? GET positions (Dropdown!B2:B)
app.get("/api/positions", async (req, res) => {
  try {
    const sheets = await getClient();

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!B2:B`,
    });

    const rows = result.data.values || [];
    const positions = rows
      .map((r) => (r[0] || "").trim())
      .filter((v) => v.length > 0);

    const unique = [...new Set(positions)];
    res.json({ success: true, positions: unique });
  } catch (err) {
    console.error("Error in GET /api/positions:", err);
    res.status(500).json({ success: false, message: "Error reading positions." });
  }
});

// ? GET status options (Dropdown!C2:C)
app.get("/api/status-options", async (req, res) => {
  try {
    const sheets = await getClient();

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!C2:C`,
    });

    const rows = result.data.values || [];
    const statuses = rows
      .map((r) => (r[0] || "").trim())
      .filter((v) => v.length > 0);

    const unique = [...new Set(statuses)];
    res.json({ success: true, statuses: unique });
  } catch (err) {
    console.error("Error in GET /api/status-options:", err);
    res.status(500).json({ success: false, message: "Error reading status options." });
  }
});

// REGISTER
app.post("/api/register", async (req, res) => {
  const { email, password, role, firstName, middleName, lastName, viber, province } = req.body || {};

  if (!email || !password || !role || !firstName || !lastName || !viber || !province) {
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

    await saveAccount({ email, password, role, firstName, middleName, lastName, viber, province });
    res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/register:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.json({ success: false, message: "Missing email or password" });

  try {
    const accounts = await loadAccounts();
    const user = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());

    if (!user) return res.json({ success: false, message: "Invalid email or password" });
    if (user.password !== password) return res.json({ success: false, message: "Invalid email or password" });

    if ((user.status || "").toLowerCase() !== "active") {
      return res.json({ success: false, message: "Account is disabled." });
    }

    await updateLastLogin(email);
    res.json({ success: true, role: user.role });
  } catch (err) {
    console.error("Error in POST /api/login:", err);
    res.status(500).json({ success: false, message: "Server error." });
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
    console.error("Error in POST /api/admin-eligible:", err);
    return res.status(500).json({ success: false, eligible: false });
  }
});

// ===================== TRN SEARCH / UPDATE (Failed Registration) =====================

// POST /api/trn-search { trn }
app.post("/api/trn-search", async (req, res) => {
  try {
    const { trn } = req.body || {};
    const cleanTrn = String(trn || "").trim();

    if (!/^\d{29}$/.test(cleanTrn)) {
      return res.json({ success: false, message: "Invalid TRN format. Must be 29 digits." });
    }

    const sheets = await getClient();

    // Get A2:S (A=No., B=TRN ... S=Date of Recapture)
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

    // Columns (0-based):
    // C2 Fullname
    // F5 Permanent Address
    // L11 Recapture Status
    // M12 Recapture Schedule
    // Q16 Status
    // R17 NEW TRN
    // S18 Date of Recapture
    const record = {
      rowNumber,
      trn: row[1] || "",
      fullname: row[2] || "",
      permanentAddress: row[5] || "",
      recaptureStatus: row[11] || "",
      recaptureSchedule: row[12] || "",
      status: row[16] || "",
      newTrn: row[17] || "",
      dateOfRecapture: row[18] || "",
      isoDateRecapture: tryParseDecStyleToISO(row[18] || ""),
    };

    return res.json({ success: true, record });
  } catch (err) {
    console.error("Error in POST /api/trn-search:", err);
    return res.status(500).json({ success: false, message: "Server error while searching TRN." });
  }
});

// POST /api/trn-update { rowNumber, trn, status, newTrn, dateOfRecapture(YYYY-MM-DD) }
app.post("/api/trn-update", async (req, res) => {
  try {
    const { rowNumber, trn, status, newTrn, dateOfRecapture } = req.body || {};
    const rn = Number(rowNumber);

    if (!rn || rn < 2) return res.json({ success: false, message: "Invalid rowNumber." });

    const cleanTrn = String(trn || "").trim();
    if (!/^\d{29}$/.test(cleanTrn)) return res.json({ success: false, message: "Invalid TRN format." });

    // ? Status required
    const cleanStatus = String(status || "").trim();
    if (!cleanStatus) {
      return res.json({ success: false, message: "Status is required." });
    }

    // ? NEW TRN validation (if provided, must be 29 digits)
    const cleanNewTrn = String(newTrn || "").trim();
    if (cleanNewTrn && !/^\d{29}$/.test(cleanNewTrn)) {
      return res.json({ success: false, message: "NEW TRN must be 29 digits (or leave blank)." });
    }

    const sheets = await getClient();

    // Safety check: verify TRN on that row matches
    const check = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetFailed}!B${rn}:B${rn}`,
    });
    const foundTrn = (((check.data.values || [])[0] || [])[0] || "").trim();
    if (foundTrn !== cleanTrn) {
      return res.json({ success: false, message: "Row mismatch. Please search again before saving." });
    }

    const formattedDate = formatToDec25Style(String(dateOfRecapture || "").trim());

    // Update Q-R-S => Q(Status), R(NEW TRN), S(Date of Recapture)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetFailed}!Q${rn}:S${rn}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[cleanStatus, cleanNewTrn, formattedDate]],
      },
    });

    await addLog("TRN Update", "system", `TRN: ${cleanTrn} | Row: ${rn} | QRS updated`);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/trn-update:", err);
    return res.status(500).json({ success: false, message: "Server error while saving update." });
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("?? REAL server running on port " + PORT);
});
