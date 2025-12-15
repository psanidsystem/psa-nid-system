// =======================
// API AUTO-DETECT
// =======================
const API =
  location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://psa-nid-system.onrender.com";

// =======================
// ELEMENTS
// =======================
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginMsg = document.getElementById("loginMsg");
const regMsg = document.getElementById("regMsg");

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "msg " + type;
  el.classList.remove("hidden");
}
function hideMsg(el) {
  el.classList.add("hidden");
  el.textContent = "";
}

// =======================
// TABS
// =======================
loginTab.onclick = () => {
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
  loginForm.style.display = "block";
  registerForm.style.display = "none";
  hideMsg(loginMsg);
  hideMsg(regMsg);
};

registerTab.onclick = () => {
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
  registerForm.style.display = "block";
  loginForm.style.display = "none";
  hideMsg(loginMsg);
  hideMsg(regMsg);

  loadProvinces();
  loadPositions();
  checkAdminEligibility();
};

// =======================
// VIBER INPUT (09 + 11 DIGITS)
// =======================
const regViber = document.getElementById("regViber");

function formatViber(d) {
  return d.replace(/^(\d{4})(\d{3})(\d{0,4}).*/, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join(" ")
  );
}

function normalizeViber() {
  let d = regViber.value.replace(/\D/g, "");

  if (d.startsWith("9")) d = "0" + d;
  if (!d.startsWith("09")) d = "09";

  d = d.slice(0, 11);
  regViber.value = formatViber(d);

  regViber.classList.toggle("invalid", !/^09\d{9}$/.test(d));
}

regViber.addEventListener("input", normalizeViber);
regViber.addEventListener("blur", normalizeViber);

// =======================
// DROPDOWNS
// =======================
async function loadProvinces() {
  const sel = document.getElementById("regProvince");
  sel.innerHTML = `<option value="">-- Select Province --</option>`;
  const r = await fetch(API + "/api/provinces");
  const d = await r.json();
  (d.provinces || []).forEach(p => {
    sel.innerHTML += `<option>${p}</option>`;
  });
}

async function loadPositions() {
  const sel = document.getElementById("regPosition");
  sel.innerHTML = `<option value="">-- Select Position --</option>`;
  const r = await fetch(API + "/api/positions");
  const d = await r.json();
  (d.positions || []).forEach(p => {
    sel.innerHTML += `<option>${p}</option>`;
  });
}

// =======================
// ADMIN ELIGIBILITY
// =======================
function setAdmin(show) {
  const sel = document.getElementById("regRole");
  const note = document.getElementById("adminNote");

  [...sel.options].forEach(o => o.value === "admin" && sel.remove(o.index));

  if (show) {
    sel.innerHTML += `<option value="admin">Admin</option>`;
    note.textContent = "✅ Authorized for Admin";
    note.className = "note ok";
  } else {
    note.textContent = "Admin role requires authorization.";
    note.className = "note bad";
  }
}

async function checkAdminEligibility() {
  const body = {
    firstName: regFirstName.value,
    middleName: regMiddleName.value,
    lastName: regLastName.value,
    email: regEmail.value,
  };

  if (!body.firstName || !body.lastName || !body.email) {
    setAdmin(false);
    return;
  }

  const r = await fetch(API + "/api/admin-eligible", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  setAdmin(!!d.eligible);
}

["regFirstName", "regMiddleName", "regLastName", "regEmail"]
  .forEach(id => document.getElementById(id)?.addEventListener("input", checkAdminEligibility));

// =======================
// LOGIN
// =======================
loginForm.onsubmit = async e => {
  e.preventDefault();
  hideMsg(loginMsg);

  const r = await fetch(API + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: loginEmail.value.trim(),
      password: loginPassword.value
    }),
  });
  const d = await r.json();

  if (!d.success) return showMsg(loginMsg, d.message, "error");

  localStorage.setItem("email", loginEmail.value);
  localStorage.setItem("role", d.role);
  location.href = d.role === "admin" ? "admin.html" : "user.html";
};

// =======================
// REGISTER
// =======================
registerForm.onsubmit = async e => {
  e.preventDefault();
  hideMsg(regMsg);

  const viber = regViber.value.replace(/\D/g, "");
  if (!/^09\d{9}$/.test(viber))
    return showMsg(regMsg, "Invalid Viber number.", "error");

  const body = {
    email: regEmail.value,
    password: regPassword.value,
    role: regRole.value,
    firstName: regFirstName.value,
    middleName: regMiddleName.value,
    lastName: regLastName.value,
    viber,
    position: regPosition.value,
    province: regProvince.value,
  };

  const r = await fetch(API + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();

  if (!d.success) return showMsg(regMsg, d.message, "error");

  showMsg(regMsg, "Account created successfully!", "success");
  registerForm.reset();
};
