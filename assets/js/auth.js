const API = "http://localhost:3000";

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "msg " + type;
  el.classList.remove("hidden");
}
function hideMsg(el) {
  el.classList.add("hidden");
  el.textContent = "";
}

loginTab.onclick = () => {
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
  loginForm.style.display = "block";
  registerForm.style.display = "none";
  hideMsg(document.getElementById("loginMsg"));
  hideMsg(document.getElementById("regMsg"));
};

registerTab.onclick = () => {
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
  registerForm.style.display = "block";
  loginForm.style.display = "none";
  hideMsg(document.getElementById("loginMsg"));
  hideMsg(document.getElementById("regMsg"));

  // load dropdowns + check eligibility when opening register tab
  loadProvinces();
  loadPositions();
  checkAdminEligibility();
};

// =======================
// ✅ VIBER INPUT ENHANCEMENTS
// =======================
const regViberEl = document.getElementById("regViber");

function viberDigitsOnly() {
  return (regViberEl?.value || "").replace(/\D/g, "");
}

// digits: "09123456789" -> "0912 345 6789"
function formatViberDisplay(digits) {
  const a = digits.slice(0, 4);
  const b = digits.slice(4, 7);
  const c = digits.slice(7, 11);
  let out = a;
  if (b) out += " " + b;
  if (c) out += " " + c;
  return out.trim();
}

function setViberInvalid(isInvalid) {
  if (!regViberEl) return;
  regViberEl.classList.toggle("invalid", !!isInvalid);
}

function normalizeAndFormatViber() {
  if (!regViberEl) return;

  let digits = viberDigitsOnly();

  // allow empty
  if (!digits) {
    setViberInvalid(false);
    return;
  }

  // auto enforce 09 start
  if (digits[0] === "9") digits = "0" + digits; // 9xxxx -> 09xxx
  if (digits.length >= 2 && digits.slice(0, 2) !== "09") {
    // force to 09 + keep rest after first 2 digits
    digits = "09" + digits.slice(2);
  }
  if (digits.length === 1 && digits !== "0") {
    digits = "09";
  }

  // limit 11 digits
  digits = digits.slice(0, 11);

  // update field with spacing format
  regViberEl.value = formatViberDisplay(digits);

  // invalid if not 11 digits OR not 09 start
  const isValid = /^09\d{9}$/.test(digits);
  setViberInvalid(!isValid);
}

if (regViberEl) {
  regViberEl.addEventListener("input", normalizeAndFormatViber);
  regViberEl.addEventListener("blur", normalizeAndFormatViber);
}

// =======================
// Provinces (Dropdown!D2:D)
// =======================
async function loadProvinces() {
  const select = document.getElementById("regProvince");
  if (!select) return;

  select.innerHTML = `<option value="">-- Select Province --</option>`;

  try {
    const res = await fetch(API + "/api/provinces");
    const data = await res.json();

    if (!data.success) throw new Error("API failed");

    data.provinces.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    });
  } catch (e) {
    const opt = document.createElement("option");
    opt.value = "Others";
    opt.textContent = "Others";
    select.appendChild(opt);
  }
}

// =======================
// Position (Dropdown!B2:B)
// =======================
async function loadPositions() {
  const select = document.getElementById("regPosition");
  if (!select) return;

  select.innerHTML = `<option value="">-- Select Position --</option>`;

  try {
    const res = await fetch(API + "/api/positions");
    const data = await res.json();

    if (!data.success) throw new Error("API failed");

    data.positions.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    });
  } catch (e) {
    const opt = document.createElement("option");
    opt.value = "Others";
    opt.textContent = "Others";
    select.appendChild(opt);
  }
}

// =======================
// Admin auto-hide/show
// =======================
function setAdminOption(show) {
  const roleSelect = document.getElementById("regRole");
  const note = document.getElementById("adminNote");
  if (!roleSelect || !note) return;

  // remove existing admin option if any
  const options = [...roleSelect.options];
  const existing = options.find((o) => o.value === "admin");
  if (existing) roleSelect.remove(existing.index);

  if (show) {
    const opt = document.createElement("option");
    opt.value = "admin";
    opt.textContent = "Admin";
    roleSelect.appendChild(opt);

    note.textContent = "✅ You are authorized for Admin role.";
    note.className = "note ok";
  } else {
    if (roleSelect.value === "admin") roleSelect.value = "user";

    note.textContent = "Admin role requires authorization.";
    note.className = "note bad";
  }
}

async function checkAdminEligibility() {
  const firstName = document.getElementById("regFirstName")?.value || "";
  const middleName = document.getElementById("regMiddleName")?.value || "";
  const lastName = document.getElementById("regLastName")?.value || "";
  const email = document.getElementById("regEmail")?.value || "";

  if (!firstName.trim() || !lastName.trim() || !email.trim()) {
    setAdminOption(false);
    return;
  }

  try {
    const res = await fetch(API + "/api/admin-eligible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, middleName, lastName, email }),
    });

    const data = await res.json();
    if (!data.success) {
      setAdminOption(false);
      return;
    }
    setAdminOption(!!data.eligible);
  } catch (e) {
    setAdminOption(false);
  }
}

["regFirstName", "regMiddleName", "regLastName", "regEmail"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", checkAdminEligibility);
});

// Load dropdowns once on startup too
document.addEventListener("DOMContentLoaded", () => {
  loadProvinces();
  loadPositions();
});

// =======================
// LOGIN
// =======================
loginForm.onsubmit = async (e) => {
  e.preventDefault();

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  const loginMsg = document.getElementById("loginMsg");
  hideMsg(loginMsg);

  const res = await fetch(API + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (!data.success) {
    showMsg(loginMsg, data.message, "error");
    return;
  }

  localStorage.setItem("role", data.role);
  localStorage.setItem("email", email);

  if (data.role === "admin") location.href = "admin.html";
  else location.href = "user.html";
};

// =======================
// REGISTER
// =======================
registerForm.onsubmit = async (e) => {
  e.preventDefault();

  const regMsg = document.getElementById("regMsg");
  hideMsg(regMsg);

  if (regPassword.value !== regConfirm.value) {
    showMsg(regMsg, "Passwords do not match.", "error");
    return;
  }

  // ✅ Viber validation (must be 09 + 11 digits)
  const viberDigits = (regViber.value || "").replace(/\D/g, "");
  if (!/^09\d{9}$/.test(viberDigits)) {
    showMsg(regMsg, "Viber number must start with 09 and be exactly 11 digits.", "error");
    setViberInvalid(true);
    return;
  }

  const body = {
    email: regEmail.value.trim(),
    password: regPassword.value,
    role: regRole.value,
    firstName: regFirstName.value.trim(),
    middleName: regMiddleName.value.trim(),
    lastName: regLastName.value.trim(),
    viber: viberDigits, // ✅ send digits only
    position: (document.getElementById("regPosition")?.value || "").trim(),
    province: regProvince.value,
  };

  // ✅ make Position required (same as backend)
  if (!body.position) {
    showMsg(regMsg, "Please select Position.", "error");
    return;
  }

  const res = await fetch(API + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!data.success) {
    showMsg(regMsg, data.message, "error");
    return;
  }

  showMsg(regMsg, "Account created successfully!", "success");
  registerForm.reset();
  loadProvinces();
  loadPositions();
  setAdminOption(false);
  setViberInvalid(false);
};
