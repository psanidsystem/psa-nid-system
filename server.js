// PSA NID SYSTEM — Server + UI (Render-ready)
// - Serves static UI from /public
// - Google Sheets backend
// - Accounts sheet columns A–M include Province + Position
// - Login returns role + province + position
// - Office module: Failed Registration list + update panel
// - Updated badge BASED ONLY on Column Q timestamp (UpdatedAt marker)
// - DOES NOT use Present Address / Province (Present) for updated detection

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

// ✅ Ensure Accounts columns (A–M)
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
}

// Load accounts (A–M)
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

// ========================= ROUTES ==============================

// ✅ Provinces (Dropdown!D2:D)
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

// ✅ Positions (Dropdown!B2:B)
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

// ✅ Admin eligible
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

// ✅ REGISTER
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
        return res.json({
          success: false,
          message: "Dili ka pwede mo-set og Admin Role (not authorized).",
        });
      }
    }

    await saveAccount({
      email: String(email).toLowerCase(),
      password,
      role,
      firstName,
      middleName,
      lastName,
      viber,
      province,
      position
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Error in POST /api/register:", err.message || err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ✅ LOGIN (returns role + province + position)
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
// ✅ DROPDOWN OPTIONS (Office Update Panel)
// Means of Notification: Dropdown!A2:A
// Recapture Status:      Dropdown!E2:E   ✅ (as you said latest)
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
// Reads A2:Q so we can check UpdatedAt marker in Q (index 16)
// Updated badge BASED ONLY on Column Q
// =============================================================
app.get("/api/failed-registrations", async (req, res) => {
  try {
    const provinceQ = String(req.query.province || "").trim().toLowerCase();
    const sheets = await getClient();

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetFailed}!A2:Q`,
    });

    const rows = result.data.values || [];

    const records = rows
      .map((r, i) => {
        const rowNumber = i + 2;

        const trn = String(r[1] || "").trim();       // B
        const fullname = String(r[2] || "").trim();  // C
        if (!trn) return null;

        const contactNo = String(r[3] || "").trim(); // D
        const province = String(r[6] || "").trim();  // ✅ G (basis)
        if (provinceQ && province.toLowerCase() !== provinceQ) return null;

        // ✅ UpdatedAt marker = Column Q (index 16) ONLY
        const updatedAt = String(r[16] || "").trim();
        const updated = !!updatedAt;

        return { rowNumber, trn, fullname, contactNo, province, updated, updatedAt };
      })
      .filter(Boolean);

    return res.json({ success: true, records });
  } catch (err) {
    console.error("Error in GET /api/failed-registrations:", err.message || err);
    return res.status(500).json({ success: false, message: "Error loading failed registrations." });
  }
});

// =============================================================
// ✅ GET SINGLE ROW (for autofill on update panel)
// Reads A:Q so we can return UpdatedAt too
// =============================================================
app.get("/api/failed-registration-row", async (req, res) => {
  try {
    const rn = Number(req.query.rowNumber);
    if (!rn || rn < 2) return res.json({ success: false, message: "Invalid rowNumber." });

    const sheets = await getClient();

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetFailed}!A${rn}:Q${rn}`,
    });

    const row = ((result.data.values || [])[0] || []);

    const updatedAt = String(row[16] || "").trim(); // Q
    const data = {
      rowNumber: rn,
      trn: String(row[1] || "").trim(),       // B
      fullname: String(row[2] || "").trim(),  // C
      contactNo: String(row[3] || "").trim(), // D
      province: String(row[6] || "").trim(),  // G

      // H-P autofill
      presentAddress: String(row[7] || "").trim(),        // H
      provincePresent: String(row[8] || "").trim(),       // I
      dateContacted: String(row[9] || "").trim(),         // J
      meansOfNotification: String(row[10] || "").trim(),  // K
      recaptureStatus: String(row[11] || "").trim(),      // L
      recaptureSchedule: String(row[12] || "").trim(),    // M
      provinceRegistration: String(row[13] || "").trim(), // N
      cityMunicipality: String(row[14] || "").trim(),     // O
      registrationCenter: String(row[15] || "").trim(),   // P

      // ✅ Updated marker
      updated: !!updatedAt,
      updatedAt,
    };

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Error in GET /api/failed-registration-row:", err.message || err);
    return res.status(500).json({ success: false, message: "Error reading row." });
  }
});

// =============================================================
// ✅ UPDATE H–P + set UpdatedAt marker in Q
// =============================================================
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

    // 1) Update H-P
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetFailed}!H${rn}:P${rn}`,
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

    // 2) Set UpdatedAt marker in Q (ONLY marker used for badge)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetFailed}!Q${rn}:Q${rn}`,
      valueInputOption: "RAW",
      requestBody: { values: [[new Date().toISOString()]] },
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
