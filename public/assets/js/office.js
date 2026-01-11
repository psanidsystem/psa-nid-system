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

const tbodyEl = document.getElementById("tbody");
const updatePanelEl = document.getElementById("updatePanel");

// Left panel elements
const selTrnEl = document.getElementById("selTrn");
const selNameEl = document.getElementById("selName");
const selContactEl = document.getElementById("selContact");
const updatedBadgeEl = document.getElementById("updatedBadge");

const presentAddressEl = document.getElementById("presentAddress");      // read-only display (still editable if you want)
const provincePresentEl = document.getElementById("provincePresent");    // read-only display (still editable if you want)
const dateContactedEl = document.getElementById("dateContacted");
const meansEl = document.getElementById("meansOfNotification");
const recaptureStatusEl = document.getElementById("recaptureStatus");
const recaptureScheduleEl = document.getElementById("recaptureSchedule");
const provinceRegEl = document.getElementById("provinceRegistration");
const cityMunEl = document.getElementById("cityMunicipality");
const regCenterEl = document.getElementById("registrationCenter");
const saveBtnEl = document.getElementById("saveBtn");

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

// ===== Header info =====
if (userEmailEl) userEmailEl.textContent = sessionEmail || "—";
if (provinceTitleEl) provinceTitleEl.textContent = sessionProvince ? `Province of ${sessionProvince}` : "Province of —";

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setCount(n) {
  if (!countTextEl) return;
  countTextEl.textContent = `Showing ${n} record(s)`;
}

// ===== Cache =====
let allRows = [];
let selectedRowNumber = null;

// highlight helpers
function clearRowHighlights() {
  if (!tbodyEl) return;
  tbodyEl.querySelectorAll("tr").forEach((tr) => tr.classList.remove("row-selected"));
}
function highlightRow(rowNumber) {
  if (!tbodyEl) return;
  clearRowHighlights();
  const tr = tbodyEl.querySelector(`tr[data-row-number="${rowNumber}"]`);
  tr && tr.classList.add("row-selected");
}
function scrollToUpdatePanel() {
  if (!updatePanelEl) return;
  updatePanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===== Dropdown loaders =====
async function loadMeansDropdown() {
  if (!meansEl) return;
  meansEl.innerHTML = `<option value="">Select Means...</option>`;
  try {
    const r = await fetch(API + "/api/means-notification");
    const d = await r.json();
    if (!d.success) return;

    for (const item of d.items || []) {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      meansEl.appendChild(opt);
    }
  } catch (e) {
    console.error("loadMeansDropdown error:", e);
  }
}

async function loadRecaptureStatusDropdown() {
  if (!recaptureStatusEl) return;
  recaptureStatusEl.innerHTML = `<option value="">Select Status...</option>`;
  try {
    const r = await fetch(API + "/api/recapture-status-options");
    const d = await r.json();
    if (!d.success) return;

    for (const item of d.items || []) {
      const opt = document.createElement("option");
      opt.value = item;
      opt.textContent = item;
      recaptureStatusEl.appendChild(opt);
    }
  } catch (e) {
    console.error("loadRecaptureStatusDropdown error:", e);
  }
}

// ===== Date helpers =====
function toISODate(val) {
  const s = String(val || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
}

function isoToMMDDYYYY(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [yyyy, mm, dd] = s.split("-");
  return `${mm}/${dd}/${yyyy}`;
}

function setMinToday(inputEl) {
  if (!inputEl) return;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  inputEl.min = `${yyyy}-${mm}-${dd}`;
}
setMinToday(dateContactedEl);
setMinToday(recaptureScheduleEl);

// ===== Render table (NO action column) =====
function renderRows(rows) {
  if (!tbodyEl) return;
  tbodyEl.innerHTML = "";

  if (!rows || rows.length === 0) {
    tbodyEl.innerHTML = `<tr><td colspan="4" class="muted">No records found.</td></tr>`;
    setCount(0);
    return;
  }

  setCount(rows.length);

  for (const r of rows) {
    const trn = escapeHtml(r.trn || "");
    const fullname = escapeHtml(r.fullname || "");
    const contactNo = escapeHtml(r.contactNo || "");

    const updatedTag = r.updated
      ? `<span class="tag tag-updated">✅ Updated</span>`
      : `<span class="tag tag-new">—</span>`;

    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.dataset.rowNumber = String(r.rowNumber);

    tr.innerHTML = `
      <td>${trn}</td>
      <td>${fullname}</td>
      <td>${contactNo}</td>
      <td>${updatedTag}</td>
    `;

    tr.addEventListener("click", () => selectRow(r.rowNumber, true));

    if (selectedRowNumber && Number(selectedRowNumber) === Number(r.rowNumber)) {
      tr.classList.add("row-selected");
    }

    tbodyEl.appendChild(tr);
  }
}

function applySearch() {
  const q = (qInputEl?.value || "").trim().toLowerCase();
  if (!q) return renderRows(allRows);

  const filtered = allRows.filter((r) => {
    const hay = [
      r.trn,
      r.fullname,
      r.contactNo,
      r.province,
      r.updated ? "updated" : "",
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  renderRows(filtered);
}

// ===== Fetch list =====
async function loadFailedRegistrations() {
  if (!sessionProvince) {
    if (tbodyEl) tbodyEl.innerHTML = `<tr><td colspan="4" class="muted">No province found in session. Please login again.</td></tr>`;
    setCount(0);
    return;
  }

  refreshBtnEl && (refreshBtnEl.disabled = true);

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

    if (selectedRowNumber) highlightRow(selectedRowNumber);
  } catch (e) {
    console.error("loadFailedRegistrations error:", e);
    allRows = [];
    renderRows(allRows);
  } finally {
    refreshBtnEl && (refreshBtnEl.disabled = false);
  }
}

// ===== Select row => load details + highlight + scroll =====
async function selectRow(rowNumber, shouldScroll = false) {
  selectedRowNumber = rowNumber;
  highlightRow(rowNumber);
  if (shouldScroll) scrollToUpdatePanel();

  try {
    const r = await fetch(API + "/api/failed-registration-row?rowNumber=" + encodeURIComponent(rowNumber));
    const d = await r.json();
    if (!d.success) return;

    const x = d.data || {};

    selTrnEl && (selTrnEl.textContent = x.trn || "—");
    selNameEl && (selNameEl.textContent = x.fullname || "—");
    selContactEl && (selContactEl.textContent = x.contactNo || "—");

    // show these as existing values (editable if you want)
    presentAddressEl && (presentAddressEl.value = x.presentAddress || "");
    provincePresentEl && (provincePresentEl.value = x.provincePresent || "");

    dateContactedEl && (dateContactedEl.value = toISODate(x.dateContacted || ""));
    meansEl && (meansEl.value = x.meansOfNotification || "");
    recaptureStatusEl && (recaptureStatusEl.value = x.recaptureStatus || "");
    recaptureScheduleEl && (recaptureScheduleEl.value = toISODate(x.recaptureSchedule || ""));
    provinceRegEl && (provinceRegEl.value = x.provinceRegistration || "");
    cityMunEl && (cityMunEl.value = x.cityMunicipality || "");
    regCenterEl && (regCenterEl.value = x.registrationCenter || "");

    // ✅ updated-before badge based on J–P
    if (updatedBadgeEl) updatedBadgeEl.style.display = x.updated ? "flex" : "none";
  } catch (e) {
    console.error("selectRow error:", e);
  }
}

// ===== Save update (updates J–P only) =====
async function saveUpdate() {
  if (!selectedRowNumber) {
    alert("Please select a record first.");
    return;
  }

  const payload = {
    rowNumber: selectedRowNumber,
    dateContacted: isoToMMDDYYYY(dateContactedEl?.value || ""),
    meansOfNotification: meansEl?.value || "",
    recaptureStatus: recaptureStatusEl?.value || "",
    recaptureSchedule: isoToMMDDYYYY(recaptureScheduleEl?.value || ""),
    provinceRegistration: provinceRegEl?.value || "",
    cityMunicipality: cityMunEl?.value || "",
    registrationCenter: regCenterEl?.value || "",
  };

  // ✅ require at least 1 field so dili mo mark updated kung wala gi input
  const anyInput = Object.entries(payload)
    .filter(([k]) => k !== "rowNumber")
    .some(([, v]) => String(v || "").trim());
  if (!anyInput) {
    alert("Wala kay gi input. Please fill at least one field before saving.");
    return;
  }

  try {
    saveBtnEl && (saveBtnEl.disabled = true);
    saveBtnEl && (saveBtnEl.textContent = "Saving...");

    const r = await fetch(API + "/api/failed-registration-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await r.json();
    if (!d.success) {
      alert(d.message || "Update failed.");
      return;
    }

    updatedBadgeEl && (updatedBadgeEl.style.display = "flex");

    await loadFailedRegistrations();
    selectedRowNumber && highlightRow(selectedRowNumber);

    alert("✅ Updated successfully!");
  } catch (e) {
    console.error("saveUpdate error:", e);
    alert("Server error while updating.");
  } finally {
    saveBtnEl && (saveBtnEl.disabled = false);
    saveBtnEl && (saveBtnEl.textContent = "Save Update");
  }
}

// ===== Events =====
refreshBtnEl && refreshBtnEl.addEventListener("click", loadFailedRegistrations);
qInputEl && qInputEl.addEventListener("input", applySearch);
saveBtnEl && saveBtnEl.addEventListener("click", saveUpdate);

// ===== Guard =====
if (sessionRole !== "office") {
  location.replace("user.html");
} else {
  Promise.all([loadMeansDropdown(), loadRecaptureStatusDropdown()])
    .then(loadFailedRegistrations)
    .catch(loadFailedRegistrations);
}
