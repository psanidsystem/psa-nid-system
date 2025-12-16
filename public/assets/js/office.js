const API = location.origin;

const userEmailEl = document.getElementById("userEmail");
const btnBackUser = document.getElementById("btnBackUser");
const logoutLink = document.getElementById("logoutLink");

const qInput = document.getElementById("qInput");
const provFilter = document.getElementById("provFilter");
const refreshBtn = document.getElementById("refreshBtn");
const refreshSpinner = document.getElementById("refreshSpinner");

const tbody = document.getElementById("tbody");
const msgOk = document.getElementById("msgOk");
const msgErr = document.getElementById("msgErr");

let RAW = [];

function showOk(t){ msgErr.style.display="none"; msgOk.textContent=t||""; msgOk.style.display="block"; }
function showErr(t){ msgOk.style.display="none"; msgErr.textContent=t||""; msgErr.style.display="block"; }
function hideMsgs(){ msgOk.style.display="none"; msgErr.style.display="none"; }

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setLoading(isLoading){
  refreshBtn.disabled = isLoading;
  if (isLoading) refreshBtn.classList.add("loading");
  else refreshBtn.classList.remove("loading");
  if (refreshSpinner) refreshSpinner.style.display = isLoading ? "inline-block" : "none";
}

function normalize(str){
  return String(str ?? "").toLowerCase().trim();
}

function render(rows){
  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="6">No records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const name = escapeHtml(r.fullname || r.name || "—");
    const email = escapeHtml(r.email || "—");
    const viber = escapeHtml(r.viber || r.viberNumber || "—");
    const pos = escapeHtml(r.position || "—");
    const prov = escapeHtml(r.province || "—");
    const role = escapeHtml(r.role || "user");

    return `
      <tr>
        <td><b>${name}</b></td>
        <td>${email}</td>
        <td>${viber}</td>
        <td>${pos}</td>
        <td>${prov}</td>
        <td><span class="badge">${role}</span></td>
      </tr>
    `;
  }).join("");
}

function applyFilters(){
  const q = normalize(qInput.value);
  const prov = provFilter.value;

  let rows = RAW.slice();

  if (prov){
    rows = rows.filter(r => String(r.province || "").trim() === prov);
  }

  if (q){
    rows = rows.filter(r => {
      const blob = [
        r.fullname, r.name, r.email, r.position, r.province, r.viber, r.role
      ].map(normalize).join(" ");
      return blob.includes(q);
    });
  }

  render(rows);
}

function fillProvinceOptions(rows){
  const set = new Set();
  rows.forEach(r => {
    const p = String(r.province || "").trim();
    if (p) set.add(p);
  });

  const list = Array.from(set).sort((a,b)=>a.localeCompare(b));
  provFilter.innerHTML = `<option value="">All Provinces</option>` + list.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
}

async function load(){
  hideMsgs();
  setLoading(true);
  try{
    const r = await fetch(API + "/api/office-personnel");
    const d = await r.json();

    if (!d.success) throw new Error(d.message || "Failed to load.");

    RAW = Array.isArray(d.records) ? d.records : [];
    fillProvinceOptions(RAW);
    applyFilters();
    showOk(`Loaded ${RAW.length} records.`);
  }catch(e){
    console.error(e);
    RAW = [];
    tbody.innerHTML = `<tr><td colspan="6">Failed to load data.</td></tr>`;
    showErr(e.message || "Server error.");
  }finally{
    setLoading(false);
  }
}

/* ===== Simple auth guard (client-side) =====
   NOTE: basic ra ni. If wala email sa localStorage, balik sa login.
*/
(function guard(){
  const email = localStorage.getItem("email") || "";
  userEmailEl.textContent = email || "—";
  if (!email){
    // if walay login info
    location.href = "index.html";
  }
})();

btnBackUser && btnBackUser.addEventListener("click", () => {
  location.href = "user.html";
});

logoutLink && logoutLink.addEventListener("click", (e) => {
  // clear simple session
  localStorage.removeItem("email");
  localStorage.removeItem("role");
  // allow navigation to index.html
});

qInput && qInput.addEventListener("input", applyFilters);
provFilter && provFilter.addEventListener("change", applyFilters);
refreshBtn && refreshBtn.addEventListener("click", load);

// init
load();
