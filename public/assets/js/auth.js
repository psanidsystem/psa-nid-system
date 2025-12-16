document.addEventListener("DOMContentLoaded", () => {
  const API = location.origin;

  // Tabs + forms
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  // Messages
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

  // Login inputs
  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");

  // Register inputs
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

  // prevent double-load
  let positionsLoaded = false;
  let provincesLoaded = false;

  // ===== Viber formatting =====
  function formatViber(d) {
    return d.replace(/^(\d{4})(\d{3})(\d{0,4}).*/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(" ")
    );
  }

  function normalizeViber() {
    if (!regViber) return;

    let d = regViber.value.replace(/\D/g, "");
    if (d.startsWith("9")) d = "0" + d;
    if (d.length > 0 && !d.startsWith("09")) d = "09" + d.replace(/^0+/, "").replace(/^9/, "");

    d = d.slice(0, 11);
    regViber.value = formatViber(d);

    regViber.classList.toggle("invalid", !(d.length === 11 && /^09\d{9}$/.test(d)));
  }

  regViber && regViber.addEventListener("input", normalizeViber);
  regViber && regViber.addEventListener("blur", normalizeViber);

  // ===== Dropdowns (load once only) =====
  async function loadPositionsOnce() {
    if (!regPosition || positionsLoaded) return;

    regPosition.innerHTML = `<option value="">-- Select Position --</option>`;
    try {
      const r = await fetch(API + "/api/positions");
      const d = await r.json();
      const list = d.positions || [];

      if (!list.length && d.message) showMsg(regMsg, d.message, "error");

      list.forEach((p) => {
        regPosition.innerHTML += `<option value="${p}">${p}</option>`;
      });

      positionsLoaded = true;
    } catch (e) {
      showMsg(regMsg, "Failed to load positions.", "error");
    }
  }

  async function loadProvincesOnce() {
    if (!regProvince || provincesLoaded) return;

    regProvince.innerHTML = `<option value="">-- Select Province --</option>`;
    try {
      const r = await fetch(API + "/api/provinces");
      const d = await r.json();
      const list = d.provinces || [];

      if (!list.length && d.message) showMsg(regMsg, d.message, "error");

      list.forEach((p) => {
        regProvince.innerHTML += `<option value="${p}">${p}</option>`;
      });

      provincesLoaded = true;
    } catch (e) {
      showMsg(regMsg, "Failed to load provinces.", "error");
    }
  }

  // ===== Admin eligibility =====
  function setAdmin(show) {
    if (!regRole || !adminNote) return;

    // remove admin option if exists
    [...regRole.options].forEach((o) => {
      if (o.value === "admin") regRole.remove(o.index);
    });

    if (show) {
      regRole.innerHTML += `<option value="admin">Admin</option>`;
      adminNote.textContent = "✅ Authorized for Admin";
      adminNote.className = "note ok";
    } else {
      adminNote.textContent = "Admin role requires authorization.";
      adminNote.className = "note bad";
    }
  }

  async function checkAdminEligibility() {
    const body = {
      firstName: regFirstName?.value || "",
      middleName: regMiddleName?.value || "",
      lastName: regLastName?.value || "",
      email: regEmail?.value || "",
    };

    if (!body.firstName || !body.lastName || !body.email) {
      setAdmin(false);
      return;
    }

    try {
      const r = await fetch(API + "/api/admin-eligible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setAdmin(!!d.eligible);
    } catch {
      setAdmin(false);
    }
  }

  ["regFirstName", "regMiddleName", "regLastName", "regEmail"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", checkAdminEligibility);
  });

  // ===== Tabs =====
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

    // load dropdowns ONCE only
    await loadPositionsOnce();
    await loadProvincesOnce();
    checkAdminEligibility();
  });

  // ===== LOGIN =====
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
    if (!d.success) return showMsg(loginMsg, d.message, "error");

    localStorage.setItem("email", loginEmail.value.trim());
    localStorage.setItem("role", d.role);
    location.href = d.role === "admin" ? "admin.html" : "user.html";
  });

  // ===== REGISTER =====
  registerForm && (registerForm.onsubmit = async (e) => {
    e.preventDefault();
    hideMsg(regMsg);

    // ensure dropdowns loaded (in case user directly opens Register)
    await loadPositionsOnce();
    await loadProvincesOnce();

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
    if (!d.success) return showMsg(regMsg, d.message, "error");

    showMsg(regMsg, "Account created successfully!", "success");
    registerForm.reset();
  });
});
