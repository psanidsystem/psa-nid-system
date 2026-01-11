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

// Left panel inputs (D-L)
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

// ===== Data cache =====
let allRows = [];
let selected = null;

function setCount(n) {
  if (!countTextEl) return;
  countTextEl.textContent = `Showing ${n} record(s)`;
}

function setSelected(rec) {
  selected = rec || null;

  if (selTrnEl) selTrnEl.textContent = selected?.trn || "—";
  if (selNameEl) selNameEl.textContent = selected?.fullname || "—";
  if (selContactEl) selContactEl.textContent = selected?.contactNo || "—";

  if (updateMsgEl) updateMsgEl.textContent = selected ? "Fill the fields then click Update." : "Select a row to update.";

  // clear inputs every select (optional)
  if (presentAddressEl) presentAddressEl.value = "";
  if (provincePresentEl) provincePresentEl.value = "";
  if (dateContactedEl) dateContactedEl.value = "";
  if (meansOfNotificationEl) meansOfNotificationEl.value = "";
  if (recaptureStatusEl) recaptureStatusEl.value = "";
  if (recaptureScheduleEl) recaptureScheduleEl.value = "";
  if (provinceRegistrationEl) provinceRegistrationEl.value = "";
  if (cityMunicipalityEl) cityMunicipalityEl.value = "";
  if (registrationCenterEl) registrationCenterEl.value = "";
}

function renderRows(rows) {
  if (!tbodyEl) return;

  tbodyEl.innerHTML = "";

  if (!rows || rows.length === 0) {
    tbodyEl.innerHTML = `<tr><td colspan="3" class="muted">No records found.</td></tr>`;
    setCount(0);
    setSelected(null);
    return;
  }

  setCount(rows.length);

  for (const r of rows) {
    const trn = escapeHtml(r.trn || "");
    const fullname = escapeHtml(r.fullname || "");
    const province = escapeHtml(r.province || "");

    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.style.cursor = "pointer";
    tr.title = "Click to select";

    tr.innerHTML = `
      <td>${trn}</td>
      <td>${fullname}</td>
      <td>${province}</td>
    `;

    tr.addEventListener("click", () => {
      [...tbodyEl.querySelectorAll("tr")].forEach(x => x.style.background = "");
      tr.style.background = "#eef5ff";
      setSelected(r);
    });

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
    const hay = [r.trn, r.fullname, r.province].join(" ").toLowerCase();
    return hay.includes(q);
  });

  renderRows(filtered);
}

// ===== Fetch list =====
async function loadFailedRegistrations() {
  if (!sessionProvince) {
    if (tbodyEl) tbodyEl.innerHTML = `<tr><td colspan="3" class="muted">No province found in session. Please login again.</td></tr>`;
    setCount(0);
    setSelected(null);
    return;
  }

  if (refreshBtnEl) refreshBtnEl.disabled = true;
  if (refreshSpinnerEl) refreshSpinnerEl.style.display = "inline-block";

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
    console.error("loadFailedRegistrations error:", e);
    allRows = [];
    renderRows(allRows);
  } finally {
    if (refreshBtnEl) refreshBtnEl.disabled = false;
    if (refreshSpinnerEl) refreshSpinnerEl.style.display = "none";
  }
}

// ===== Submit Update (writes D–L) =====
async function submitUpdate() {
  if (!selected?.rowNumber) {
    if (updateMsgEl) updateMsgEl.textContent = "Please select a record first.";
    return;
  }

  const payload = {
    rowNumber: selected.rowNumber,
    presentAddress: presentAddressEl?.value || "",
    provincePresent: provincePresentEl?.value || "",
    dateContacted: dateContactedEl?.value || "",
    meansOfNotification: meansOfNotificationEl?.value || "",
    recaptureStatus: recaptureStatusEl?.value || "",
    recaptureSchedule: recaptureScheduleEl?.value || "",
    provinceRegistration: provinceRegistrationEl?.value || "",
    cityMunicipality: cityMunicipalityEl?.value || "",
    registrationCenter: registrationCenterEl?.value || "",
  };

  if (updateBtnEl) updateBtnEl.disabled = true;
  if (updateMsgEl) updateMsgEl.textContent = "Updating...";

  try {
    const r = await fetch(API + "/api/failed-registration-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await r.json();
    if (!d || !d.success) {
      if (updateMsgEl) updateMsgEl.textContent = d?.message || "Update failed.";
      return;
    }

    if (updateMsgEl) updateMsgEl.textContent = "✅ Updated successfully!";
    await loadFailedRegistrations();
  } catch (e) {
    console.error("submitUpdate error:", e);
    if (updateMsgEl) updateMsgEl.textContent = "Network/server error while updating.";
  } finally {
    if (updateBtnEl) updateBtnEl.disabled = false;
  }
}

// ===== Events =====
refreshBtnEl && refreshBtnEl.addEventListener("click", loadFailedRegistrations);
qInputEl && qInputEl.addEventListener("input", applySearch);
updateBtnEl && updateBtnEl.addEventListener("click", submitUpdate);

// ===== Guard =====
if (sessionRole !== "office") {
  location.replace("user.html");
} else {
  loadFailedRegistrations();
}
