const API = "http://localhost:3000";

// ===== Elements =====
const btnHome = document.getElementById("btnHome");
const btnSearch = document.getElementById("btnSearch");
const homeSection = document.getElementById("homeSection");
const searchSection = document.getElementById("searchSection");

const userEmailEl = document.getElementById("userEmail");

const trnInput = document.getElementById("trnInput");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");

const msgOk = document.getElementById("msgOk");
const msgErr = document.getElementById("msgErr");

const detailWrap = document.getElementById("detailWrap");
const fullNameVal = document.getElementById("fullNameVal");
const permAddrVal = document.getElementById("permAddrVal");
const recapStatusVal = document.getElementById("recapStatusVal");
const recapSchedVal = document.getElementById("recapSchedVal");

const statusSelect = document.getElementById("statusSelect");
const newTrnInput = document.getElementById("newTrnInput");
const dateRecapInput = document.getElementById("dateRecapInput");

const saveBtn = document.getElementById("saveBtn");
const saveSpinner = document.getElementById("saveSpinner");
const saveText = document.getElementById("saveText");

// ===== State =====
let currentRecord = null; // { rowNumber, trn, ... }

// ===== Helpers =====
function showOk(text) {
  msgErr.style.display = "none";
  msgErr.textContent = "";
  msgOk.style.display = "block";
  msgOk.textContent = text || "";
}

function showErr(text) {
  msgOk.style.display = "none";
  msgOk.textContent = "";
  msgErr.style.display = "block";
  msgErr.textContent = text || "";
}

function clearMessages() {
  msgOk.style.display = "none";
  msgErr.style.display = "none";
  msgOk.textContent = "";
  msgErr.textContent = "";
}

function setButtonLoading(btn, isLoading, labelText) {
  // For our .btn styles + spinner inside saveBtn
  btn.disabled = !!isLoading;

  if (btn === saveBtn) {
    if (isLoading) {
      saveBtn.classList.add("loading");
      if (saveText) saveText.textContent = labelText || "Saving...";
    } else {
      saveBtn.classList.remove("loading");
      if (saveText) saveText.textContent = labelText || "Save";
    }
  } else {
    // Generic fallback for other buttons
    btn.textContent = isLoading ? (labelText || "Loading...") : (labelText || btn.textContent);
  }
}

function setSection(tab) {
  [btnHome, btnSearch].forEach((b) => b.classList.remove("active"));
  homeSection.classList.remove("active");
  searchSection.classList.remove("active");

  if (tab === "home") {
    btnHome.classList.add("active");
    homeSection.classList.add("active");
  } else {
    btnSearch.classList.add("active");
    searchSection.classList.add("active");
  }
}

function normalizeTRNInput() {
  // keep digits only, max 29
  const digits = String(trnInput.value || "").replace(/\D/g, "").slice(0, 29);
  trnInput.value = digits;
  return digits;
}

// ===== Load logged in email =====
(function initEmail() {
  const email = localStorage.getItem("email");
  if (email && userEmailEl) userEmailEl.textContent = email;
})();

// ===== Menu events =====
btnHome?.addEventListener("click", () => setSection("home"));
btnSearch?.addEventListener("click", () => setSection("search"));

// ===== Load Status dropdown from server =====
async function loadStatusOptions() {
  if (!statusSelect) return;

  statusSelect.innerHTML = `<option value="">-- Select Status --</option>`;

  try {
    const res = await fetch(API + "/api/status-options");
    const data = await res.json();

    if (!data.success) return;

    (data.statuses || []).forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      statusSelect.appendChild(opt);
    });
  } catch (e) {
    // if server down, keep default option only
  }
}

// ===== TRN Search =====
async function doSearch() {
  clearMessages();
  detailWrap.style.display = "none";
  currentRecord = null;

  const trn = normalizeTRNInput();

  if (!/^\d{29}$/.test(trn)) {
    showErr("Invalid TRN format. Must be exactly 29 digits.");
    return;
  }

  // disable buttons while searching
  searchBtn.disabled = true;
  clearBtn.disabled = true;
  searchBtn.textContent = "Searching...";

  try {
    const res = await fetch(API + "/api/trn-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trn }),
    });

    const data = await res.json();

    if (!data.success) {
      showErr(data.message || "TRN not found.");
      return;
    }

    currentRecord = data.record;

    // Display summary details
    fullNameVal.textContent = currentRecord.fullname || "—";
    permAddrVal.textContent = currentRecord.permanentAddress || "—";
    recapStatusVal.textContent = currentRecord.recaptureStatus || "—";
    recapSchedVal.textContent = currentRecord.recaptureSchedule || "—";

    // Fill editable fields
    if (statusSelect) statusSelect.value = currentRecord.status || "";
    if (newTrnInput) newTrnInput.value = currentRecord.newTrn || "";
    if (dateRecapInput) dateRecapInput.value = currentRecord.isoDateRecapture || "";

    detailWrap.style.display = "block";
    showOk("TRN found. You can now update the fields below.");

  } catch (e) {
    showErr("Server not reachable. Please make sure server.js is running (port 3000).");
  } finally {
    searchBtn.disabled = false;
    clearBtn.disabled = false;
    searchBtn.textContent = "Search";
  }
}

searchBtn?.addEventListener("click", doSearch);
trnInput?.addEventListener("input", normalizeTRNInput);
trnInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    doSearch();
  }
});

// ===== Clear =====
clearBtn?.addEventListener("click", () => {
  clearMessages();
  trnInput.value = "";
  detailWrap.style.display = "none";
  currentRecord = null;

  if (statusSelect) statusSelect.value = "";
  if (newTrnInput) newTrnInput.value = "";
  if (dateRecapInput) dateRecapInput.value = "";
});

// ===== Save Update =====
async function doSave() {
  clearMessages();

  if (!currentRecord) {
    showErr("Please search a TRN first.");
    return;
  }

  const status = String(statusSelect?.value || "").trim();
  const newTrn = String(newTrnInput?.value || "").replace(/\D/g, "").trim();
  const dateOfRecapture = String(dateRecapInput?.value || "").trim(); // YYYY-MM-DD

  // (Backend already validates required status and NEW TRN format if provided)
  // But we do light checks to help UX:
  if (!status) {
    showErr("Status is required before saving.");
    return;
  }
  if (newTrn && !/^\d{29}$/.test(newTrn)) {
    showErr("NEW TRN must be exactly 29 digits (or leave blank).");
    return;
  }

  // disable save button + show spinner
  setButtonLoading(saveBtn, true, "Saving...");

  try {
    const res = await fetch(API + "/api/trn-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rowNumber: currentRecord.rowNumber,
        trn: currentRecord.trn,
        status,
        newTrn,
        dateOfRecapture, // server formats to "Dec 25, 2025"
      }),
    });

    const data = await res.json();

    if (!data.success) {
      showErr(data.message || "Save failed.");
      return;
    }

    showOk("Saved successfully! (Updated in Google Sheet)");
  } catch (e) {
    showErr("Server not reachable while saving. Please try again.");
  } finally {
    // enable save button + hide spinner
    setButtonLoading(saveBtn, false, "Save");
  }
}

saveBtn?.addEventListener("click", doSave);

// ===== Init =====
document.addEventListener("DOMContentLoaded", async () => {
  await loadStatusOptions();
});
