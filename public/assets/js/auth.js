const API = location.origin;

// =======================
// CONFIG: office positions => role must be "office"
// =======================
const OFFICE_POSITIONS = new Set([
  "Registration Officer III",
  "Registration Officer II",
  "Information Officer I",
]);

function normalize(v) {
  return (v || "").toString().trim();
}
function isOfficePosition(pos) {
  return OFFICE_POSITIONS.has(normalize(pos));
}

// =======================
// Elements
// =======================
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginMsg = document.getElementById("loginMsg");
const regMsg = document.getElementById("regMsg");

function showMsg(el, text, type) {
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (type || "");
  el.classList.remove("hidden");
}
function hideMsg(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.textContent = "";
}

// =======================
// Tabs
// =======================
loginTab && (loginTab.onclick = () => {
  loginTab.classList.add("active");
  registerTab?.classList.remove("active");
  if (loginForm) loginForm.style.display = "block";
  if (registerForm) registerForm.style.display = "none";
  hideMsg(loginMsg);
  hideMsg(regMsg);
});

registerTab && (registerTab.onclick = async () => {
  registerTab.classList.add("active");
  loginTab?.classList.remove("active");
  if (registerForm) registerForm.style.display = "block";
  if (loginForm) loginForm.style.display = "none";
  hideMsg(loginMsg);
  hideMsg(regMsg);

  await loadProvinces();
  await loadPositions();
  updateRoleOptions();
  checkAdminEligibility();
});

// =======================
// Viber normalize
// =======================
const regViber = document.getElementById("regViber");

function formatViber(d) {
  return d.replace(/^(\d{4})(\d{3})(\d{0,4}).*/, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join(" ")
  );
}

function normalizeViber() {
  if (!regViber) return;

  let d = regViber.value.replace(/\D/g, "");
  if (d.startsWith("9")) d = "0" + d;

  if (d.length > 0 && !d.startsWith("09")) {
    d = "09" + d.replace(/^0+/, "").replace(/^9/, "");
  }

  d = d.slice(0, 11);
  regViber.value = formatViber(d);

  regViber.classList.toggle("invalid", !(d.length === 11 && /^09\d{9}$/.test(d)));
}

regViber?.addEventListener("input", normalizeViber);
regViber?.addEventListener("blur", normalizeViber);

// =======================
// Dropdowns
// =======================
async function loadProvinces() {
  const sel = document.getElementById("regProvince");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Select Province --</option>`;
  const r = await fetch(API + "/api/provinces");
  const d = await r.json();
  (d.provinces || []).forEach(p => sel.innerHTML += `<option value="${p}">${p}</option>`);
}

async function loadPositions() {
  const sel = document.getElementById("regPosition");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Select Position --</option>`;
  const r = await fetch(API + "/api/positions");
  const d = await r.json();
  (d.positions || []).forEach(p => sel.innerHTML += `<option value="${p}">${p}</option>`);
}

// =======================
// Admin eligibility
// =======================
const regFirstName = document.getElementById("regFirstName");
const regMiddleName = document.getElementById("regMiddleName");
const regLastName = document.getElementById("regLastName");
const regEmail = document.getElementById("regEmail");

let isAdminEligible = false;

function setAdmin(show) {
  const sel = document.getElementById("regRole");
  const note = document.getElementById("adminNote");
  if (!sel || !note) return;

  [...sel.options].forEach(o => { if (o.value === "admin") sel.remove(o.index); });
  isAdminEligible = !!show;

  if (show) {
    sel.innerHTML += `<option value="admin">Admin</option>`;
    note.textContent = "✅ Authorized for Admin";
    note.className = "note ok";
  } else {
    note.textContent = "Admin role requires authorization.";
    note.className = "note bad";
  }

  updateRoleOptions();
}

async function checkAdminEligibility() {
  const body = {
    firstName: normalize(regFirstName?.value),
    middleName: normalize(regMiddleName?.value),
    lastName: normalize(regLastName?.value),
    email: normalize(regEmail?.value),
  };

  if (!body.firstName || !body.lastName || !body.email) return setAdmin(false);

  try {
    const r = await fetch(API + "/api/admin-eligible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    setAdmin(!!d.eligible);
  } catch (e) {
    console.error("admin-eligible error:", e);
    setAdmin(false);
  }
}

["regFirstName", "regMiddleName", "regLastName", "regEmail"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", checkAdminEligibility);
});

// =======================
// Role enforcement based on Position
// =======================
const regRole = document.getElementById("regRole");
const regProvince = document.getElementById("regProvince");
const regPosition = document.getElementById("regPosition");

function ensureOption(selectEl, value, label) {
  if (!selectEl) return;
  const exists = [...selectEl.options].some(o => o.value === value);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label || value;
    selectEl.appendChild(opt);
  }
}

function removeOption(selectEl, value) {
  if (!selectEl) return;
  [...selectEl.options].forEach(o => { if (o.value === value) selectEl.remove(o.index); });
}

function updateRoleOptions() {
  if (!regRole) return;

  const pos = normalize(regPosition?.value);

  ensureOption(regRole, "user", "User");

  if (pos && isOfficePosition(pos)) {
    removeOption(regRole, "user");
    ensureOption(regRole, "office", "Office");
    if (!regRole.value || regRole.value === "user") regRole.value = "office";
  } else {
    removeOption(regRole, "office");
    ensureOption(regRole, "user", "User");
    if (regRole.value === "office") regRole.value = "user";
  }
}

regPosition?.addEventListener("change", () => {
  updateRoleOptions();
  hideMsg(regMsg);
});

// =======================
// LOGIN
// =======================
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");

const loginBtn = loginForm?.querySelector("button[type='submit']");
const loginBtnOrig = loginBtn ? loginBtn.textContent : "";

loginForm && (loginForm.onsubmit = async (e) => {
  e.preventDefault();
  hideMsg(loginMsg);

  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";
  }

  try {
    const email = normalize(loginEmail?.value).toLowerCase();
    const password = loginPassword?.value || "";

    const r = await fetch(API + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const d = await r.json();
    if (!d.success) return showMsg(loginMsg, d.message, "error");

    localStorage.setItem("email", email);
    localStorage.setItem("role", d.role || "user");
    localStorage.setItem("sessionAt", Date.now().toString());

    // ✅ ALWAYS set (avoid stale)
    localStorage.setItem("province", d.province || "");
    localStorage.setItem("position", d.position || "");

    const role = (d.role || "user").toLowerCase();
    if (role === "admin") location.replace("admin.html");
    else if (role === "office") location.replace("office.html");
    else location.replace("user.html");
  } catch (err) {
    console.error(err);
    showMsg(loginMsg, "Server error. Please try again.", "error");
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = loginBtnOrig || "Login";
    }
  }
});

// =======================
// REGISTER
// =======================
const regPassword = document.getElementById("regPassword");
const regConfirm = document.getElementById("regConfirm");

registerForm && (registerForm.onsubmit = async (e) => {
  e.preventDefault();
  hideMsg(regMsg);

  const viber = (regViber?.value || "").replace(/\D/g, "");
  if (!/^09\d{9}$/.test(viber)) return showMsg(regMsg, "Invalid Viber number.", "error");

  if ((regPassword?.value || "") !== (regConfirm?.value || "")) {
    return showMsg(regMsg, "Passwords do not match.", "error");
  }

  if (!normalize(regPosition?.value)) return showMsg(regMsg, "Please select Position.", "error");
  if (!normalize(regProvince?.value)) return showMsg(regMsg, "Please select Province.", "error");
  if (!normalize(regRole?.value)) return showMsg(regMsg, "Please select Role.", "error");

  const pos = normalize(regPosition.value);
  if (isOfficePosition(pos) && regRole.value !== "office" && regRole.value !== "admin") {
    return showMsg(regMsg, "Selected position requires Office role.", "error");
  }

  const body = {
    email: normalize(regEmail?.value).toLowerCase(),
    password: regPassword.value,
    role: regRole.value,
    firstName: normalize(regFirstName?.value),
    middleName: normalize(regMiddleName?.value),
    lastName: normalize(regLastName?.value),
    viber,
    position: regPosition.value,
    province: regProvince.value,
  };

  try {
    const r = await fetch(API + "/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const d = await r.json();
    if (!d.success) return showMsg(regMsg, d.message, "error");

    showMsg(regMsg, "Account created successfully! You can now login.", "success");
    registerForm.reset();
    setAdmin(false);
    updateRoleOptions();
  } catch (e2) {
    console.error(e2);
    showMsg(regMsg, "Server error. Please try again.", "error");
  }
});
