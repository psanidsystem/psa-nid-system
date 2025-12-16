document.addEventListener("DOMContentLoaded", () => {
  const API = location.origin;

  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  const loginMsg = document.getElementById("loginMsg");
  const regMsg = document.getElementById("regMsg");

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = "msg " + type;
    el.classList.remove("hidden");
  }
  function hideMsg(el) {
    if (!el) return;
    el.classList.add("hidden");
    el.textContent = "";
  }

  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");

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
  const adminNote = document.getElementById("adminNote");

  // Viber normalize
  function normalizeViber() {
    if (!regViber) return;

    let d = regViber.value.replace(/\D/g, "");
    if (d.startsWith("9")) d = "0" + d;
    if (d.length > 0 && !d.startsWith("09")) d = "09" + d.replace(/^0+/, "").replace(/^9/, "");

    d = d.slice(0, 11);
    regViber.value = d;
  }

  regViber && regViber.addEventListener("input", normalizeViber);

  // Tabs
  loginTab && (loginTab.onclick = () => {
    loginTab.classList.add("active");
    registerTab && registerTab.classList.remove("active");
    loginForm && (loginForm.style.display = "block");
    registerForm && (registerForm.style.display = "none");
    hideMsg(loginMsg);
    hideMsg(regMsg);
  });

  registerTab && (registerTab.onclick = async () => {
    registerTab.classList.add("active");
    loginTab && loginTab.classList.remove("active");
    registerForm && (registerForm.style.display = "block");
    loginForm && (loginForm.style.display = "none");
    hideMsg(loginMsg);
    hideMsg(regMsg);

    // load dropdowns
    try {
      const pr = await fetch(API + "/api/positions");
      const pd = await pr.json();
      regPosition.innerHTML = `<option value="">-- Select Position --</option>`;
      (pd.positions || []).forEach(p => regPosition.innerHTML += `<option value="${p}">${p}</option>`);
    } catch {}

    try {
      const rr = await fetch(API + "/api/provinces");
      const rd = await rr.json();
      regProvince.innerHTML = `<option value="">-- Select Province --</option>`;
      (rd.provinces || []).forEach(p => regProvince.innerHTML += `<option value="${p}">${p}</option>`);
    } catch {}

    // admin note
    if (adminNote) adminNote.textContent = "Admin role requires authorization.";
  });

  // Login
  loginForm && (loginForm.onsubmit = async (e) => {
    e.preventDefault();
    hideMsg(loginMsg);

    const r = await fetch(API + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: loginEmail.value.trim(),
        password: loginPassword.value,
      }),
    });

    const d = await r.json();
    if (!d.success) return showMsg(loginMsg, d.message || "Login failed", "error");

    localStorage.setItem("email", loginEmail.value.trim());
    localStorage.setItem("role", d.role || "user");
    location.href = d.role === "admin" ? "admin.html" : "user.html";
  });

  // Register
  registerForm && (registerForm.onsubmit = async (e) => {
    e.preventDefault();
    hideMsg(regMsg);

    const viberDigits = (regViber.value || "").replace(/\D/g, "");
    if (!/^09\d{9}$/.test(viberDigits)) return showMsg(regMsg, "Invalid Viber number.", "error");
    if (regPassword.value !== regConfirm.value) return showMsg(regMsg, "Passwords do not match.", "error");
    if (!regPosition.value) return showMsg(regMsg, "Please select Position.", "error");
    if (!regProvince.value) return showMsg(regMsg, "Please select Province.", "error");

    const body = {
      email: regEmail.value.trim(),
      password: regPassword.value,
      role: regRole.value,
      firstName: regFirstName.value.trim(),
      middleName: regMiddleName.value.trim(),
      lastName: regLastName.value.trim(),
      viber: viberDigits,
      position: regPosition.value,
      province: regProvince.value,
    };

    const r = await fetch(API + "/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const d = await r.json();
    if (!d.success) return showMsg(regMsg, d.message || "Register failed", "error");

    showMsg(regMsg, "Account created successfully!", "success");
    registerForm.reset();
  });
});
