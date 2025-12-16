// REAL SERVER — PSA System using Google Sheets (NO HASHING VERSION)
// Includes: Provinces dropdown + Admin role validation + Failed Registration TRN Search + Update Q–S
// Adds: Status dropdown from Dropdown!C2:C
// Adds: Position dropdown from Dropdown!B2:B
// Adds: Email OTP verification during registration

const express = require("express");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const { GoogleAuth } = require("google-auth-library");

const app = express();

// ===== Middlewares =====
app.use(cors());
app.use(express.json());

// ✅ Serve static UI from /public
app.use(express.static(path.join(__dirname, "public")));

// ✅ Root serves index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Optional health check
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "psa-nid-system", time: new Date().toISOString() });
});

// ===== Google Sheets Setup (ENV JSON) =====
function getCredentialsFromEnv() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!raw) {
    throw new Error(
      "Missing env GOOGLE_APPLICATION_CREDENTIALS_JSON. Add it in Render Environment Variables."
    );
  }

  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(
      "Invalid JSON in GOOGLE_APPLICATION_CREDENTIALS_JSON. Make sure you pasted the full service account JSON correctly."
    );
  }
}

const credentials = getCredentialsFromEnv();

const auth = new GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
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

  // F = UpdatedAt, G = LastLogin
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

// ========================= OTP (Email) ==============================

// Requires Render ENV:
// EMAIL_USER=yourgmail@gmail.com
// EMAIL_PASS=GMAIL_APP_PASSWORD
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// OTP store + verified store (in-memory)
const otpStore = new Map();        // email -> { otp, expiresAt, lastSentAt }
const verifiedStore = new Map();   // email -> { expiresAt }

// POST /api/send-otp { email }
app.post("/api/send-otp", async (req, res) => {
  try {
    const { email } = req.body || {};
    const em = String(email || "").trim().toLowerCase();

    if (!em || !em.includes("@")) {
      return res.json({ success: false, message: "Valid email is required." });
    }

    // Simple throttle: 30s cooldown
    const existing = otpStore.get(em);
    if (existing && existing.lastSentAt && Date.now() - existing.lastSentAt < 30 * 1000) {
      return res.json({ success: true, message: "OTP already sent. Please wait before resending." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins

    otpStore.set(em, { otp, expiresAt, lastSentAt: Date.now() });

    const subject = "PSA NID System - OTP Verification Code";
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;">
        <h2 style="margin:0 0 10px;">OTP Verification</h2>
        <p>Your OTP code is:</p>
        <div style="font-size:28px;font-weight:800;letter-spacing:4px;margin:10px 0;">${otp}</div>
        <p>This code will expire in <b>5 minutes</b>.</p>
        <p style="color:#6b7280;font-size:12px;margin-top:16px;">
          If you did not request this, please ignore this email.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"PSA NID System" <${process.env.EMAIL_USER}>`,
      to: em,
      subject,
      text: `Your OTP code is ${otp}. This code will expire in 5 minutes.`,
      html,
    });

    await addLog("Send OTP", em, "OTP sent to email");
    return res.json({ success: true });
  } catch (err) {
    console.error("Error in /api/send-otp:", err.message || err);
    return res.status(500).json({ success: false, message: "Failed to send OTP." });
  }
});

// POST /api/verify-otp { email, otp }
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    const em = String(email || "").trim().toLowerCase();
    const code = String(otp || "").trim();

    const rec = otpStore.get(em);
    if (!rec) return res.json({ success: false, message: "No OTP found. Please resend OTP." });

    if (Date.now() > rec.expiresAt) {
      otpStore.delete(em);
      return res.json({ success: false, message: "OTP expired. Please resend OTP." });
    }

    if (rec.otp !== code) {
      return res.json({ success: false, message: "Invalid OTP." });
    }

    // OTP correct
    otpStore.delete(em);
    verifiedStore.set(em, { expiresAt: Date.now() + 10 * 60 * 1000 }); // verified window 10 mins

    await addLog("Verify OTP", em, "OTP verified");
    return res.json({ success: true });
  } catch (err) {
    console.error("Error in /api/verify-otp:", err.message || err);
    return res.status(500).json({ success: false, message: "Server error verifying OTP." });
  }
});

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

    const rows = result.data.values || [];
    const positions = rows
      .map((r) => (r[0] || "").trim())
      .filter((v) => v.length > 0);

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

    const rows = result.data.values || [];
    const statuses = rows
      .map((r) => (r[0] || "").trim())
      .filter((v) => v.length > 0);

    res.json({ success: true, statuses: [...new Set(statuses)] });
  } catch (err) {
    console.error("Error in GET /api/status-options:", err.message || err);
    res.status(500).json({ success: false, message: "Error reading status options." });
  }
});

// REGISTER (now requires verified OTP)
app.post("/api/register", async (req, res) => {
  const { email, password, role, firstName, middleName, lastName, viber, province } = req.body || {};

  if (!email || !password || !role || !firstName || !lastName || !viber || !province) {
    return res.json({ success: false, message: "Missing required fields." });
  }

  const em = String(email).trim().toLowerCase();

  // ✅ OTP verified check
  const v = verifiedStore.get(em);
  if (!v || Date.now() > v.expiresAt) {
    verifiedStore.delete(em);
    return res.json({ success: false, message: "Email not verified. Please verify OTP first." });
  }

  try {
    const accounts = await loadAccounts();

    if (accounts.some((a) => a.email.toLowerCase() === em)) {
      return res.json({ success: false, message: "Email already exists" });
    }

    if (role === "admin") {
      const allowed = await isAuthorizedAdmin(firstName, middleName, lastName, em);
      if (!allowed) {
        await addLog("Admin Register Blocked", em, "Not in Admin sheet");
        return res.json({
          success: false,
          message: "Dili ka pwede mo-set og Admin Role (not authorized).",
        });
      }
    }

    await saveAccount({ email: em, password, role, firstName, middleName, lastName, viber, province });

    // consume verified flag once used
    verifiedStore.delete(em);

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
    const user = accounts.find((a) => a.email.toLowerCase() === String(email).toLowerCase());

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
    console.error("Error in POST /api/trn-search:", err.message || err);
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

    const cleanStatus = String(status || "").trim();
    if (!cleanStatus) return res.json({ success: false, message: "Status is required." });

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
    console.error("Error in POST /api/trn-update:", err.message || err);
    return res.status(500).json({ success: false, message: "Server error while saving update." });
  }
});

// ✅ 404 handler (keep this LAST among routes)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ✅ error handler (keep LAST)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error." });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🔥 REAL server running on port " + PORT);
});
