const API = location.origin;

let record = null;

const btnHome = document.getElementById("btnHome");
const btnSearch = document.getElementById("btnSearch");
const homeSection = document.getElementById("homeSection");
const searchSection = document.getElementById("searchSection");

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

function setActive(tab) {
  btnHome && btnHome.classList.toggle("active", tab === "home");
  btnSearch && btnSearch.classList.toggle("active", tab === "search");
  homeSection && homeSection.classList.toggle("active", tab === "home");
  searchSection && searchSection.classList.toggle("active", tab === "search");
  if (tab !== "search") hideMsgs();
}

btnHome && btnHome.addEventListener("click", () => setActive("home"));
btnSearch && btnSearch.addEventListener("click", () => setActive("search"));

if (userEmailEl) userEmailEl.textContent = localStorage.getItem("email") || "";
setActive("home");

// Load status options
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

async function doSearch() {
  hideMsgs();

  const trn = (trnInputEl?.value || "").replace(/\D/g, "");
  if (!/^\d{29}$/.test(trn)) return showErr("Invalid TRN. Must be 29 digits.");

  searchBtnEl && (searchBtnEl.disabled = true);

  try {
    const r = await fetch(API + "/api/trn-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trn }),
    });

    const d = await r.json();
    if (!d.success) return showErr(d.message || "TRN search failed.");

    record = d.record;

    detailWrapEl && (detailWrapEl.style.display = "block");
    fullNameValEl && (fullNameValEl.textContent = record.fullname || "—");
    permAddrValEl && (permAddrValEl.textContent = record.permanentAddress || "—");
    recapStatusValEl && (recapStatusValEl.textContent = record.recaptureStatus || "—");
    recapSchedValEl && (recapSchedValEl.textContent = record.recaptureSchedule || "—");

    statusSelectEl && (statusSelectEl.value = record.status || "");
    newTrnInputEl && (newTrnInputEl.value = record.newTrn || "");
    dateRecapInputEl && (dateRecapInputEl.value = record.isoDateRecapture || "");

    showOk("TRN found.");
  } catch (e) {
    console.error("trn-search error:", e);
    showErr("Server error while searching TRN.");
  } finally {
    searchBtnEl && (searchBtnEl.disabled = false);
  }
}

function doClear() {
  hideMsgs();
  record = null;

  trnInputEl && (trnInputEl.value = "");
  detailWrapEl && (detailWrapEl.style.display = "none");

  fullNameValEl && (fullNameValEl.textContent = "—");
  permAddrValEl && (permAddrValEl.textContent = "—");
  recapStatusValEl && (recapStatusValEl.textContent = "—");
  recapSchedValEl && (recapSchedValEl.textContent = "—");

  statusSelectEl && (statusSelectEl.value = "");
  newTrnInputEl && (newTrnInputEl.value = "");
  dateRecapInputEl && (dateRecapInputEl.value = "");
}

async function doSave() {
  hideMsgs();
  if (!record) return showErr("Please search a TRN first.");

  const payload = {
    rowNumber: record.rowNumber,
    trn: record.trn,
    status: statusSelectEl?.value || "",
    newTrn: (newTrnInputEl?.value || "").replace(/\D/g, ""),
    dateOfRecapture: dateRecapInputEl?.value || "",
  };

  if (!payload.status) return showErr("Status is required.");

  saveBtnEl && (saveBtnEl.disabled = true);

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
    saveBtnEl && (saveBtnEl.disabled = false);
  }
}

searchBtnEl && searchBtnEl.addEventListener("click", doSearch);
clearBtnEl && clearBtnEl.addEventListener("click", doClear);
saveBtnEl && saveBtnEl.addEventListener("click", doSave);

trnInputEl && trnInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    doSearch();
  }
});
