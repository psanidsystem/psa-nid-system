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
const sheetFailed = "Failed Registration";
const sheetDropdown = "Dropdown";

// ===== Helpers =====
async function getClient() {
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

function uniq(arr) {
  return [...new Set(arr)];
}

// =============================================================
// ✅ DROPDOWN OPTIONS
// Means of Notification: Dropdown!A2:A
// Recapture Status:      Dropdown!C2:C
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
      range: `${sheetDropdown}!C2:C`,
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
// Columns:
// A No.
// B TRN
// C Fullname
// D Contact No.
// E Email Address
// F Permanent Address
// G Province   ✅ BASIS
// H-P are update columns
// =============================================================
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

        return { rowNumber, trn, fullname, contactNo, province };
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
// Reads H-P existing values
// =============================================================
app.get("/api/failed-registration-row", async (req, res) => {
  try {
    const rn = Number(req.query.rowNumber);
    if (!rn || rn < 2) return res.json({ success: false, message: "Invalid rowNumber." });

    const sheets = await getClient();

    // Read A-P in that row so we can return both left info + right side fields
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
    };

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Error in GET /api/failed-registration-row:", err.message || err);
    return res.status(500).json({ success: false, message: "Error reading row." });
  }
});

// =============================================================
// ✅ UPDATE H–P (Present Address..Registration Center)
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
