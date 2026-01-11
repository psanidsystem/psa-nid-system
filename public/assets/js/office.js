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

// Left panel (readonly)
const selTrnEl = document.getElementById("selTrn");
const selNameEl = document.getElementById("selName");
const selContactEl = document.getElementById("selContact");

// Left panel inputs
const presentAddressEl = document.getElementById("presentAddress");
const provincePresentEl = document.getElementById("provincePresent");
const dateContactedEl = document.getElementById("dateContacted");
const meansOfNotificationEl = document.getElementById("meansOfNotification");
const recaptureStatusEl = document.getElementById("recaptureStatus");
const recaptureScheduleEl = document.getElementById("recaptureSchedule");
const provinceRegistrationEl = document.getElementById("provinceRegistration");
const cityMunicipalityEl = document.getElementById("cityMunicipality");
const registrationCenterEl = document.getElementById("registrationCenter");

const updateBtnEl = document.getElementById("updateBtn");
const updateMsgEl = document.getElementById("updateMsg");

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function setNoBackdate() {
  const min = todayISO();
  if (dateContactedEl) dateContactedEl.min = min;
  if (recaptureScheduleEl) recaptureScheduleEl.min = min;
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

// ===== Header info =====
if (userEmailEl) userEmailEl.textContent = sessionEmail || "—";
if (provinceTitleEl) provinceTitleEl.textContent = sessionProvince ? `Province of ${sessionProvince}` : "Province of —";

setNoBackdate();

// ===== Data cache =====
let allRows = [];
let selected = null;

function setCount(n) {
  if (!countTextEl) return;
  countTextEl.textContent = `Showing ${n} record(s)`;
}

function fillSelect(selectEl, items, placeholder) {
  if (!selectEl) return;
  selectEl.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  selectEl.appendChild(opt0);

  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it;
    opt.textContent = it;
    selectEl.appendChild(opt);
  }
}

async function loadDropdowns() {
  try {
    const [a, b] = await Promise.all([
      fetch(API + "/api/means-notification").then(r => r.json()),
      fetch(API + "/api/recapture-status-options").then(r => r.json()),
    ]);

    fillSelect(meansOfNotificationEl, (a?.items || []), "Select Means...");
    fillSelect(recaptureStatusEl, (b?.items || []), "Select Status...");
  } catch (e) {
    console.error("loadDropdowns error:", e);
  }
}

function setSelectedBasic(rec) {
  selected = rec || null;

  if (selTrnEl) selTrnEl.textContent = selected?.trn || "—";
  if (selNameEl) selNameEl.textContent = selected?.fullname || "—";
  if (selContactEl) selContactEl.textContent = selected?.contactNo || "—";

  if (updateMsgEl) updateMsgEl.textContent = selected ? "Loading existing data..." : "Select a row to update.";
}

async function autofillUpdatePanel(rowNumber) {
  if (!rowNumber) return;

  try {
    const r = await fetch(API + "/api/failed-registration-row?rowNumber=" + encodeURIComponent(rowNumber));
    const d = await r.json();

    if (!d || !d.success || !d.data) {
      if (updateMsgEl) updateMsgEl.textContent = "Failed to load existing values.";
      return;
    }

    const x = d.data;

    // ✅ Autofill but editable
    if (presentAddressEl) presentAddressEl.value = x.presentAddress || "";
    if (provincePresentEl) provincePresentEl.value = x.provincePresent || "";

    // If sheet stores MM/DD/YYYY, date input wants YYYY-MM-DD
    // We'll attempt conversion, else keep empty
    if (dateContactedEl) dateContactedEl.value = toISODate(x.dateContacted);
    if (recaptureScheduleEl) recaptureScheduleEl.value = toISODate(x.recaptureSchedule);

    if (meansOfNotificationEl) meansOfNotificationEl.value = x.meansOfNotification || "";
    if (recaptureStatusEl) recaptureStatusEl.value = x.recaptureStatus || "";

    if (provinceRegistrationEl) provinceRegistrationEl.value = x.provinceRegistration || "";
    if (cityMunicipalityEl) cityMunicipalityEl.value = x.cityMunicipality || "";
    if (registrationCenterEl) registrationCenterEl.value = x.registrationCenter || "";

    if (updateMsgEl) updateMsgEl.textContent = "Edit fields then click Update.";
  } catch (e) {
    console.error("autofillUpdatePanel error:", e);
    if (updateMsgEl) updateMsgEl.textContent = "Error loading existing values.";
  }
}

function toISODate(val) {
  const s = String(val || "").trim();
  if (!s) return "";

  // if already ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // try MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function fromISOToMMDDYYYY(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [yyyy, mm, dd] = s.split("-");
  return `${mm}/${dd}/${yyyy}`;
}

function renderRows(rows) {
  if (!tbodyEl) return;
  tbodyEl.innerHTML = "";

  if (!rows || rows.length === 0) {
    tbodyEl.innerHTML = `<tr><td colspan="3" class="muted">No records found.</td></tr>`;
    setCount(0);
    setSelectedBasic(null);
    return;
  }

  setCount(rows.length);

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.style.cursor = "pointer";

    tr.innerHTML = `
      <td class="col-trn">${escapeHtml(r.trn)}</td>
      <td class="col-name">${escapeHtml(r.fullname)}</td>
      <td class="col-contact">${escapeHtml(r.contactNo)}</td>
    `;

    tr.addEventListener("click", async () => {
      [...tbodyEl.querySelectorAll("tr")].forEach(x => x.style.background = "");
      tr.style.background = "#eef5ff";

      setSelectedBasic(r);
      await autofillUpdatePanel(r.rowNumber);
    });

    tbodyEl.appendChild(tr);
  }
}

function applySearch() {
  const q = (qInputEl?.value || "").trim().toLowerCase();
  if (!q) return renderRows(allRows);

  const filtered = allRows.filter((r) => {
    const hay = [r.trn, r.fullname, r.contactNo, r.province].join(" ").toLowerCase();
    return hay.includes(q);
  });

  renderRows(filtered);
}

async function loadFailedRegistrations() {
  if (!sessionProvince) {
    tbodyEl.innerHTML = `<tr><td colspan="3" class="muted">No province found in session. Please login again.</td></tr>`;
    setCount(0);
    setSelectedBasic(null);
    return;
  }

  refreshBtnEl.disabled = true;
  refreshSpinnerEl.style.display = "inline-block";

  try {
    const url = API + "/api/failed-registrations?province=" + encodeURIComponent(sessionProvince);
    const r = await fetch(url);
    const d = await r.json();

    if (!d || !d.success) {
      allRows = [];
      renderRows(allRows);
      return;
    }

    allRows = Array.isArray(d.records) ? d.records : [];
    applySearch();
  } catch (e) {
    console.error(e);
    allRows = [];
    renderRows(allRows);
  } finally {
    refreshBtnEl.disabled = false;
    refreshSpinnerEl.style.display = "none";
  }
}

async function submitUpdate() {
  if (!selected?.rowNumber) {
    updateMsgEl.textContent = "Please select a record first.";
    return;
  }

  // enforce no backdate (in case user manually types)
  const min = todayISO();
  if (dateContactedEl.value && dateContactedEl.value < min) {
    updateMsgEl.textContent = "Date Contacted cannot be backdate.";
    return;
  }
  if (recaptureScheduleEl.value && recaptureScheduleEl.value < min) {
    updateMsgEl.textContent = "Recapture Schedule cannot be backdate.";
    return;
  }

  const payload = {
    rowNumber: selected.rowNumber,
    presentAddress: presentAddressEl.value || "",
    provincePresent: provincePresentEl.value || "",
    dateContacted: fromISOToMMDDYYYY(dateContactedEl.value || ""),
    meansOfNotification: meansOfNotificationEl.value || "",
    recaptureStatus: recaptureStatusEl.value || "",
    recaptureSchedule: fromISOToMMDDYYYY(recaptureScheduleEl.value || ""),
    provinceRegistration: provinceRegistrationEl.value || "",
    cityMunicipality: cityMunicipalityEl.value || "",
    registrationCenter: registrationCenterEl.value || "",
  };

  updateBtnEl.disabled = true;
  updateMsgEl.textContent = "Updating...";

  try {
    const r = await fetch(API + "/api/failed-registration-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await r.json();
    if (!d || !d.success) {
      updateMsgEl.textContent = d?.message || "Update failed.";
      return;
    }

    updateMsgEl.textContent = "✅ Updated successfully!";
    await loadFailedRegistrations();
  } catch (e) {
    console.error(e);
    updateMsgEl.textContent = "Network/server error.";
  } finally {
    updateBtnEl.disabled = false;
  }
}

// ===== Events =====
refreshBtnEl.addEventListener("click", loadFailedRegistrations);
qInputEl.addEventListener("input", applySearch);
updateBtnEl.addEventListener("click", submitUpdate);

// ===== Guard =====
if (sessionRole !== "office") {
  location.replace("user.html");
} else {
  loadDropdowns().then(loadFailedRegistrations);
}
