const API =
  location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://psa-nid-system.onrender.com";

async function load() {
  const r = await fetch(API + "/api/accounts");
  const a = await r.json();
  const tb = document.getElementById("accountsTable");
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
  accountsTable.innerHTML = "";
  a.filter(x => x.email.toLowerCase().includes(q))
   .forEach(load);
};

document.getElementById("logoutBtn").onclick = () => {
  localStorage.clear();
  location.href = "index.html";
};

load();
