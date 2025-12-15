// Use same origin (works on localhost + Render)
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

function render(accounts) {
  tb.innerHTML = "";

  if (!accounts.length) {
    tb.innerHTML = `<tr><td colspan="4" style="text-align:center; opacity:.7;">No results</td></tr>`;
    return;
  }

  for (const u of accounts) {
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

  // if server returns {success:false...}
  if (!Array.isArray(d)) {
    console.error(d);
    render([]);
    return;
  }

  allAccounts = d;
  render(allAccounts);
}

searchBox.addEventListener("input", () => {
  const q = (searchBox.value || "").toLowerCase().trim();
  const filtered = allAccounts.filter(x =>
    (x.email || "").toLowerCase().includes(q)
  );
  render(filtered);
});

document.getElementById("logoutBtn").onclick = () => {
  localStorage.clear();
  location.href = "index.html";
};

// Optional: block non-admin
(function guard() {
  const role = (localStorage.getItem("role") || "").toLowerCase();
  if (role !== "admin") location.href = "index.html";
})();

loadAccounts();
