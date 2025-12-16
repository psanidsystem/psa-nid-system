const API = location.origin;

let record = null;

// Elements
const userEmailEl = document.getElementById("userEmail");
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

// Helpers
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

// Init
if (userEmailEl) userEmailEl.textContent = localStorage.getItem("email") || "";

// Load status options
(async () => {
  try {
    const r = await fetch(API + "/api/status-options");
    const d = await r.json();
    if (!statusSelectEl) return;

    // keep first option
    const firstOpt = statusSelectEl.innerHTML;
    statusSelectEl.innerHTML = firstOpt;

    (d.statuses || []).forEach((s) => {
      statusSelectEl.innerHTML += `<option value="${s}">${s}</option>`;
    });
  } catch (e) {
    // silent fail (UI still usable)
    console.error("status-options error:", e);
  }
})();

// Search
async function doSearch() {
  hideMsgs();

  const trn = (trnInputEl?.value || "").replace(/\D/g, "");
  if (!/^\d{29}$/.test(trn)) {
    showErr("Invalid TRN. Must be 29 digits.");
    return;
  }

  searchBtnEl && (searchBtnEl.disabled = true);

  try {
    const r = await fetch(API + "/api/trn-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trn }),
    });

    const d = await r.json();
    if (!d.success) {
      showErr(d.message || "TRN search failed.");
      return;
    }

    record = d.record;
    if (detailWrapEl) detailWrapEl.style.display = "block";

    if (fullNameValEl) fullNameValEl.textContent = record.fullname || "—";
    if (permAddrValEl) permAddrValEl.textContent = record.permanentAddress || "—";
    if (recapStatusValEl) recapStatusValEl.textContent = record.recaptureStatus || "—";
    if (recapSchedValEl) recapSchedValEl.textContent = record.recaptureSchedule || "—";

    if (statusSelectEl && record.status) statusSelectEl.value = record.status;
    if (newTrnInputEl) newTrnInputEl.value = record.newTrn || "";
    if (dateRecapInputEl) dateRecapInputEl.value = record.isoDateRecapture || "";

    showOk("TRN found.");
  } catch (e) {
    console.error("trn-search error:", e);
    showErr("Server error while searching TRN.");
  } finally {
    searchBtnEl && (searchBtnEl.disabled = false);
  }
}

// Clear
function doClear() {
  hideMsgs();
  record = null;

  if (trnInputEl) trnInputEl.value = "";
  if (detailWrapEl) detailWrapEl.style.display = "none";

  if (fullNameValEl) fullNameValEl.textContent = "—";
  if (permAddrValEl) permAddrValEl.textContent = "—";
  if (recapStatusValEl) recapStatusValEl.textContent = "—";
  if (recapSchedValEl) recapSchedValEl.textContent = "—";

  if (statusSelectEl) statusSelectEl.value = "";
  if (newTrnInputEl) newTrnInputEl.value = "";
  if (dateRecapInputEl) dateRecapInputEl.value = "";
}

// Save
async function doSave() {
  hideMsgs();
  if (!record) {
    showErr("Please search a TRN first.");
    return;
  }

  const payload = {
    rowNumber: record.rowNumber,
    trn: record.trn,
    status: statusSelectEl?.value || "",
    newTrn: (newTrnInputEl?.value || "").replace(/\D/g, ""),
    dateOfRecapture: dateRecapInputEl?.value || "",
  };

  if (!payload.status) {
    showErr("Status is required.");
    return;
  }

  saveBtnEl && (saveBtnEl.disabled = true);

  try {
    const r = await fetch(API + "/api/trn-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const d = await r.json();
    if (!d.success) {
      showErr(d.message || "Save failed.");
      return;
    }

    showOk("Saved!");
  } catch (e) {
    console.error("trn-update error:", e);
    showErr("Server error while saving.");
  } finally {
    saveBtnEl && (saveBtnEl.disabled = false);
  }
}

// Wire events
searchBtnEl && searchBtnEl.addEventListener("click", doSearch);
clearBtnEl && clearBtnEl.addEventListener("click", doClear);
saveBtnEl && saveBtnEl.addEventListener("click", doSave);

// Optional: press Enter in TRN input to search
trnInputEl && trnInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    doSearch();
  }
});
