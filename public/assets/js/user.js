document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ user.js loaded"); // <- makita ni sa Console

  const API = location.origin;
  let record = null;

  // Nav buttons
  const btnHome = document.getElementById("btnHome");
  const btnSearch = document.getElementById("btnSearch");

  // Sections
  const homeSection = document.getElementById("homeSection");
  const searchSection = document.getElementById("searchSection");

  // TRN UI
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

  // Quick sanity (para maklaro kung missing IDs)
  if (!btnHome || !btnSearch || !homeSection || !searchSection) {
    console.error("❌ Missing nav/sections IDs. Check btnHome/btnSearch/homeSection/searchSection in user.html");
    return;
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
  function hideMsgs() {
    if (msgOkEl) msgOkEl.style.display = "none";
    if (msgErrEl) msgErrEl.style.display = "none";
  }

  function setActive(tab) {
    btnHome.classList.toggle("active", tab === "home");
    btnSearch.classList.toggle("active", tab === "search");

    homeSection.classList.toggle("active", tab === "home");
    searchSection.classList.toggle("active", tab === "search");
  }

  // Wire nav clicks
  btnHome.addEventListener("click", () => setActive("home"));
  btnSearch.addEventListener("click", () => setActive("search"));

  // Init
  if (userEmailEl) userEmailEl.textContent = localStorage.getItem("email") || "";
  setActive("home");

  // Load status dropdown
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

    if (searchBtnEl) searchBtnEl.disabled = true;

    try {
      const r = await fetch(API + "/api/trn-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trn }),
      });
      const d = await r.json();
      if (!d.success) return showErr(d.message || "TRN search failed.");

      record = d.record;

      if (detailWrapEl) detailWrapEl.style.display = "block";
      if (fullNameValEl) fullNameValEl.textContent = record.fullname || "—";
      if (permAddrValEl) permAddrValEl.textContent = record.permanentAddress || "—";
      if (recapStatusValEl) recapStatusValEl.textContent = record.recaptureStatus || "—";
      if (recapSchedValEl) recapSchedValEl.textContent = record.recaptureSchedule || "—";

      if (statusSelectEl) statusSelectEl.value = record.status || "";
      if (newTrnInputEl) newTrnInputEl.value = record.newTrn || "";
      if (dateRecapInputEl) dateRecapInputEl.value = record.isoDateRecapture || "";

      showOk("TRN found.");
    } catch (e) {
      console.error("trn-search error:", e);
      showErr("Server error while searching TRN.");
    } finally {
      if (searchBtnEl) searchBtnEl.disabled = false;
    }
  }

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

  async function doSave() {
    hideMsgs();
    if (!record) return showErr("Please search a TRN first.");
    if (!statusSelectEl?.value) return showErr("Status is required.");

    const payload = {
      rowNumber: record.rowNumber,
      trn: record.trn,
      status: statusSelectEl.value,
      newTrn: (newTrnInputEl?.value || "").replace(/\D/g, ""),
      dateOfRecapture: dateRecapInputEl?.value || "",
    };

    if (saveBtnEl) saveBtnEl.disabled = true;

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
      if (saveBtnEl) saveBtnEl.disabled = false;
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
});
