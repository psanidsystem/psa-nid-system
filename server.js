// PSA NID SYSTEM — Server + UI (Render-ready)
// - Serves static UI from /public
// - Google Sheets backend
// - Includes /api/login again (fix Route not found)
// - NO Logs writing (no append/update logs sheet)
// - Failed Registration update writes ONLY H:P (NO Col Q)

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

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// ✅ Ensure Accounts header (A–M)
async function ensureAccountsColumns(sheets) {
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
}

// Load accounts (A–M)
async function loadAccounts() {
  const sheets = await getClient();
  await ensureAccountsColumns(sheets);

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
}

async function updateLastLogin(email) {
  const sheets = await getClient();
  const accounts = await loadAccounts();

  const index = accounts.findIndex((a) => normalizeEmail(a.email) === normalizeEmail(email));
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
  const em = normalizeEmail(email);

  return rows.some((row) => {
    const rFn = (row[0] || "").toLowerCase().trim();
    const rMn = (row[1] || "").toLowerCase().trim();
    const rLn = (row[2] || "").toLowerCase().trim();
    const rEm = normalizeEmail(row[3] || "");
    return rFn === fn && rMn === mn && rLn === ln && rEm === em;
  });
}

// ========================= AUTH ROUTES ==============================

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
    if (accounts.some((a) => normalizeEmail(a.email) === normalizeEmail(email))) {
      return res.json({ success: false, message: "Email already exists" });
    }

    if (String(role).toLowerCase() === "admin") {
      const allowed = await isAuthorizedAdmin(firstName, middleName, lastName, email);
      if (!allowed) {
        return res.json({
          success: false,
          message: "Dili ka pwede mo-set og Admin Role (not authorized).",
        });
      }
    }

    await saveAccount({ email, password, role, firstName, middleName, lastName, viber, province, position });
    return res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/register:", err.message || err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// ✅ LOGIN (THIS FIXES YOUR ISSUE)
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.json({ success: false, message: "Missing email or password" });

  try {
    const accounts = await loadAccounts();
    const user = accounts.find((a) => normalizeEmail(a.email) === normalizeEmail(email));

    if (!user) return res.json({ success: false, message: "Invalid email or password" });
    if (String(user.password || "") !== String(password || "")) {
      return res.json({ success: false, message: "Invalid email or password" });
    }

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

// ========================= OFFICE ROUTES ==============================

// Recapture Status options: Dropdown!E2:E
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

// Means of Notification options: Dropdown!A2:A
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

function isUpdatedFromHP(row) {
  for (let i = 7; i <= 15; i++) {
    if (String(row[i] || "").trim()) return true;
  }
  return false;
}

// Province filter uses COLUMN G (index 6)
app.get("/api/failed-registrations", async (req, res) => {
  try {
    const provinceQ = String(req.query.province || "").trim().toLowerCase();
    const sheets = await getClient();

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
        const province = String(r[6] || "").trim();  // ✅ G

        if (provinceQ && province.toLowerCase() !== provinceQ) return null;

        return {
          rowNumber,
          trn,
          fullname,
          contactNo,
          province,
          updated: isUpdatedFromHP(r),
        };
      })
      .filter(Boolean);

    return res.json({ success: true, records });
  } catch (err) {
    console.error("Error in GET /api/failed-registrations:", err.message || err);
    return res.status(500).json({ success: false, message: "Error loading failed registrations." });
  }
});

// Get single row
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

    const data = {
      rowNumber: rn,
      trn: String(row[1] || "").trim(),       // B
      fullname: String(row[2] || "").trim(),  // C
      contactNo: String(row[3] || "").trim(), // D
      province: String(row[6] || "").trim(),  // G
      updated: isUpdatedFromHP(row),

      // H-P
      presentAddress: String(row[7] || "").trim(),
      provincePresent: String(row[8] || "").trim(),
      dateContacted: String(row[9] || "").trim(),
      meansOfNotification: String(row[10] || "").trim(),
      recaptureStatus: String(row[11] || "").trim(),
      recaptureSchedule: String(row[12] || "").trim(),
      provinceRegistration: String(row[13] || "").trim(),
      cityMunicipality: String(row[14] || "").trim(),
      registrationCenter: String(row[15] || "").trim(),
    };

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Error in GET /api/failed-registration-row:", err.message || err);
    return res.status(500).json({ success: false, message: "Error reading row." });
  }
});

// Update H:P ONLY (NO Q, NO LOGS)
app.post("/api/failed-registration-update", async (req, res) => {
  try {
    const {
      rowNumber,
      presentAddress,
      provincePresent,
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
      range: `${sheetFailed}!H${rn}:P${rn}`, // ✅ H-P ONLY
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          String(presentAddress || "").trim(),         // H
          String(provincePresent || "").trim(),        // I
          String(dateContacted || "").trim(),          // J
          String(meansOfNotification || "").trim(),    // K
          String(recaptureStatus || "").trim(),        // L
          String(recaptureSchedule || "").trim(),      // M
          String(provinceRegistration || "").trim(),   // N
          String(cityMunicipality || "").trim(),       // O
          String(registrationCenter || "").trim(),     // P
        ]],
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/failed-registration-update:", err.message || err);
    return res.status(500).json({ success: false, message: "Server error while updating record." });
  }
});

// ✅ 404 for API routes only
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 Server running on port " + PORT));
