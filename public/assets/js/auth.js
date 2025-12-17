const API = location.origin;

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

// Tabs
loginTab.onclick = () => {
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
  loginForm.style.display = "block";
  registerForm.style.display = "none";
  hideMsg(loginMsg);
  hideMsg(regMsg);
};

registerTab.onclick = async () => {
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
  registerForm.style.display = "block";
  loginForm.style.display = "none";
  hideMsg(loginMsg);
  hideMsg(regMsg);

  await loadProvinces();
  await loadPositions();
  checkAdminEligibility();
};

// =======================
// VIBER INPUT (09 + 11 DIGITS) - NO maxlength (spaces won't break)
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

  if (d.length > 0 && !d.startsWith("09")) {
    d = "09" + d.replace(/^0+/, "").replace(/^9/, "");
  }

  d = d.slice(0, 11);
  regViber.value = formatViber(d);

  regViber.classList.toggle("invalid", !(d.length === 11 && /^09\d{9}$/.test(d)));
}

regViber.addEventListener("input", normalizeViber);
regViber.addEventListener("blur", normalizeViber);

// Dropdowns
async function loadProvinces() {
  const sel = document.getElementById("regProvince");
  sel.innerHTML = `<option value="">-- Select Province --</option>`;
  const r = await fetch(API + "/api/provinces");
  const d = await r.json();
  (d.provinces || []).forEach(p => sel.innerHTML += `<option value="${p}">${p}</option>`);
}

async function loadPositions() {
  const sel = document.getElementById("regPosition");
  sel.innerHTML = `<option value="">-- Select Position --</option>`;
  const r = await fetch(API + "/api/positions");
  const d = await r.json();
  (d.positions || []).forEach(p => sel.innerHTML += `<option value="${p}">${p}</option>`);
}

// Admin eligibility
const regFirstName = document.getElementById("regFirstName");
const regMiddleName = document.getElementById("regMiddleName");
const regLastName = document.getElementById("regLastName");
const regEmail = document.getElementById("regEmail");

function setAdmin(show) {
  const sel = document.getElementById("regRole");
  const note = document.getElementById("adminNote");

  [...sel.options].forEach(o => { if (o.value === "admin") sel.remove(o.index); });

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
    firstName: regFirstName.value.trim(),
    middleName: regMiddleName.value.trim(),
    lastName: regLastName.value.trim(),
    email: regEmail.value.trim(),
  };

  if (!body.firstName || !body.lastName || !body.email) return setAdmin(false);

  const r = await fetch(API + "/api/admin-eligible", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  setAdmin(!!d.eligible);
}

["regFirstName", "regMiddleName", "regLastName", "regEmail"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", checkAdminEligibility);
});

// Login + Loading state
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");

// ✅ optional (works even if you don't add spinner HTML)
const loginBtn = loginForm.querySelector("button[type='submit']");
const loginBtnOrig = loginBtn ? loginBtn.textContent : "";

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  hideMsg(loginMsg);

  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";
  }

  try {
    const r = await fetch(API + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail.value.trim(), password: loginPassword.value }),
    });

    const d = await r.json();
    if (!d.success) return showMsg(loginMsg, d.message, "error");

    // ✅ session keys used by guards
    localStorage.setItem("email", loginEmail.value.trim());
    localStorage.setItem("role", d.role || "user");
    localStorage.setItem("sessionAt", Date.now().toString()); // session timestamp

    location.href = (d.role === "admin") ? "admin.html" : "user.html";
  } catch (err) {
    console.error(err);
    showMsg(loginMsg, "Server error. Please try again.", "error");
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = loginBtnOrig || "Login";
    }
  }
};

// Register
const regPassword = document.getElementById("regPassword");
const regConfirm = document.getElementById("regConfirm");
const regRole = document.getElementById("regRole");
const regProvince = document.getElementById("regProvince");
const regPosition = document.getElementById("regPosition");

registerForm.onsubmit = async (e) => {
  e.preventDefault();
  hideMsg(regMsg);

  const viber = regViber.value.replace(/\D/g, "");
  if (!/^09\d{9}$/.test(viber)) return showMsg(regMsg, "Invalid Viber number.", "error");

  if (regPassword.value !== regConfirm.value) return showMsg(regMsg, "Passwords do not match.", "error");
  if (!regPosition.value) return showMsg(regMsg, "Please select Position.", "error");
  if (!regProvince.value) return showMsg(regMsg, "Please select Province.", "error");
  if (!regRole.value) return showMsg(regMsg, "Please select Role.", "error");

  const body = {
    email: regEmail.value.trim(),
    password: regPassword.value,
    role: regRole.value,
    firstName: regFirstName.value.trim(),
    middleName: regMiddleName.value.trim(),
    lastName: regLastName.value.trim(),
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

  showMsg(regMsg, "Account created successfully! You can now login.", "success");
  registerForm.reset();
  setAdmin(false);
};
