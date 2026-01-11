// ===== AUTH GUARD (User Page) =====
(() => {
  const email = localStorage.getItem("email");
  const role = localStorage.getItem("role");
  const sessionAt = Number(localStorage.getItem("sessionAt") || "0");

  // 30 minutes session
  const MAX_AGE_MS = 30 * 60 * 1000;

  if (!email || !role || !sessionAt || Date.now() - sessionAt > MAX_AGE_MS) {
    localStorage.removeItem("email");
    localStorage.removeItem("role");
    localStorage.removeItem("sessionAt");
    location.replace("index.html");
    return;
  }

  if (role !== "user") {
    location.replace("index.html");
    return;
  }
})();

const API = location.origin;

let record = null;

// ===== Elements (Header) =====
const userEmailEl = document.getElementById("userEmail");
const logoutLink = document.getElementById("logoutLink");

// ===== Elements (TRN UI) =====
const trnInputEl = document.getElementById("trnInput");
const searchBtnEl = document.getElementById("searchBtn");
const clearBtnEl = document.getElementById("clearBtn");

const msgOkEl = document.getElementById("msgOk");
const msgErrEl = document.getElementById("msgErr");

const detailWrapEl = document.getElementById("detailWrap");
const fullNameValEl = document.getElementById("fullNameVal");
const permAddrValEl = document.getElementById("permAddrVal");
const recapStatusValEl = document.getElementById("recapStatusVal");
const recapSchedValEl = document.getElementById("recapSchedVal");

const statusSelectEl = document.getElementById("statusSelect");
const newTrnInputEl = document.getElementById("newTrnInput");
const dateRecapInputEl = document.getElementById("dateRecapInput");
const saveBtnEl = document.getElementById("saveBtn");

// Spinners (optional)
const searchSpinnerEl = document.getElementById("searchSpinner");
const saveSpinnerEl = document.getElementById("saveSpinner");
const saveTextEl = document.getElementById("saveText");

// ===== Helpers =====
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

function hideMsgs() {
  if (msgOkEl) msgOkEl.style.display = "none";
  if (msgErrEl) msgErrEl.style.display = "none";
}

function setButtonLoading(btn, spinnerEl, isLoading) {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.classList.add("loading");
    if (spinnerEl) spinnerEl.style.display = "inline-block";
  } else {
    btn.disabled = false;
    btn.classList.remove("loading");
    if (spinnerEl) spinnerEl.style.display = "none";
  }
}

function resetDetails() {
  record = null;

  if (detailWrapEl) detailWrapEl.style.display = "none";

  if (fullNameValEl) fullNameValEl.textContent = "—";
  if (permAddrValEl) permAddrValEl.textContent = "—";
  if (recapStatusValEl) recapStatusValEl.textContent = "—";
  if (recapSchedValEl) recapSchedValEl.textContent = "—";

  if (statusSelectEl) statusSelectEl.value = "";
  if (newTrnInputEl) newTrnInputEl.value = "";
  if (dateRecapInputEl) dateRecapInputEl.value = "";

  if (saveBtnEl) saveBtnEl.disabled = true;
}

function digitsOnlyValue(v) {
  return (v || "").toString().replace(/\D/g, "");
}

function isValidTRN(trn) {
  return /^\d{29}$/.test(trn);
}

/**
 * HARD enforce digits-only:
 * - removes non-digits on input
 * - cleans paste
 * - blocks drop
 */
function enforceDigitsOnly(el, maxLen = 29) {
  if (!el) return;

  const sanitize = () => {
    el.value = digitsOnlyValue(el.value).slice(0, maxLen);
  };

  el.addEventListener("input", sanitize);
  el.addEventListener("paste", () => setTimeout(sanitize, 0));
  el.addEventListener("drop", (e) => e.preventDefault());
}

// ===== Init =====
if (userEmailEl) userEmailEl.textContent = localStorage.getItem("email") || "—";
resetDetails();

// Enforce numeric-only fields
enforceDigitsOnly(trnInputEl, 29);
enforceDigitsOnly(newTrnInputEl, 29);

// Enable/disable Search depending on TRN length
trnInputEl &&
  trnInputEl.addEventListener("input", () => {
    if (!searchBtnEl) return;
    searchBtnEl.disabled = trnInputEl.value.length !== 29;
  });

// Logout
logoutLink &&
  logoutLink.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("email");
    localStorage.removeItem("role");
    localStorage.removeItem("sessionAt");
    location.replace("index.html");
  });

// ===== Load status options =====
(async () => {
  try {
    const r = await fetch(API + "/api/status-options");
    const d = await r.json();
    if (!statusSelectEl) return;

    statusSelectEl.innerHTML = `<option value="">-- Select Status --</option>`;
    (d.statuses || []).forEach((s) => {
      statusSelectEl.innerHTML += `<option value="${s}">${s}</option>`;
    });
  } catch (e) {
    console.error("status-options error:", e);
  }
})();

// ===== Search =====
async function doSearch() {
  hideMsgs();
  resetDetails();

  const trn = trnInputEl?.value || "";

  if (!isValidTRN(trn)) {
    showErr("TRN must be exactly 29 numeric digits.");
    return;
  }

  setButtonLoading(searchBtnEl, searchSpinnerEl, true);

  try {
    const r = await fetch(API + "/api/trn-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trn }),
    });

    const d = await r.json();

    if (!d.success) {
      resetDetails();
      showErr(d.message || "TRN not found.");
      return;
    }

    record = d.record;

    if (detailWrapEl) detailWrapEl.style.display = "block";

    if (fullNameValEl) fullNameValEl.textContent = record.fullname || "—";
    if (permAddrValEl) permAddrValEl.textContent = record.permanentAddress || "—";
    if (recapStatusValEl) recapStatusValEl.textContent = record.recaptureStatus || "—";
    if (recapSchedValEl) recapSchedValEl.textContent = record.recaptureSchedule || "—";

    if (statusSelectEl) statusSelectEl.value = record.status || "";
    if (newTrnInputEl) newTrnInputEl.value = record.newTrn || "";
    if (dateRecapInputEl) dateRecapInputEl.value = record.isoDateRecapture || "";

    if (saveBtnEl) saveBtnEl.disabled = false;
    showOk("TRN found.");
  } catch (e) {
    console.error("trn-search error:", e);
    resetDetails();
    showErr("Server error while searching TRN.");
  } finally {
    setButtonLoading(searchBtnEl, searchSpinnerEl, false);
    // keep search disabled/enabled based on length
    if (searchBtnEl && trnInputEl) {
      searchBtnEl.disabled = trnInputEl.value.length !== 29;
    }
  }
}

// ===== Clear =====
function doClear() {
  hideMsgs();
  resetDetails();
  if (trnInputEl) trnInputEl.value = "";
  if (searchBtnEl) searchBtnEl.disabled = true;
}

// ===== Save =====
async function doSave() {
  hideMsgs();
  if (!record) return showErr("Please search a TRN first.");

  const payload = {
    rowNumber: record.rowNumber,
    trn: record.trn,
    status: statusSelectEl?.value || "",
    newTrn: digitsOnlyValue(newTrnInputEl?.value),
    dateOfRecapture: dateRecapInputEl?.value || "",
  };

  if (!payload.status) return showErr("Status is required.");
  if (payload.newTrn && !isValidTRN(payload.newTrn)) {
    return showErr("New TRN must be exactly 29 digits (or leave it blank).");
  }

  setButtonLoading(saveBtnEl, saveSpinnerEl, true);
  if (saveTextEl) saveTextEl.textContent = "Saving...";

  try {
    const r = await fetch(API + "/api/trn-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await r.json();
    if (!d.success) return showErr(d.message || "Save failed.");

    showOk("Saved!");
  } catch (e) {
    console.error("trn-update error:", e);
    showErr("Server error while saving.");
  } finally {
    setButtonLoading(saveBtnEl, saveSpinnerEl, false);
    if (saveTextEl) saveTextEl.textContent = "Save";
  }
}

// ===== Wire events =====
searchBtnEl && searchBtnEl.addEventListener("click", doSearch);
clearBtnEl && clearBtnEl.addEventListener("click", doClear);
saveBtnEl && saveBtnEl.addEventListener("click", doSave);

trnInputEl &&
  trnInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    }
  });
