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

  // ✅ must be user + office position
  if (role !== "user" || !OFFICE_POSITIONS.has(position)) {
    location.replace("user.html");
    return;
  }

  // ✅ must have province for filtering
  if (!province) {
    location.replace("index.html");
    return;
  }
})();

// ===== Elements (aligned to your office.html) =====
const userEmailEl = document.getElementById("userEmail");
const logoutLink = document.getElementById("logoutLink");

const subTextEl = document.getElementById("subText");
const qInputEl = document.getElementById("qInput");

const refreshBtnEl = document.getElementById("refreshBtn");
const refreshSpinnerEl = document.getElementById("refreshSpinner");

const msgOkEl = document.getElementById("msgOk");
const msgErrEl = document.getElementById("msgErr");

const tbodyEl = document.getElementById("tbody");

// ===== Session info =====
const sessionEmail = localStorage.getItem("email") || "—";
const sessionProvince = (localStorage.getItem("province") || "").trim();

if (userEmailEl) userEmailEl.textContent = sessionEmail;

// ===== State =====
let allProvinceRows = [];   // all records for the logged-in user's province
let shownRows = [];         // currently displayed (after search filter)

// ===== Helpers =====
function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showOk(text) {
  if (msgErrEl) msgErrEl.style.display = "none";
  if (msgOkEl) {
    msgOkEl.textContent = text || "";
    msgOkEl.style.display = "block";
  }
}

function showErr(text) {
  if (msgOkEl) msgOkEl.style.display = "none";
  if (msgErrEl) {
    msgErrEl.textContent = text || "";
    msgErrEl.style.display = "block";
  }
}

function clearMsgs() {
  if (msgOkEl) msgOkEl.style.display = "none";
  if (msgErrEl) msgErrEl.style.display = "none";
}

function setLoading(isLoading) {
  if (refreshBtnEl) refreshBtnEl.disabled = !!isLoading;
  if (refreshBtnEl) refreshBtnEl.classList.toggle("loading", !!isLoading);
  if (refreshSpinnerEl) refreshSpinnerEl.style.display = isLoading ? "inline-block" : "none";
}

function setSubText(text) {
  if (!subTextEl) return;
  subTextEl.textContent = text || "";
}

function normalize(v) {
  return (v || "").toString().trim();
}

function rowToSearchText(r) {
  // search through these fields
  const trn = normalize(r.trn || r.TRN);
  const fullname = normalize(r.fullname || r.fullName || r.Fullname);
  const contact = normalize(r.contactNo || r.contact || r.viber || r.mobile || r["Contact No."]);
  const email = normalize(r.email || r.emailAddress || r["Email Address"]);
  const addr = normalize(r.permanentAddress || r.address || r["Permanent Address"]);
  const prov = normalize(r.province || r.Province);

  return `${trn} ${fullname} ${contact} ${email} ${addr} ${prov}`.toLowerCase();
}

// ===== Render (aligned to your table columns) =====
// Columns in office.html: TRN | Fullname | Contact No. | Email Address | Permanent Address | Province
function renderRows(rows) {
  if (!tbodyEl) return;

  tbodyEl.innerHTML = "";

  if (!rows || rows.length === 0) {
    tbodyEl.innerHTML = `<tr><td colspan="6">No records found.</td></tr>`;
    return;
  }

  for (const r of rows) {
    const trn = normalize(r.trn || r.TRN);
    const fullname = normalize(r.fullname || r.fullName || r.Fullname);
    const contact = normalize(r.contactNo || r.contact || r.viber || r.mobile || r["Contact No."]);
    const email = normalize(r.email || r.emailAddress || r["Email Address"]);
    const addr = normalize(r.permanentAddress || r.address || r["Permanent Address"]);
    const prov = normalize(r.province || r.Province);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(trn)}</td>
      <td>${escapeHtml(fullname)}</td>
      <td>${escapeHtml(contact)}</td>
      <td>${escapeHtml(email)}</td>
      <td>${escapeHtml(addr)}</td>
      <td>${escapeHtml(prov)}</td>
    `;
    tbodyEl.appendChild(tr);
  }
}

// ===== Filtering (search box) =====
function applySearchFilter() {
  const q = (qInputEl?.value || "").trim().toLowerCase();

  if (!q) {
    shownRows = allProvinceRows.slice();
  } else {
    shownRows = allProvinceRows.filter((r) => rowToSearchText(r).includes(q));
  }

  renderRows(shownRows);
  setSubText(`Province: ${sessionProvince} • Showing ${shownRows.length} record(s)`);
}

// ===== Fetch failed list (province filtered) =====
async function fetchJsonSafe(url) {
  const res = await fetch(url);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Non-JSON response");
  }
  const data = await res.json();
  return { res, data };
}

async function loadFailedRegistrations() {
  clearMsgs();

  if (!sessionProvince) {
    showErr("No province in session. Please login again.");
    return;
  }

  setLoading(true);
  setSubText("Loading...");

  try {
    // ✅ Preferred: server-side filter
    // Endpoint expected: GET /api/failed-registrations?province=Cebu
    let data = null;

    try {
      const out = await fetchJsonSafe(
        API + "/api/failed-registrations?province=" + encodeURIComponent(sessionProvince)
      );
      data = out.data;
    } catch (_) {
      // Fallback: if you only have /api/failed-registrations returning all records
      const out2 = await fetchJsonSafe(API + "/api/failed-registrations");
      data = out2.data;
    }

    // Support different response shapes:
    // { success:true, records:[...] } OR { records:[...] } OR { success:true, data:[...] }
    const records =
      (data && Array.isArray(data.records) && data.records) ||
      (data && Array.isArray(data.data) && data.data) ||
      (Array.isArray(data) && data) ||
      [];

    // Always enforce province filter on client (extra safety)
    const filtered = records.filter((r) => normalize(r.province || r.Province) === sessionProvince);

    allProvinceRows = filtered;
    shownRows = filtered.slice();

    renderRows(shownRows);
    setSubText(`Province: ${sessionProvince} • Showing ${shownRows.length} record(s)`);
    showOk(`Loaded ${shownRows.length} record(s) for ${sessionProvince}.`);
  } catch (e) {
    console.error("loadFailedRegistrations error:", e);
    tbodyEl && (tbodyEl.innerHTML = `<tr><td colspan="6">Error loading data.</td></tr>`);
    setSubText(`Province: ${sessionProvince} • Error`);
    showErr("Server error while loading records.");
  } finally {
    setLoading(false);
  }
}

// ===== Events =====
refreshBtnEl && refreshBtnEl.addEventListener("click", loadFailedRegistrations);

qInputEl && qInputEl.addEventListener("input", applySearchFilter);

logoutLink &&
  logoutLink.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("email");
    localStorage.removeItem("role");
    localStorage.removeItem("sessionAt");
    localStorage.removeItem("position");
    localStorage.removeItem("province");
    location.replace("index.html");
  });

// Auto load
loadFailedRegistrations();
