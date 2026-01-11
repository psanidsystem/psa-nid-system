const API = location.origin;

// ✅ Office positions allowed
const OFFICE_POSITIONS = new Set([
  "Registration Officer III",
  "Registration Officer II",
  "Information Officer I",
]);

// ===== AUTH GUARD (Office Page) =====
(() => {
  const email = localStorage.getItem("email");
  const role = localStorage.getItem("role");
  const sessionAt = Number(localStorage.getItem("sessionAt") || "0");
  const position = (localStorage.getItem("position") || "").trim();
  const province = (localStorage.getItem("province") || "").trim();

  const MAX_AGE_MS = 30 * 60 * 1000;

  if (!email || !role || !sessionAt || Date.now() - sessionAt > MAX_AGE_MS) {
    localStorage.removeItem("email");
    localStorage.removeItem("role");
    localStorage.removeItem("sessionAt");
    localStorage.removeItem("position");
    localStorage.removeItem("province");
    location.replace("index.html");
    return;
  }

  // must be user + office position
  if (role !== "user" || !OFFICE_POSITIONS.has(position)) {
    location.replace("user.html");
    return;
  }

  // must have province (required for filtering)
  if (!province) {
    // If missing province, force re-login so session will get province from /api/login
    location.replace("index.html");
    return;
  }
})();

// ===== Elements (optional, if you have them in office.html) =====
const userEmailEl = document.getElementById("userEmail");
const userProvinceEl = document.getElementById("userProvince"); // optional label span
const logoutLink = document.getElementById("logoutLink");       // optional logout button/link

// Records UI (adjust IDs based on your office.html)
const tableBodyEl = document.getElementById("recordsBody");      // tbody
const countEl = document.getElementById("recordsCount");         // optional
const msgOkEl = document.getElementById("msgOk");                // optional
const msgErrEl = document.getElementById("msgErr");              // optional
const refreshBtnEl = document.getElementById("refreshBtn");      // optional

// ===== Helpers =====
function showOk(text) {
  if (!msgOkEl) return;
  msgOkEl.textContent = text || "";
  msgOkEl.style.display = "block";
  if (msgErrEl) msgErrEl.style.display = "none";
}
function showErr(text) {
  if (!msgErrEl) return;
  msgErrEl.textContent = text || "";
  msgErrEl.style.display = "block";
  if (msgOkEl) msgOkEl.style.display = "none";
}
function clearMsgs() {
  if (msgOkEl) msgOkEl.style.display = "none";
  if (msgErrEl) msgErrEl.style.display = "none";
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ===== Session info =====
const sessionEmail = localStorage.getItem("email") || "—";
const sessionProvince = (localStorage.getItem("province") || "").trim();

if (userEmailEl) userEmailEl.textContent = sessionEmail;
if (userProvinceEl) userProvinceEl.textContent = sessionProvince;

// Logout
logoutLink && logoutLink.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.removeItem("email");
  localStorage.removeItem("role");
  localStorage.removeItem("sessionAt");
  localStorage.removeItem("position");
  localStorage.removeItem("province");
  location.replace("index.html");
});

// ===== Render =====
function renderRows(rows) {
  if (!tableBodyEl) return;

  tableBodyEl.innerHTML = "";

  if (!rows || rows.length === 0) {
    tableBodyEl.innerHTML = `
      <tr>
        <td colspan="10" style="padding:12px; color:#6b7280; font-weight:700;">
          No records found for province: ${escapeHtml(sessionProvince)}
        </td>
      </tr>`;
    if (countEl) countEl.textContent = "0";
    return;
  }

  if (countEl) countEl.textContent = String(rows.length);

  // ✅ Adjust columns to match your sheet fields
  // Example fields: fullname, province, trn, status, date, remarks
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.fullname || r.fullName || "")}</td>
      <td>${escapeHtml(r.province || "")}</td>
      <td>${escapeHtml(r.trn || "")}</td>
      <td>${escapeHtml(r.status || "")}</td>
      <td>${escapeHtml(r.date || r.dateOfRegistration || "")}</td>
      <td>${escapeHtml(r.remarks || "")}</td>
    `;
    tableBodyEl.appendChild(tr);
  }
}

// ===== Fetch records filtered by province =====
async function loadFailedRegistrations() {
  clearMsgs();

  if (!sessionProvince) {
    showErr("No province in session. Please login again.");
    return;
  }

  try {
    // ✅ OPTION A (Recommended): server-side filtering
    // Create endpoint: GET /api/failed-registrations?province=Cebu
    const url = API + "/api/failed-registrations?province=" + encodeURIComponent(sessionProvince);
    const r = await fetch(url);
    const d = await r.json();

    // expected: { success:true, records:[...] }
    if (d.success && Array.isArray(d.records)) {
      renderRows(d.records);
      showOk(`Showing records for: ${sessionProvince}`);
      return;
    }

    // ✅ OPTION B fallback: if your endpoint returns "allRecords"
    // Or if endpoint doesn't exist yet, you can change this fallback accordingly.
    if (Array.isArray(d.records)) {
      const filtered = d.records.filter(x => (x.province || "").trim() === sessionProvince);
      renderRows(filtered);
      showOk(`Showing records for: ${sessionProvince}`);
      return;
    }

    showErr(d.message || "Failed to load records.");
  } catch (e) {
    console.error("failed-registrations error:", e);
    showErr("Server error while loading records.");
  }
}

// Refresh
refreshBtnEl && refreshBtnEl.addEventListener("click", loadFailedRegistrations);

// Auto load on page open
loadFailedRegistrations();
