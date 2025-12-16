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

// ✅ Serve static UI (Render needs this)
app.use(express.static(path.join(__dirname, "public")));

// ✅ Root serve UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Health
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ===== Google Sheets Setup (ENV JSON) =====
function getCredentialsFromEnv() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) {
    throw new Error("Missing env GOOGLE_APPLICATION_CREDENTIALS_JSON in Render.");
  }
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

const sheetAccounts = "Accounts";
const sheetLogs = "Logs";
const sheetAdmin = "Admin";
const sheetDropdown = "Dropdown";
const sheetFailed = "Failed Registration";

// ===== Sheets Helpers =====
async function getClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

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

  // F UpdatedAt, G LastLogin
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetAccounts}!F${rowNumber}:G${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [[now, now]] },
  });

  await addLog("Login", email, "User logged in");
}

// Admin allowed only if exists in Admin sheet
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

// ===== Date helpers for Failed Registration column S =====
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

// ========================= OTP (Email) ==============================
// Render ENV required:
// EMAIL_USER, EMAIL_PASS (Gmail App Password)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const otpStore = new Map();      // email -> { otp, expiresAt, resendReadyAt }
const verifiedStore = new Map(); // email -> { expiresAt }

// ✅ Debug endpoint (open this in browser)
app.get("/api/email-debug", async (req, res) => {
  try {
    await transporter.verify();
    res.json({ success: true, message: "SMTP ready ✅" });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/send-otp { email }
app.post("/api/send-otp", async (req, res) => {
  try {
    const em = String(req.body?.email || "").trim().toLowerCase();
    if (!em || !em.includes("@")) return res.json({ success: false, message: "Valid email required." });

    const existing = otpStore.get(em);
    if (existing && Date.now() < existing.resendReadyAt) {
      const waitSec = Math.ceil((existing.resendReadyAt - Date.now()) / 1000);
      return res.json({ success: false, message: `Please wait ${waitSec}s before resending OTP.` });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(em, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,      // 5 minutes
      resendReadyAt: Date.now() + 30 * 1000,      // 30 seconds cooldown
    });

    await transporter.sendMail({
      from: `"PSA NID System" <${process.env.EMAIL_USER}>`,
      to: em,
      subject: "PSA NID System - OTP Verification Code",
      text: `Your OTP is ${otp}. It expires in 5 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2 style="margin:0 0 10px">OTP Verification</h2>
          <p>Your OTP code is:</p>
          <div style="font-size:28px;font-weight:800;letter-spacing:4px;margin:10px 0">${otp}</div>
          <p>Expires in <b>5 minutes</b>.</p>
          <p style="color:#6b7280;font-size:12px;margin-top:16px">If you did not request this, ignore this email.</p>
        </div>
      `,
    });

    await addLog("Send OTP", em, "OTP sent");
    res.json({ success: true, message: "OTP sent." });
  } catch (err) {
    console.error("SEND OTP ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP: " + (err?.message || "unknown error"),
    });
  }
});

// POST /api/verify-otp { email, otp }
app.post("/api/verify-otp", async (req, res) => {
  try {
    const em = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.otp || "").trim();

    const rec = otpStore.get(em);
    if (!rec) return res.json({ success: false, message: "No OTP found. Please resend." });
    if (Date.now() > rec.expiresAt) {
      otpStore.delete(em);
      return res.json({ success: false, message: "OTP expired. Please resend." });
    }
    if (rec.otp !== code) return res.json({ success: false, message: "Invalid OTP." });

    otpStore.delete(em);
    verifiedStore.set(em, { expiresAt: Date.now() + 10 * 60 * 1000 }); // verified window 10 mins
    await addLog("Verify OTP", em, "OTP verified");
    res.json({ success: true });
  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    res.status(500).json({ success: false, message: "Server error verifying OTP." });
  }
});

// ========================= API ROUTES ==============================

// ✅ Accounts list (for admin page)
app.get("/api/accounts", async (req, res) => {
  try {
    const accounts = await loadAccounts();
    // do not expose password
    res.json(accounts.map(a => ({
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

// Provinces
app.get("/api/provinces", async (req, res) => {
  try {
    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!D2:D`,
    });
    const rows = result.data.values || [];
    const provinces = rows.map(r => (r[0] || "").trim()).filter(Boolean);
    res.json({ success: true, provinces: [...new Set(provinces)] });
  } catch (err) {
    console.error("GET /api/provinces:", err);
    res.status(500).json({ success: false, message: "Error reading provinces." });
  }
});

// Positions
app.get("/api/positions", async (req, res) => {
  try {
    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!B2:B`,
    });
    const rows = result.data.values || [];
    const positions = rows.map(r => (r[0] || "").trim()).filter(Boolean);
    res.json({ success: true, positions: [...new Set(positions)] });
  } catch (err) {
    console.error("GET /api/positions:", err);
    res.status(500).json({ success: false, message: "Error reading positions." });
  }
});

// Status options
app.get("/api/status-options", async (req, res) => {
  try {
    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetDropdown}!C2:C`,
    });
    const rows = result.data.values || [];
    const statuses = rows.map(r => (r[0] || "").trim()).filter(Boolean);
    res.json({ success: true, statuses: [...new Set(statuses)] });
  } catch (err) {
    console.error("GET /api/status-options:", err);
    res.status(500).json({ success: false, message: "Error reading status options." });
  }
});

// Admin eligible
app.post("/api/admin-eligible", async (req, res) => {
  try {
    const { firstName, middleName, lastName, email } = req.body || {};
    if (!firstName || !lastName || !email) return res.json({ success: true, eligible: false });
    const eligible = await isAuthorizedAdmin(firstName, middleName, lastName, email);
    res.json({ success: true, eligible });
  } catch (err) {
    console.error("POST /api/admin-eligible:", err);
    res.status(500).json({ success: false, eligible: false });
  }
});

// REGISTER (requires verified OTP)
app.post("/api/register", async (req, res) => {
  const { email, password, role, firstName, middleName, lastName, viber, province } = req.body || {};
  if (!email || !password || !role || !firstName || !lastName || !viber || !province) {
    return res.json({ success: false, message: "Missing required fields." });
  }

  const em = String(email).trim().toLowerCase();

  const v = verifiedStore.get(em);
  if (!v || Date.now() > v.expiresAt) {
    verifiedStore.delete(em);
    return res.json({ success: false, message: "Email not verified. Please verify OTP first." });
  }

  try {
    const accounts = await loadAccounts();
    if (accounts.some(a => a.email.toLowerCase() === em)) {
      return res.json({ success: false, message: "Email already exists" });
    }

    if (role === "admin") {
      const allowed = await isAuthorizedAdmin(firstName, middleName, lastName, em);
      if (!allowed) {
        await addLog("Admin Register Blocked", em, "Not in Admin sheet");
        return res.json({ success: false, message: "Not authorized for Admin role." });
      }
    }

    await saveAccount({ email: em, password, role, firstName, middleName, lastName, viber, province });
    verifiedStore.delete(em);

    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/register:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.json({ success: false, message: "Missing email or password" });

  try {
    const accounts = await loadAccounts();
    const user = accounts.find(a => a.email.toLowerCase() === String(email).toLowerCase());

    if (!user) return res.json({ success: false, message: "Invalid email or password" });
    if (user.password !== password) return res.json({ success: false, message: "Invalid email or password" });

    if ((user.status || "").toLowerCase() !== "active") {
      return res.json({ success: false, message: "Account is disabled." });
    }

    await updateLastLogin(email);
    res.json({ success: true, role: user.role });
  } catch (err) {
    console.error("POST /api/login:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// TRN search
app.post("/api/trn-search", async (req, res) => {
  try {
    const cleanTrn = String(req.body?.trn || "").trim();
    if (!/^\d{29}$/.test(cleanTrn)) return res.json({ success: false, message: "Invalid TRN. Must be 29 digits." });

    const sheets = await getClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetFailed}!A2:S`,
    });

    const rows = result.data.values || [];
    const index = rows.findIndex((r) => (r[1] || "").trim() === cleanTrn);
    if (index === -1) return res.json({ success: false, message: "TRN not found." });

    const row = rows[index] || [];
    const rowNumber = index + 2;

    res.json({
      success: true,
      record: {
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
      },
    });
  } catch (err) {
    console.error("POST /api/trn-search:", err);
    res.status(500).json({ success: false, message: "Server error while searching TRN." });
  }
});

// TRN update
app.post("/api/trn-update", async (req, res) => {
  try {
    const rn = Number(req.body?.rowNumber);
    const cleanTrn = String(req.body?.trn || "").trim();
    const cleanStatus = String(req.body?.status || "").trim();
    const cleanNewTrn = String(req.body?.newTrn || "").trim();
    const dateOfRecapture = String(req.body?.dateOfRecapture || "").trim();

    if (!rn || rn < 2) return res.json({ success: false, message: "Invalid rowNumber." });
    if (!/^\d{29}$/.test(cleanTrn)) return res.json({ success: false, message: "Invalid TRN format." });
    if (!cleanStatus) return res.json({ success: false, message: "Status is required." });
    if (cleanNewTrn && !/^\d{29}$/.test(cleanNewTrn)) return res.json({ success: false, message: "NEW TRN must be 29 digits." });

    const sheets = await getClient();
    const check = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetFailed}!B${rn}:B${rn}`,
    });
    const foundTrn = (((check.data.values || [])[0] || [])[0] || "").trim();
    if (foundTrn !== cleanTrn) return res.json({ success: false, message: "Row mismatch. Search again." });

    const formattedDate = formatToDec25Style(dateOfRecapture);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetFailed}!Q${rn}:S${rn}`,
      valueInputOption: "RAW",
      requestBody: { values: [[cleanStatus, cleanNewTrn, formattedDate]] },
    });

    await addLog("TRN Update", "system", `TRN:${cleanTrn} Row:${rn}`);
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/trn-update:", err);
    res.status(500).json({ success: false, message: "Server error while saving update." });
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🔥 server running on port", PORT));
