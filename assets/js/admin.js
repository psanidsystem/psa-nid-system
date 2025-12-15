const API = "http://localhost:3000";

async function loadAccounts() {
    const res = await fetch(API + "/api/accounts");
    const accounts = await res.json();

    const tbody = document.getElementById("accountsTable");
    tbody.innerHTML = "";

    accounts.forEach(acc => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${acc.email}</td>
            <td>${acc.role}</td>
            <td>${acc.status}</td>
            <td>${acc.lastLogin || "—"}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Search
document.getElementById("searchBox").oninput = async (e) => {
    const term = e.target.value.toLowerCase();
    const res = await fetch(API + "/api/accounts");
    const accounts = await res.json();

    const tbody = document.getElementById("accountsTable");
    tbody.innerHTML = "";

    accounts
        .filter(a => a.email.toLowerCase().includes(term))
        .forEach(acc => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${acc.email}</td>
                <td>${acc.role}</td>
                <td>${acc.status}</td>
                <td>${acc.lastLogin || "—"}</td>
            `;
            tbody.appendChild(tr);
        });
};

// Logout
document.getElementById("logoutBtn").onclick = () => {
    localStorage.clear();
    location.href = "index.html";
};

loadAccounts();
