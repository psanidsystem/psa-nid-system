const API = location.origin;

// ===== Session info =====
const sessionEmail = localStorage.getItem("email") || "";
const sessionRole = (localStorage.getItem("role") || "").toLowerCase();
const sessionProvince = (localStorage.getItem("province") || "").trim();

// ===== Elements =====
const userEmailEl = document.getElementById("userEmail");
const logoutBtnEl = document.getElementById("logoutBtn");

const provinceTitleEl = document.getElementById("provinceTitle");
const countTextEl = document.getElementById("countText");

const qInputEl = document.getElementById("qInput");
const refreshBtnEl = document.getElementById("refreshBtn");
const refreshSpinnerEl = document.getElementById("refreshSpinner");

const tbodyEl = document.getElementById("tbody");

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ===== Logout =====
function doLogout() {
  localStorage.removeItem("email");
  localStorage.removeItem("role");
  localStorage.removeItem("sessionAt");
  localStorage.removeItem("province");
  localStorage.removeItem("position");
  location.replace("index.html");
}

logoutBtnEl && logoutBtnEl.addEventListener("click", doLogout);

// ===== Show header info =====
if (userEmailEl) userEmailEl.textContent = sessionEmail || "—";

if (provinceTitleEl) {
  provinceTitleEl.textContent = sessionProvince ? `Province of ${sessionProvince}` : "Province of —";
}

// ===== Data cache =====
let allRows = [];

function setCount(n) {
  if (!countTextEl) return;
  countTextEl.textContent = `Showing ${n} record(s)`;
}

function renderRows(rows) {
  if (!tbodyEl) return;

  tbodyEl.innerHTML = "";

  if (!rows || rows.length === 0) {
    tbodyEl.innerHTML = `<tr><td colspan="6" class="muted">No records found.</td></tr>`;
    setCount(0);
    return;
  }

  setCount(rows.length);

  for (const r of rows) {
    const trn = escapeHtml(r.trn || "");
    const fullname = escapeHtml(r.fullname || "");
    const contactNo = escapeHtml(r.contactNo || "");
    const emailAddress = escapeHtml(r.emailAddress || "");
    const permanentAddress = escapeHtml(r.permanentAddress || "");
    const province = escapeHtml(r.province || "");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${trn}</td>
      <td>${fullname}</td>
      <td>${contactNo}</td>
      <td>${emailAddress}</td>
      <td>${permanentAddress}</td>
      <td>${province}</td>
    `;
    tbodyEl.appendChild(tr);
  }
}

function applySearch() {
  const q = (qInputEl?.value || "").trim().toLowerCase();
  if (!q) {
    renderRows(allRows);
    return;
  }

  const filtered = allRows.filter((r) => {
    const hay = [
      r.trn,
      r.fullname,
      r.contactNo,
      r.emailAddress,
      r.permanentAddress,
      r.province,
    ].join(" ").toLowerCase();

    return hay.includes(q);
  });

  renderRows(filtered);
}

// ===== Fetch from server =====
async function loadFailedRegistrations() {
  if (!sessionProvince) {
    if (tbodyEl) tbodyEl.innerHTML = `<tr><td colspan="6" class="muted">No province found in session. Please login again.</td></tr>`;
    setCount(0);
    return;
  }

  if (refreshBtnEl) refreshBtnEl.classList.add("loading");
  if (refreshBtnEl) refreshBtnEl.disabled = true;
  if (refreshSpinnerEl) refreshSpinnerEl.style.display = "inline-block";

  try {
    const url = API + "/api/failed-registrations?province=" + encodeURIComponent(sessionProvince);
    const r = await fetch(url);
    const d = await r.json();

    if (!d.success) {
      allRows = [];
      renderRows(allRows);
      return;
    }

    allRows = Array.isArray(d.records) ? d.records : [];
    applySearch();
  } catch (e) {
    console.error("loadFailedRegistrations error:", e);
    allRows = [];
    renderRows(allRows);
  } finally {
    if (refreshBtnEl) refreshBtnEl.classList.remove("loading");
    if (refreshBtnEl) refreshBtnEl.disabled = false;
    if (refreshSpinnerEl) refreshSpinnerEl.style.display = "none";
  }
}

// ===== Events =====
refreshBtnEl && refreshBtnEl.addEventListener("click", loadFailedRegistrations);
qInputEl && qInputEl.addEventListener("input", applySearch);

// ===== Guard fallback =====
if (sessionRole !== "office") {
  location.replace("user.html");
} else {
  loadFailedRegistrations();
}
