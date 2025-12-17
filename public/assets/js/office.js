// ===== AUTH GUARD (Office Page) =====
(() => {
  const email = localStorage.getItem("email");
  const role = localStorage.getItem("role");
  const sessionAt = Number(localStorage.getItem("sessionAt") || "0");

  const MAX_AGE_MS = 30 * 60 * 1000;

  if (!email || !role || !sessionAt || Date.now() - sessionAt > MAX_AGE_MS) {
    localStorage.removeItem("email");
    localStorage.removeItem("role");
    localStorage.removeItem("sessionAt");
    location.replace("index.html");
    return;
  }
})();


const API = location.origin;

const userEmailEl = document.getElementById("userEmail");
const logoutLink = document.getElementById("logoutLink");

const qInput = document.getElementById("qInput");
const refreshBtn = document.getElementById("refreshBtn");
const refreshSpinner = document.getElementById("refreshSpinner");

const tbody = document.getElementById("tbody");
const subText = document.getElementById("subText");

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
  refreshBtn.classList.toggle("loading", isLoading);
  if (refreshSpinner) refreshSpinner.style.display = isLoading ? "inline-block" : "none";
}

function normalize(str){
  return String(str ?? "").toLowerCase().trim();
}

function render(rows){
  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="6">No records found for your province.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.trn)}</td>
      <td><b>${escapeHtml(r.fullname)}</b></td>
      <td>${escapeHtml(r.contactNo)}</td>
      <td>${escapeHtml(r.emailAddress)}</td>
      <td>${escapeHtml(r.permanentAddress)}</td>
      <td>${escapeHtml(r.province)}</td>
    </tr>
  `).join("");
}

function applyFilters(){
  const q = normalize(qInput.value);
  let rows = RAW.slice();

  if (q){
    rows = rows.filter(r => {
      const blob = [
        r.trn,
        r.fullname,
        r.contactNo,
        r.emailAddress,
        r.permanentAddress,
        r.province
      ].map(normalize).join(" ");
      return blob.includes(q);
    });
  }

  render(rows);
}

async function load(){
  hideMsgs();
  setLoading(true);

  try{
    const email = (localStorage.getItem("email") || "").trim();
    if (!email){
      location.href = "index.html";
      return;
    }

    if (userEmailEl) userEmailEl.textContent = email;

    const r = await fetch(API + "/api/office-failed?email=" + encodeURIComponent(email));
    const d = await r.json();

    if (!d.success) throw new Error(d.message || "Failed to load.");

    RAW = Array.isArray(d.records) ? d.records : [];
    subText.textContent = `Province: ${d.userProvince} • Records: ${d.count}`;

    applyFilters();
    showOk(`Loaded ${d.count} record(s) for ${d.userProvince}.`);
  }catch(e){
    console.error(e);
    RAW = [];
    subText.textContent = "Failed to load records.";
    tbody.innerHTML = `<tr><td colspan="6">Failed to load data.</td></tr>`;
    showErr(e.message || "Server error.");
  }finally{
    setLoading(false);
  }
}

logoutLink && logoutLink.addEventListener("click", () => {
  localStorage.removeItem("email");
  localStorage.removeItem("role");
});

qInput && qInput.addEventListener("input", applyFilters);
refreshBtn && refreshBtn.addEventListener("click", load);

// init
load();
