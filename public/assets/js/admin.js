// ===== AUTH GUARD (Admin Page) =====
(() => {
  const email = localStorage.getItem("email");
  const role = localStorage.getItem("role");
  const sessionAt = Number(localStorage.getItem("sessionAt") || "0");

  const MAX_AGE_MS = 30 * 60 * 1000;

  if (!email || role !== "admin" || !sessionAt || Date.now() - sessionAt > MAX_AGE_MS) {
    localStorage.removeItem("email");
    localStorage.removeItem("role");
    localStorage.removeItem("sessionAt");
    location.replace("index.html");
    return;
  }
})();

const API = location.origin;

async function loadAccounts() {
  const r = await fetch(API + "/api/accounts");
  const a = await r.json();
  const tb = document.getElementById("accountsTable");
  if (!tb) return;

  tb.innerHTML = "";
  a.forEach(u => {
    tb.innerHTML += `
      <tr>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>${u.status}</td>
        <td>${u.lastLogin || "—"}</td>
      </tr>`;
  });
}

document.getElementById("searchBox").oninput = async e => {
  const q = e.target.value.toLowerCase();
  const r = await fetch(API + "/api/accounts");
  const a = await r.json();
  const tb = document.getElementById("accountsTable");
  tb.innerHTML = "";

  a.filter(x => (x.email || "").toLowerCase().includes(q))
   .forEach(u => {
     tb.innerHTML += `
      <tr>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>${u.status}</td>
        <td>${u.lastLogin || "—"}</td>
      </tr>`;
   });
};

document.getElementById("logoutBtn").onclick = (e) => {
  e.preventDefault();
  localStorage.removeItem("email");
  localStorage.removeItem("role");
  localStorage.removeItem("sessionAt");
  location.replace("index.html");
};

loadAccounts();
