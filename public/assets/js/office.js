const API = location.origin;

// ===== AUTH GUARD =====
(() => {
  const email = localStorage.getItem("email");
  const role = (localStorage.getItem("role") || "").toLowerCase();
  const sessionAt = Number(localStorage.getItem("sessionAt") || "0");
  const province = (localStorage.getItem("province") || "").trim();

  const MAX_AGE = 30 * 60 * 1000;

  if (!email || !role || !sessionAt || Date.now() - sessionAt > MAX_AGE) {
    localStorage.clear();
    location.replace("index.html");
    return;
  }

  if (role !== "office" && role !== "admin") {
    location.replace("user.html");
    return;
  }

  if (!province) {
    location.replace("index.html");
    return;
  }
})();

// ===== ELEMENTS =====
const userEmailEl = document.getElementById("userEmail");
const provinceTitleEl = document.getElementById("provinceTitle");
const subTextEl = document.getElementById("subText");
const qInputEl = document.getElementById("qInput");
const refreshBtnEl = document.getElementById("refreshBtn");
const tbodyEl = document.getElementById("tbody");

// ===== SESSION =====
const sessionEmail = localStorage.getItem("email") || "";
const sessionProvince = (localStorage.getItem("province") || "").trim();

if (userEmailEl) userEmailEl.textContent = sessionEmail;
if (provinceTitleEl) provinceTitleEl.textContent = `Province of ${sessionProvince}`;

// ===== STATE =====
let allRows = [];
let shownRows = [];

// ===== HELPERS =====
function esc(s) {
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
function norm(v){ return (v||"").toString().trim(); }

function render(rows){
  tbodyEl.innerHTML = "";
  if (!rows.length){
    tbodyEl.innerHTML = `<tr><td colspan="6">No records found.</td></tr>`;
    return;
  }

  rows.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.trn || r.TRN || "")}</td>
      <td>${esc(r.fullname || r.Fullname || "")}</td>
      <td>${esc(r.contact || r["Contact No."] || r.viber || "")}</td>
      <td>${esc(r.email || r["Email Address"] || "")}</td>
      <td>${esc(r.permanentAddress || r["Permanent Address"] || "")}</td>
      <td>${esc(r.province || r.Province || "")}</td>
    `;
    tbodyEl.appendChild(tr);
  });
}

function applySearch(){
  const q = (qInputEl.value || "").toLowerCase();
  shownRows = !q ? allRows : allRows.filter(r =>
    JSON.stringify(r).toLowerCase().includes(q)
  );
  render(shownRows);
  subTextEl.textContent = `Showing ${shownRows.length} record(s)`;
}

// ===== LOAD DATA =====
async function loadData(){
  subTextEl.textContent = "Loading...";
  const res = await fetch(API + "/api/failed-registrations");
  const data = await res.json();

  const records = data.records || data || [];

  // ✅ BASED ON COLUMN G (Province)
  allRows = records.filter(r =>
    norm(r.province || r.Province) === sessionProvince
  );

  shownRows = allRows;
  render(shownRows);
  subTextEl.textContent = `Showing ${shownRows.length} record(s)`;
}

refreshBtnEl.onclick = loadData;
qInputEl.oninput = applySearch;

// AUTO LOAD
loadData();
