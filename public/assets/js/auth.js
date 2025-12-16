document.addEventListener("DOMContentLoaded", () => {
  const API = location.origin;

  // Tabs + forms
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  const loginMsg = document.getElementById("loginMsg");
  const regMsg = document.getElementById("regMsg");

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

  // OTP
  const otpWrap = document.getElementById("otpWrap");
  const otpEmailText = document.getElementById("otpEmailText");
  const otpCode = document.getElementById("otpCode");
  const otpMsg = document.getElementById("otpMsg");
  const otpTimerEl = document.getElementById("otpTimer");
  const resendOtpBtn = document.getElementById("resendOtpBtn");
  const resendCdEl = document.getElementById("resendCd");
  const verifyOtpBtn = document.getElementById("verifyOtpBtn");
  const cancelOtpBtn = document.getElementById("cancelOtpBtn");

  let pendingReg = null;

  // ===== helpers =====
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

  function maskEmail(email) {
    const [u, d] = String(email || "").split("@");
    if (!u || !d) return email;
    if (u.length <= 2) return "*@" + d;
    return u[0] + "*".repeat(u.length - 2) + u.slice(-1) + "@" + d;
  }

  function lockRegister(lock) {
    [
      regFirstName, regMiddleName, regLastName, regEmail, regViber,
      regPosition, regProvince, regPassword, regConfirm, regRole
    ].forEach(el => { if (el) el.disabled = !!lock; });
  }

  // ===== dropdown loaders (FIXED) =====
  async function loadPositions() {
    if (!regPosition) return;
    regPosition.innerHTML = `<option value="">-- Select Position --</option>`;

    try {
      const r = await fetch(API + "/api/positions");
      const d = await r.json();
      (d.positions || []).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        regPosition.appendChild(opt);
      });
    } catch (e) {
      console.error("positions error:", e);
      showMsg(regMsg, "Unable to load Positions. Please refresh.", "error");
    }
  }

  async function loadProvinces() {
    if (!regProvince) return;
    regProvince.innerHTML = `<option value="">-- Select Province --</option>`;

    try {
      const r = await fetch(API + "/api/provinces");
      const d = await r.json();
      (d.provinces || []).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        regProvince.appendChild(opt);
      });
    } catch (e) {
      console.error("provinces error:", e);
      showMsg(regMsg, "Unable to load Provinces. Please refresh.", "error");
    }
  }

  // ===== admin eligibility =====
  function setAdmin(show) {
    if (!regRole || !adminNote) return;

    // remove admin option
    [...regRole.options].forEach(o => {
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
    if (!regFirstName || !regLastName || !regEmail) return setAdmin(false);

    const body = {
      firstName: regFirstName.value,
      middleName: regMiddleName?.value || "",
      lastName: regLastName.value,
      email: regEmail.value,
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
    const el = document.getElementById(id);
    el && el.addEventListener("input", checkAdminEligibility);
  });

  // ===== Viber formatter =====
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

  // ===== OTP timers =====
  let otpInterval = null;
  let resendInterval = null;

  function stopTimers() {
    otpInterval && clearInterval(otpInterval);
    resendInterval && clearInterval(resendInterval);
    otpInterval = null;
    resendInterval = null;
  }

  function startOtpCountdown() {
    if (!otpTimerEl) return;
    let seconds = 300;

    otpTimerEl.textContent = "05:00";
    otpInterval && clearInterval(otpInterval);

    otpInterval = setInterval(() => {
      seconds--;
      const m = String(Math.floor(seconds / 60)).padStart(2, "0");
      const s = String(seconds % 60).padStart(2, "0");
      otpTimerEl.textContent = `${m}:${s}`;
      if (seconds <= 0) {
        clearInterval(otpInterval);
        otpTimerEl.textContent = "Expired";
      }
    }, 1000);
  }

  function startResendCooldown() {
    if (!resendOtpBtn || !resendCdEl) return;

    let seconds = 30;
    resendOtpBtn.disabled = true;
    resendCdEl.textContent = String(seconds);

    resendInterval && clearInterval(resendInterval);
    resendInterval = setInterval(() => {
      seconds--;
      resendCdEl.textContent = String(seconds);
      if (seconds <= 0) {
        clearInterval(resendInterval);
        resendOtpBtn.disabled = false;
        resendCdEl.textContent = "0";
      }
    }, 1000);
  }

  // ===== Tabs UI =====
  loginTab && (loginTab.onclick = () => {
    loginTab.classList.add("active");
    registerTab && registerTab.classList.remove("active");
    loginForm && (loginForm.style.display = "block");
    registerForm && (registerForm.style.display = "none");
    otpWrap && otpWrap.classList.add("hidden");
    hideMsg(loginMsg); hideMsg(regMsg); hideMsg(otpMsg);
  });

  registerTab && (registerTab.onclick = async () => {
    registerTab.classList.add("active");
    loginTab && loginTab.classList.remove("active");
    registerForm && (registerForm.style.display = "block");
    loginForm && (loginForm.style.display = "none");
    otpWrap && otpWrap.classList.add("hidden");
    hideMsg(loginMsg); hideMsg(regMsg); hideMsg(otpMsg);

    // ✅ always load dropdowns when opening Register
    await loadPositions();
    await loadProvinces();
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
        password: loginPassword.value
      })
    });
    const d = await r.json();

    if (!d.success) return showMsg(loginMsg, d.message, "error");

    localStorage.setItem("email", loginEmail.value.trim());
    localStorage.setItem("role", d.role);
    location.href = d.role === "admin" ? "admin.html" : "user.html";
  });

  // ===== REGISTER → SEND OTP =====
  registerForm && (registerForm.onsubmit = async (e) => {
    e.preventDefault();
    hideMsg(regMsg);
    hideMsg(otpMsg);

    // ensure dropdowns loaded (in case user open register direct / refresh)
    if (regPosition && regPosition.options.length <= 1) await loadPositions();
    if (regProvince && regProvince.options.length <= 1) await loadProvinces();

    const viberDigits = (regViber?.value || "").replace(/\D/g, "");
    if (!/^09\d{9}$/.test(viberDigits)) return showMsg(regMsg, "Invalid Viber number.", "error");
    if (regPassword.value !== regConfirm.value) return showMsg(regMsg, "Passwords do not match.", "error");
    if (!regPosition.value || !regProvince.value || !regRole.value) return showMsg(regMsg, "Complete all required fields.", "error");

    pendingReg = {
      email: regEmail.value.trim().toLowerCase(),
      password: regPassword.value,
      role: regRole.value,
      firstName: regFirstName.value.trim(),
      middleName: regMiddleName.value.trim(),
      lastName: regLastName.value.trim(),
      viber: viberDigits,
      position: regPosition.value,
      province: regProvince.value
    };

    lockRegister(true);

    const r = await fetch(API + "/api/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingReg.email })
    });
    const d = await r.json();

    if (!d.success) {
      lockRegister(false);
      return showMsg(regMsg, d.message || "Failed to send OTP.", "error");
    }

    otpEmailText && (otpEmailText.textContent = maskEmail(pendingReg.email));
    otpCode && (otpCode.value = "");
    otpWrap && otpWrap.classList.remove("hidden");

    startOtpCountdown();
    startResendCooldown();

    showMsg(regMsg, "OTP sent. Please check email (Spam/Promotions).", "success");
  });

  // ===== VERIFY OTP =====
  verifyOtpBtn && (verifyOtpBtn.onclick = async () => {
    hideMsg(otpMsg);
    if (!pendingReg?.email) return showMsg(otpMsg, "No pending registration.", "error");

    const code = (otpCode?.value || "").trim();
    if (!/^\d{6}$/.test(code)) return showMsg(otpMsg, "OTP must be 6 digits.", "error");

    verifyOtpBtn.disabled = true;

    const vr = await fetch(API + "/api/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingReg.email, otp: code })
    });
    const vd = await vr.json();

    if (!vd.success) {
      verifyOtpBtn.disabled = false;
      return showMsg(otpMsg, vd.message || "Invalid OTP.", "error");
    }

    const rr = await fetch(API + "/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pendingReg)
    });
    const rd = await rr.json();

    if (!rd.success) {
      verifyOtpBtn.disabled = false;
      lockRegister(false);
      return showMsg(otpMsg, rd.message || "Registration failed.", "error");
    }

    showMsg(otpMsg, "✅ Account created successfully! You may now login.", "success");

    pendingReg = null;
    registerForm.reset();
    lockRegister(false);
    stopTimers();

    setTimeout(() => {
      otpWrap.classList.add("hidden");
      loginTab && loginTab.click();
    }, 1200);

    verifyOtpBtn.disabled = false;
  });

  // ===== RESEND OTP =====
  resendOtpBtn && (resendOtpBtn.onclick = async () => {
    hideMsg(otpMsg);
    if (!pendingReg?.email) return showMsg(otpMsg, "No pending registration.", "error");

    resendOtpBtn.disabled = true;

    const r = await fetch(API + "/api/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pendingReg.email })
    });
    const d = await r.json();

    if (!d.success) {
      showMsg(otpMsg, d.message || "Resend failed.", "error");
      setTimeout(() => (resendOtpBtn.disabled = false), 5000);
      return;
    }

    showMsg(otpMsg, "OTP resent. Please check your email.", "success");
    startOtpCountdown();
    startResendCooldown();
  });

  // ===== CANCEL OTP =====
  cancelOtpBtn && (cancelOtpBtn.onclick = () => {
    pendingReg = null;
    otpWrap && otpWrap.classList.add("hidden");
    lockRegister(false);
    stopTimers();
    hideMsg(otpMsg);
    showMsg(regMsg, "OTP cancelled. You may edit details and try again.", "error");
  });

  // ✅ EXTRA: if user refresh while on register view, still load dropdowns
  // (safe call; won't break anything)
  loadPositions();
  loadProvinces();
});
