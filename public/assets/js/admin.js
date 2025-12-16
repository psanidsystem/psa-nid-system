const API = location.origin;

const tb = document.getElementById("accountsTable");
const searchBox = document.getElementById("searchBox");
let allAccounts = [];

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render(list) {
  tb.innerHTML = "";

  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.7;">No results</td></tr>`;
    return;
  }

  for (const u of list) {
    tb.innerHTML += `
      <tr>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>${escapeHtml(u.status)}</td>
        <td>${escapeHtml(u.lastLogin || "—")}</td>
      </tr>`;
  }
}

async function loadAccounts() {
  const r = await fetch(API + "/api/accounts");
  const d = await r.json();
  if (!Array.isArray(d)) return render([]);
  allAccounts = d;
  render(allAccounts);
}

searchBox.addEventListener("input", () => {
  const q = (searchBox.value || "").toLowerCase().trim();
  render(allAccounts.filter(x => (x.email || "").toLowerCase().includes(q)));
});

document.getElementById("logoutBtn").onclick = () => {
  localStorage.clear();
  location.href = "index.html";
};

// Optional guard
(() => {
  const role = (localStorage.getItem("role") || "").toLowerCase();
  if (role !== "admin") location.href = "index.html";
})();

loadAccounts();
