const API =
  location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://psa-nid-system.onrender.com";

let record = null;

document.getElementById("userEmail").textContent =
  localStorage.getItem("email") || "";

// Status dropdown
(async () => {
  const r = await fetch(API + "/api/status-options");
  const d = await r.json();
  const sel = document.getElementById("statusSelect");
  (d.statuses || []).forEach(s => {
    sel.innerHTML += `<option>${s}</option>`;
  });
})();

// Search
document.getElementById("searchBtn").onclick = async () => {
  const trn = trnInput.value.replace(/\D/g, "");
  if (!/^\d{29}$/.test(trn)) return alert("Invalid TRN");

  const r = await fetch(API + "/api/trn-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trn }),
  });
  const d = await r.json();
  if (!d.success) return alert(d.message);

  record = d.record;
  detailWrap.style.display = "block";
  fullNameVal.textContent = record.fullname;
  permAddrVal.textContent = record.permanentAddress;
  recapStatusVal.textContent = record.recaptureStatus;
  recapSchedVal.textContent = record.recaptureSchedule;
};

// Save
document.getElementById("saveBtn").onclick = async () => {
  if (!record) return;

  const r = await fetch(API + "/api/trn-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rowNumber: record.rowNumber,
      trn: record.trn,
      status: statusSelect.value,
      newTrn: newTrnInput.value.replace(/\D/g, ""),
      dateOfRecapture: dateRecapInput.value,
    }),
  });
  const d = await r.json();
  alert(d.success ? "Saved!" : d.message);
};
