const express = require("express");
const cors = require("cors");
const path = require("path");
const { google } = require("googleapis");
const { GoogleAuth } = require("google-auth-library");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ serve static UI (Render)
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ===== Google Sheets Setup (ENV JSON) =====
function getCredentialsFromEnv() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) {
    throw new Error("Missing env GOOGLE_APPLICATION_CREDENTIALS_JSON.");
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error("Invalid JSON in GOOGLE_APPLICATION_CREDENTIALS_JSON.");
  }
}

const credentials = getCredentialsFromEnv();

const auth = new GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function getClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

// ===== Your Google Sheet =====
const spreadsheetId = "1RJ16ZSoYzFgeYUmeXo21PwkWfG07xC_5R8YqMAtys8s";

const sheetAccounts = "Accounts";
const sheetLogs = "Logs";
const sheetAdmin = "Admin";
const sheetDropdown = "Dropdown";
const sheetFailed = "Failed Registration";

// ✅ Ranges (overrideable)
const POSITIONS_RANGE = process.env.POSITIONS_RANGE || `${sheetDropdown}!B2:B`;
const PROVINCES_RANGE = process.env.PROVINCES_RANGE || `${sheetDropdown}!D2:D`;
const STATUS_RANGE = process.env.STATUS_RANGE || `${sheetDropdown}!C2:C`;

// ===== Helpers =====
async function ensureLogsSheet(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some((s) => s.properties.title === sheetLogs);

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

async function saveAccount({ email, password, role, firstName, middleName, lastName, viber, province }) {
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

  await addLog("Create Account", email, `Role:${role} Province:${province}`);
}

async function updateLastLogin(email) {
  const sheets = await getClient();
  const accounts = await loadAccounts();

  const index = accounts.findIndex((a) => a.email.toLowerCase() === email.toLowerCase());
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

// Admin role allowed only if match exists in Admin sheet (A=FN, B=MN, C=LN, D=Email)
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

function uniqNonEmpty(values) {
  return [...new Set(values.map((v) => (v || "").trim()).filter((v) => v.length > 0))];
}

async function readColumnRange(range) {
  const sheets = await getClient();
  const result = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = result.data.values || [];
  return uniqNonEmpty(rows.map((r) => r[0]));
}

// ===== ROUTES =====

// dropdown debug
app.get("/api/dropdown-debug", async (req, res) => {
  try {
    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!A1:Z20`,
    });

    res.json({
      success: true,
      preview: result.data.values || [],
      ranges: { POSITIONS_RANGE, PROVINCES_RANGE, STATUS_RANGE },
    });
  } catch (err) {
    console.error("dropdown-debug:", err);
    res.status(500).json({ success: false, message: err.message || "debug error" });
  }
});

// positions
app.get("/api/positions", async (req, res) => {
  try {
    const positions = await readColumnRange(POSITIONS_RANGE);
    res.json({ success: true, positions, message: positions.length ? "" : `No positions in ${POSITIONS_RANGE}` });
  } catch (err) {
    console.error("GET /api/positions:", err);
    res.status(500).json({ success: false, message: "Error reading positions." });
  }
});

// provinces
app.get("/api/provinces", async (req, res) => {
  try {
    const provinces = await readColumnRange(PROVINCES_RANGE);
    res.json({ success: true, provinces, message: provinces.length ? "" : `No provinces in ${PROVINCES_RANGE}` });
  } catch (err) {
    console.error("GET /api/provinces:", err);
    res.status(500).json({ success: false, message: "Error reading provinces." });
  }
});

// status options
app.get("/api/status-options", async (req, res) => {
  try {
    const statuses = await readColumnRange(STATUS_RANGE);
    res.json({ success: true, statuses });
  } catch (err) {
    console.error("GET /api/status-options:", err);
    res.status(500).json({ success: false, message: "Error reading status options." });
  }
});

// admin eligible
app.post("/api/admin-eligible", async (req, res) => {
  try {
    const { firstName, middleName, lastName, email } = req.body || {};
    if (!firstName || !lastName || !email) return res.json({ success: true, eligible: false });

    const eligible = await isAuthorizedAdmin(firstName, middleName, lastName, email);
    return res.json({ success: true, eligible });
  } catch (err) {
    console.error("POST /api/admin-eligible:", err);
    return res.status(500).json({ success: false, eligible: false });
  }
});

// REGISTER (NO OTP)
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
        return res.json({ success: false, message: "Not authorized for Admin role." });
      }
    }

    await saveAccount({ email, password, role, firstName, middleName, lastName, viber, province });
    res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/register:", err.message || err);
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
    console.error("Error in POST /api/login:", err.message || err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Admin accounts list
app.get("/api/accounts", async (req, res) => {
  try {
    const accounts = await loadAccounts();
    res.json(accounts.map((a) => ({
      email: a.email,
      role: a.role,
      status: a.status,
      lastLogin: a.lastLogin,
    })));
  } catch (err) {
    console.error("GET /api/accounts:", err);
    res.status(500).json({ success: false, message: "Error loading accounts." });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 server running on port " + PORT));
