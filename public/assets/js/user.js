document.addEventListener("DOMContentLoaded", () => {
  const API = location.origin;

  // 🔒 Auth guard (User page)
  const email = localStorage.getItem("email");
  const role = (localStorage.getItem("role") || "").toLowerCase();
  if (!email || !role) {
    location.href = "index.html";
    return;
  }

  let record = null;

  // ===== Elements (Nav + Sections) =====
  const btnHome = document.getElementById("btnHome");
  const btnSearch = document.getElementById("btnSearch");

  const homeSection = document.getElementById("homeSection");
  const searchSection = document.getElementById("searchSection");

  // ===== Elements (TRN UI) =====
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

  // Save spinner/text (naa ni sa user.html)
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

  function setSearchLoading(isLoading) {
    if (!searchBtnEl) return;
    searchBtnEl.disabled = isLoading;
    searchBtnEl.textContent = isLoading ? "Searching..." : "Search";
  }

  function setSaveLoading(isLoading) {
    if (!saveBtnEl) return;
    saveBtnEl.disabled = isLoading;

    // if you prefer class-based spinner animation:
    saveBtnEl.classList.toggle("loading", isLoading);

    if (saveSpinnerEl) saveSpinnerEl.style.display = isLoading ? "inline-block" : "none";
    if (saveTextEl) saveTextEl.textContent = isLoading ? "Saving..." : "Save";
  }

  // ===== Navigation (Home/Search) =====
  function setActive(tab) {
    if (btnHome) btnHome.classList.toggle("active", tab === "home");
    if (btnSearch) btnSearch.classList.toggle("active", tab === "search");

    if (homeSection) homeSection.classList.toggle("active", tab === "home");
    if (searchSection) searchSection.classList.toggle("active", tab === "search");

    if (tab !== "search") hideMsgs();
  }

  btnHome && btnHome.addEventListener("click", () => setActive("home"));
  btnSearch && btnSearch.addEventListener("click", () => setActive("search"));

  // ===== Init =====
  if (userEmailEl) userEmailEl.textContent = email;
  setActive("home");

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

    const trn = (trnInputEl?.value || "").replace(/\D/g, "");
    if (!/^\d{29}$/.test(trn)) {
      showErr("Invalid TRN. Must be 29 digits.");
      return;
    }

    setSearchLoading(true);

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

      if (statusSelectEl) statusSelectEl.value = record.status || "";
      if (newTrnInputEl) newTrnInputEl.value = record.newTrn || "";
      if (dateRecapInputEl) dateRecapInputEl.value = record.isoDateRecapture || "";

      showOk("TRN found.");
      setActive("search");
    } catch (e) {
      console.error("trn-search error:", e);
      showErr("Server error while searching TRN.");
    } finally {
      setSearchLoading(false);
    }
  }

  // ===== Clear =====
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

  // ===== Save =====
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

    setSaveLoading(true);

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
      setSaveLoading(false);
    }
  }

  // ===== Wire events =====
  searchBtnEl && searchBtnEl.addEventListener("click", doSearch);
  clearBtnEl && clearBtnEl.addEventListener("click", doClear);
  saveBtnEl && saveBtnEl.addEventListener("click", doSave);

  // Press Enter to search
  trnInputEl && trnInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSearch();
    }
  });
});
