const API = location.origin;

// ===== AUTH GUARD (Office Page) =====
(() => {
  const email = localStorage.getItem("email");
  const role = (localStorage.getItem("role") || "").toLowerCase();
  const sessionAt = Number(localStorage.getItem("sessionAt") || "0");
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

  // ✅ must be office role (admin optional if you want)
  if (role !== "office" && role !== "admin") {
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
let allProvinceRows = [];
let shownRows = [];

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
  if (subTextEl) subTextEl.textContent = text || "";
}
function normalize(v) {
  return (v || "").toString().trim();
}

function rowToSearchText(r) {
  const trn = normalize(r.trn || r.TRN);
  const fullname = normalize(r.fullname || r.fullName || r.Fullname);
  const contact = normalize(r.contactNo || r.contact || r.viber || r.mobile || r["Contact No."]);
  const email = normalize(r.email || r.emailAddress || r["Email Address"]);
  const addr = normalize(r.permanentAddress || r.address || r["Permanent Address"]);
  const prov = normalize(r.province || r.Province);

  return `${trn} ${fullname} ${contact} ${email} ${addr} ${prov}`.toLowerCase();
}

// Columns: TRN | Fullname | Contact | Email | Address | Province
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

function applySearchFilter() {
  const q = (qInputEl?.value || "").trim().toLowerCase();
  shownRows = !q ? allProvinceRows.slice() : allProvinceRows.filter(r => rowToSearchText(r).includes(q));
  renderRows(shownRows);
  setSubText(`Province: ${sessionProvince} • Showing ${shownRows.length} record(s)`);
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
    // ✅ Prefer server-side filtering if available
    let res = await fetch(API + "/api/failed-registrations?province=" + encodeURIComponent(sessionProvince));
    if (!res.ok) {
      // fallback: fetch all
      res = await fetch(API + "/api/failed-registrations");
    }
    const data = await res.json();

    const records =
      (data && Array.isArray(data.records) && data.records) ||
      (data && Array.isArray(data.data) && data.data) ||
      (Array.isArray(data) && data) ||
      [];

    // ✅ enforce province filter client-side (extra safety)
    allProvinceRows = records.filter(r => normalize(r.province || r.Province) === sessionProvince);
    shownRows = allProvinceRows.slice();

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

// Events
refreshBtnEl && refreshBtnEl.addEventListener("click", loadFailedRegistrations);
qInputEl && qInputEl.addEventListener("input", applySearchFilter);

logoutLink && logoutLink.addEventListener("click", (e) => {
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
