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
function normalizeLower(v) {
  return normalize(v).toLowerCase();
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

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");

const regFirstName = document.getElementById("regFirstName");
const regMiddleName = document.getElementById("regMiddleName");
const regLastName = document.getElementById("regLastName");
const regEmail = document.getElementById("regEmail");
const regViber = document.getElementById("regViber");
const regPosition = document.getElementById("regPosition");
const regProvince = document.getElementById("regProvince");
const regRole = document.getElementById("regRole");
const regPassword = document.getElementById("regPassword");
const regConfirm = document.getElementById("regConfirm");

const adminNote = document.getElementById("adminNote");

// =======================
// Messages
// =======================
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

  // load dropdowns every time open register
  await Promise.all([loadPositions(), loadProvinces()]);
  updateRoleOptions();
  await checkAdminEligibility();
});

// =======================
// Viber normalize
// =======================
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

  const ok = d.length === 11 && /^09\d{9}$/.test(d);
  regViber.classList.toggle("invalid", !ok);
  return ok;
}

regViber?.addEventListener("input", normalizeViber);
regViber?.addEventListener("blur", normalizeViber);

// =======================
// Dropdowns
// =======================
async function loadPositions() {
  if (!regPosition) return;
  regPosition.innerHTML = `<option value="">-- Select Position --</option>`;

  try {
    const r = await fetch(API + "/api/positions");
    const d = await r.json();

    const list = Array.isArray(d.positions) ? d.positions : [];
    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      regPosition.appendChild(opt);
    });
  } catch (e) {
    console.error("loadPositions error:", e);
  }
}

async function loadProvinces() {
  if (!regProvince) return;
  regProvince.innerHTML = `<option value="">-- Select Province --</option>`;

  try {
    const r = await fetch(API + "/api/provinces");
    const d = await r.json();

    const list = Array.isArray(d.provinces) ? d.provinces : [];
    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      regProvince.appendChild(opt);
    });
  } catch (e) {
    console.error("loadProvinces error:", e);
  }
}

// =======================
// Admin eligibility
// =======================
let isAdminEligible = false;

function setAdmin(allowed) {
  if (!regRole || !adminNote) return;

  // remove existing admin option
  [...regRole.options].forEach((o) => {
    if (o.value === "admin") regRole.remove(o.index);
  });

  isAdminEligible = !!allowed;

  if (isAdminEligible) {
    const opt = document.createElement("option");
    opt.value = "admin";
    opt.textContent = "Admin";
    regRole.appendChild(opt);

    adminNote.textContent = "✅ Authorized for Admin";
    adminNote.className = "note ok";
  } else {
    adminNote.textContent = "Admin role requires authorization.";
    adminNote.className = "note bad";
  }

  updateRoleOptions();
}

async function checkAdminEligibility() {
  if (!regFirstName || !regLastName || !regEmail) return setAdmin(false);

  const body = {
    firstName: normalize(regFirstName.value),
    middleName: normalize(regMiddleName?.value),
    lastName: normalize(regLastName.value),
    email: normalize(regEmail.value).toLowerCase(),
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

["regFirstName", "regMiddleName", "regLastName", "regEmail"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => {
    hideMsg(regMsg);
    checkAdminEligibility();
  });
});

// =======================
// Role enforcement based on Position
// =======================
function ensureOption(selectEl, value, label) {
  if (!selectEl) return;
  const exists = [...selectEl.options].some((o) => o.value === value);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label || value;
    selectEl.appendChild(opt);
  }
}

function removeOption(selectEl, value) {
  if (!selectEl) return;
  [...selectEl.options].forEach((o) => {
    if (o.value === value) selectEl.remove(o.index);
  });
}

function updateRoleOptions() {
  if (!regRole) return;

  const pos = normalize(regPosition?.value);

  // always keep user option (unless office pos forces)
  ensureOption(regRole, "user", "User");

  if (pos && isOfficePosition(pos)) {
    // force office
    removeOption(regRole, "user");
    ensureOption(regRole, "office", "Office");

    if (!regRole.value || regRole.value === "user") regRole.value = "office";
  } else {
    // non-office -> remove office option
    removeOption(regRole, "office");
    ensureOption(regRole, "user", "User");

    if (regRole.value === "office") regRole.value = "user";
  }
}

regPosition?.addEventListener("change", () => {
  hideMsg(regMsg);
  updateRoleOptions();
});

// =======================
// LOGIN
// =======================
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
    const email = normalizeLower(loginEmail?.value);
    const password = loginPassword?.value || "";

    const r = await fetch(API + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const d = await r.json();
    if (!d.success) {
      showMsg(loginMsg, d.message || "Login failed.", "error");
      return;
    }

    localStorage.setItem("email", email);
    localStorage.setItem("role", (d.role || "user").toLowerCase());
    localStorage.setItem("sessionAt", Date.now().toString());
    localStorage.setItem("province", d.province || "");
    localStorage.setItem("position", d.position || "");

    const role = (d.role || "user").toLowerCase();
    if (role === "admin") location.replace("admin.html");
    else if (role === "office") location.replace("office.html");
    else location.replace("user.html");
  } catch (err) {
    console.error("login error:", err);
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
registerForm && (registerForm.onsubmit = async (e) => {
  e.preventDefault();
  hideMsg(regMsg);

  // validate viber
  const okViber = normalizeViber();
  const viber = (regViber?.value || "").replace(/\D/g, "");
  if (!okViber) return showMsg(regMsg, "Invalid Viber number. Use 09XXXXXXXXX.", "error");

  // passwords
  if ((regPassword?.value || "") !== (regConfirm?.value || "")) {
    return showMsg(regMsg, "Passwords do not match.", "error");
  }

  if (!normalize(regPosition?.value)) return showMsg(regMsg, "Please select Position.", "error");
  if (!normalize(regProvince?.value)) return showMsg(regMsg, "Please select Province.", "error");
  if (!normalize(regRole?.value)) return showMsg(regMsg, "Please select Role.", "error");

  // enforce role for office positions
  const pos = normalize(regPosition.value);
  if (isOfficePosition(pos) && regRole.value !== "office" && regRole.value !== "admin") {
    return showMsg(regMsg, "Selected position requires Office role.", "error");
  }

  const body = {
    email: normalize(regEmail?.value).toLowerCase(),
    password: regPassword?.value || "",
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
    if (!d.success) return showMsg(regMsg, d.message || "Register failed.", "error");

    showMsg(regMsg, "Account created successfully! You can now login.", "success");

    registerForm.reset();
    setAdmin(false);
    await Promise.all([loadPositions(), loadProvinces()]);
    updateRoleOptions();
  } catch (err) {
    console.error("register error:", err);
    showMsg(regMsg, "Server error. Please try again.", "error");
  }
});
