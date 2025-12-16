// =======================
// API AUTO-DETECT
// =======================
const API = location.origin;

// =======================
// ELEMENTS
// =======================
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginMsg = document.getElementById("loginMsg");
const regMsg = document.getElementById("regMsg");

// OTP UI
const otpWrap = document.getElementById("otpWrap");
const otpEmailText = document.getElementById("otpEmailText");
const otpCode = document.getElementById("otpCode");
const otpMsg = document.getElementById("otpMsg");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const resendOtpBtn = document.getElementById("resendOtpBtn");
const cancelOtpBtn = document.getElementById("cancelOtpBtn");

// Register fields
const regFirstName = document.getElementById("regFirstName");
const regMiddleName = document.getElementById("regMiddleName");
const regLastName = document.getElementById("regLastName");
const regEmail = document.getElementById("regEmail");
const regViber = document.getElementById("regViber");
const regPosition = document.getElementById("regPosition");
const regProvince = document.getElementById("regProvince");
const regPassword = document.getElementById("regPassword");
const regConfirm = document.getElementById("regConfirm");
const regRole = document.getElementById("regRole");

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "msg " + type;
  el.classList.remove("hidden");
}
function hideMsg(el) {
  el.classList.add("hidden");
  el.textContent = "";
}

// OTP message helpers
function showOtpMsg(text, type) {
  showMsg(otpMsg, text, type);
}
function hideOtpMsg() {
  hideMsg(otpMsg);
}

// =======================
// TABS
// =======================
loginTab.onclick = () => {
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
  loginForm.style.display = "block";
  registerForm.style.display = "none";
  otpWrap.classList.add("hidden");
  hideMsg(loginMsg);
  hideMsg(regMsg);
  hideOtpMsg();
};

registerTab.onclick = () => {
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
  registerForm.style.display = "block";
  loginForm.style.display = "none";
  otpWrap.classList.add("hidden");
  hideMsg(loginMsg);
  hideMsg(regMsg);
  hideOtpMsg();

  loadProvinces();
  loadPositions();
  checkAdminEligibility();
};

// =======================
// VIBER INPUT (09 + 11 DIGITS) - NO maxlength (spaces won't break)
// =======================
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

// =======================
// DROPDOWNS
// =======================
async function loadProvinces() {
  regProvince.innerHTML = `<option value="">-- Select Province --</option>`;
  const r = await fetch(API + "/api/provinces");
  const d = await r.json();
  (d.provinces || []).forEach(p => {
    regProvince.innerHTML += `<option value="${p}">${p}</option>`;
  });
}

async function loadPositions() {
  regPosition.innerHTML = `<option value="">-- Select Position --</option>`;
  const r = await fetch(API + "/api/positions");
  const d = await r.json();
  (d.positions || []).forEach(p => {
    regPosition.innerHTML += `<option value="${p}">${p}</option>`;
  });
}

// =======================
// ADMIN ELIGIBILITY
// =======================
function setAdmin(show) {
  const sel = regRole;
  const note = document.getElementById("adminNote");

  // remove existing admin option if present
  [...sel.options].forEach(o => {
    if (o.value === "admin") sel.remove(o.index);
  });

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

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const r = await fetch(API + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json();

  if (!d.success) return showMsg(loginMsg, d.message, "error");

  localStorage.setItem("email", email);
  localStorage.setItem("role", d.role);

  location.href = d.role === "admin" ? "admin.html" : "user.html";
};

// =======================
// REGISTER + OTP FLOW
// =======================
let pendingReg = null;

function lockRegisterForm(lock) {
  [
    regFirstName, regMiddleName, regLastName, regEmail, regViber,
    regPosition, regProvince, regPassword, regConfirm, regRole
  ].forEach(el => {
    if (el) el.disabled = !!lock;
  });
}

// Step 1: send OTP
// Step 1: Send OTP only (NO register yet)
registerForm.onsubmit = async (e) => {
  e.preventDefault();
  hideMsg(regMsg);
  hideOtpMsg();

  const viberDigits = regViber.value.replace(/\D/g, "");
  if (!/^09\d{9}$/.test(viberDigits)) {
    return showMsg(regMsg, "Invalid Viber number.", "error");
  }

  if (regPassword.value !== regConfirm.value) {
    return showMsg(regMsg, "Passwords do not match.", "error");
  }

  pendingReg = {
    email: regEmail.value.trim().toLowerCase(),
    password: regPassword.value,
    role: regRole.value,
    firstName: regFirstName.value.trim(),
    middleName: regMiddleName.value.trim(),
    lastName: regLastName.value.trim(),
    viber: viberDigits,
    position: regPosition.value,
    province: regProvince.value,
  };

  // 🔐 SEND OTP
  const r = await fetch(API + "/api/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: pendingReg.email }),
  });

  const d = await r.json();
  if (!d.success) {
    return showMsg(regMsg, d.message || "Failed to send OTP.", "error");
  }

  // ✅ SHOW OTP SECTION
  otpEmailText.textContent = pendingReg.email;
  otpWrap.classList.remove("hidden");
  lockRegisterForm(true);

  showMsg(regMsg, "OTP sent. Please check your email.", "success");
};


// Step 2: verify OTP then register
verifyOtpBtn.onclick = async () => {
  hideOtpMsg();
  if (!pendingReg?.email) return showOtpMsg("No pending registration. Please register again.", "error");

  const code = (otpCode.value || "").trim();
  if (!/^\d{6}$/.test(code)) return showOtpMsg("OTP must be 6 digits.", "error");

  verifyOtpBtn.disabled = true;

  try {
    // verify
    const vr = await fetch(API + "/api/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingReg.email, otp: code }),
    });
    const vd = await vr.json();
    if (!vd.success) {
      verifyOtpBtn.disabled = false;
      return showOtpMsg(vd.message || "Invalid OTP.", "error");
    }

    // register (server will enforce verified email)
    const rr = await fetch(API + "/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pendingReg),
    });
    const rd = await rr.json();

    if (!rd.success) {
      verifyOtpBtn.disabled = false;
      lockRegisterForm(false);
      return showOtpMsg(rd.message || "Registration failed.", "error");
    }

    showOtpMsg("✅ Account created successfully!", "success");

    // reset UI
    pendingReg = null;
    registerForm.reset();
    otpWrap.classList.add("hidden");
    lockRegisterForm(false);

    // go back to login tab
    loginTab.click();
  } catch (err) {
    console.error(err);
    showOtpMsg("Server error verifying OTP.", "error");
    verifyOtpBtn.disabled = false;
    lockRegisterForm(false);
  } finally {
    verifyOtpBtn.disabled = false;
  }
};

// Resend OTP
resendOtpBtn.onclick = async () => {
  hideOtpMsg();
  if (!pendingReg?.email) return showOtpMsg("No pending registration.", "error");

  resendOtpBtn.disabled = true;
  try {
    const r = await fetch(API + "/api/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingReg.email }),
    });
    const d = await r.json();
    if (!d.success) return showOtpMsg(d.message || "Failed to resend OTP.", "error");

    showOtpMsg("OTP resent. Please check your email.", "success");
  } catch (e) {
    console.error(e);
    showOtpMsg("Server error resending OTP.", "error");
  } finally {
    resendOtpBtn.disabled = false;
  }
};

// Cancel OTP flow
cancelOtpBtn.onclick = () => {
  pendingReg = null;
  otpWrap.classList.add("hidden");
  lockRegisterForm(false);
  hideOtpMsg();
  showMsg(regMsg, "OTP cancelled. You may edit your details and try again.", "error");
};

