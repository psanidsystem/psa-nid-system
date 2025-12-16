document.addEventListener("DOMContentLoaded", () => {
  const API = location.origin;

  // Tabs
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  const loginMsg = document.getElementById("loginMsg");
  const regMsg = document.getElementById("regMsg");

  // Login inputs
  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");

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

  // OTP UI
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

  function showMsg(el, text, type) {
    el.textContent = text;
    el.className = "msg " + type;
    el.classList.remove("hidden");
  }
  function hideMsg(el) {
    el.classList.add("hidden");
    el.textContent = "";
  }

  function maskEmail(email) {
    const [u, d] = String(email).split("@");
    if (!u || !d) return email;
    if (u.length <= 2) return "*@" + d;
    return u[0] + "*".repeat(u.length - 2) + u.slice(-1) + "@" + d;
  }

  function lockRegister(lock) {
    [
      regFirstName, regMiddleName, regLastName, regEmail, regViber,
      regPosition, regProvince, regPassword, regConfirm, regRole
    ].forEach(el => el && (el.disabled = !!lock));
  }

  // ===== Tabs =====
  loginTab.onclick = () => {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    otpWrap.classList.add("hidden");
    hideMsg(loginMsg); hideMsg(regMsg); hideMsg(otpMsg);
  };

  registerTab.onclick = () => {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");
    registerForm.style.display = "block";
    loginForm.style.display = "none";
    otpWrap.classList.add("hidden");
    hideMsg(loginMsg); hideMsg(regMsg); hideMsg(otpMsg);
    loadProvinces();
    loadPositions();
    checkAdminEligibility();
  };

  // ===== Viber formatting (digits only max 11, spaces for display) =====
  function formatViber(d) {
    return d.replace(/^(\d{4})(\d{3})(\d{0,4}).*/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(" ")
    );
  }
  function normalizeViber() {
    let d = regViber.value.replace(/\D/g, "");
    if (d.startsWith("9")) d = "0" + d;
    if (d.length > 0 && !d.startsWith("09")) d = "09" + d.replace(/^0+/, "").replace(/^9/, "");
    d = d.slice(0, 11);
    regViber.value = formatViber(d);
    regViber.classList.toggle("invalid", !(d.length === 11 && /^09\d{9}$/.test(d)));
  }
  regViber.addEventListener("input", normalizeViber);
  regViber.addEventListener("blur", normalizeViber);

  // ===== Dropdowns =====
  async function loadProvinces() {
    regProvince.innerHTML = `<option value="">-- Select Province --</option>`;
    const r = await fetch(API + "/api/provinces");
    const d = await r.json();
    (d.provinces || []).forEach(p => regProvince.innerHTML += `<option value="${p}">${p}</option>`);
  }
  async function loadPositions() {
    regPosition.innerHTML = `<option value="">-- Select Position --</option>`;
    const r = await fetch(API + "/api/positions");
    const d = await r.json();
    (d.positions || []).forEach(p => regPosition.innerHTML += `<option value="${p}">${p}</option>`);
  }

  // ===== Admin eligibility =====
  function setAdmin(show) {
    const note = document.getElementById("adminNote");
    [...regRole.options].forEach(o => { if (o.value === "admin") regRole.remove(o.index); });

    if (show) {
      regRole.innerHTML += `<option value="admin">Admin</option>`;
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
    if (!body.firstName || !body.lastName || !body.email) return setAdmin(false);

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

  // ===== OTP timer + resend cooldown =====
  let otpInterval = null;
  let resendInterval = null;
  let otpSeconds = 300;
  let resendSeconds = 30;

  function stopTimers() {
    otpInterval && clearInterval(otpInterval);
    resendInterval && clearInterval(resendInterval);
    otpInterval = null;
    resendInterval = null;
  }

  function startOtpCountdown() {
    otpSeconds = 300;
    otpTimerEl.textContent = "05:00";

    otpInterval && clearInterval(otpInterval);
    otpInterval = setInterval(() => {
      otpSeconds--;
      const m = String(Math.floor(otpSeconds / 60)).padStart(2, "0");
      const s = String(otpSeconds % 60).padStart(2, "0");
      otpTimerEl.textContent = `${m}:${s}`;

      if (otpSeconds <= 0) {
        clearInterval(otpInterval);
        otpTimerEl.textContent = "Expired";
      }
    }, 1000);
  }

  function startResendCooldown() {
    resendSeconds = 30;
    resendOtpBtn.disabled = true;
    resendCdEl.textContent = String(resendSeconds);

    resendInterval && clearInterval(resendInterval);
    resendInterval = setInterval(() => {
      resendSeconds--;
      resendCdEl.textContent = String(resendSeconds);

      if (resendSeconds <= 0) {
        clearInterval(resendInterval);
        resendOtpBtn.disabled = false;
        resendCdEl.textContent = "0";
      }
    }, 1000);
  }

  // ===== LOGIN =====
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    hideMsg(loginMsg);

    const r = await fetch(API + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail.value.trim(), password: loginPassword.value }),
    });
    const d = await r.json();
    if (!d.success) return showMsg(loginMsg, d.message, "error");

    localStorage.setItem("email", loginEmail.value.trim());
    localStorage.setItem("role", d.role);
    location.href = d.role === "admin" ? "admin.html" : "user.html";
  };

  // ===== REGISTER → SEND OTP (shows OTP section) =====
  registerForm.onsubmit = async (e) => {
    e.preventDefault();
    hideMsg(regMsg);
    hideMsg(otpMsg);

    const viberDigits = regViber.value.replace(/\D/g, "");
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
      province: regProvince.value,
    };

    try {
      lockRegister(true);

      const r = await fetch(API + "/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingReg.email }),
      });
      const d = await r.json();

      if (!d.success) {
        lockRegister(false);
        return showMsg(regMsg, d.message || "Failed to send OTP.", "error");
      }

      otpEmailText.textContent = maskEmail(pendingReg.email);
      otpCode.value = "";
      otpWrap.classList.remove("hidden");

      startOtpCountdown();
      startResendCooldown();

      showMsg(regMsg, "OTP sent. Please check your email (Spam/Promotions).", "success");
    } catch (err) {
      console.error(err);
      lockRegister(false);
      showMsg(regMsg, "Server error sending OTP.", "error");
    }
  };

  // ===== VERIFY OTP → CREATE ACCOUNT =====
  verifyOtpBtn.onclick = async () => {
    hideMsg(otpMsg);
    if (!pendingReg?.email) return showMsg(otpMsg, "No pending registration.", "error");

    const code = otpCode.value.trim();
    if (!/^\d{6}$/.test(code)) return showMsg(otpMsg, "OTP must be 6 digits.", "error");

    verifyOtpBtn.disabled = true;

    try {
      const vr = await fetch(API + "/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingReg.email, otp: code }),
      });
      const vd = await vr.json();
      if (!vd.success) {
        verifyOtpBtn.disabled = false;
        return showMsg(otpMsg, vd.message || "Invalid OTP.", "error");
      }

      const rr = await fetch(API + "/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingReg),
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
        loginTab.click();
      }, 1200);
    } catch (err) {
      console.error(err);
      verifyOtpBtn.disabled = false;
      lockRegister(false);
      showMsg(otpMsg, "Server error verifying OTP.", "error");
    }
  };

  // ===== RESEND OTP (cooldown on server + UI countdown) =====
  resendOtpBtn.onclick = async () => {
    hideMsg(otpMsg);
    if (!pendingReg?.email) return showMsg(otpMsg, "No pending registration.", "error");

    resendOtpBtn.disabled = true;

    try {
      const r = await fetch(API + "/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingReg.email }),
      });
      const d = await r.json();

      if (!d.success) {
        // if server says wait, keep disabled a bit
        showMsg(otpMsg, d.message || "Resend failed.", "error");
        // allow try again after 5 seconds if server refused
        setTimeout(() => (resendOtpBtn.disabled = false), 5000);
        return;
      }

      showMsg(otpMsg, "OTP resent. Please check your email.", "success");
      startOtpCountdown();
      startResendCooldown();
    } catch (err) {
      console.error(err);
      showMsg(otpMsg, "Server error resending OTP.", "error");
      setTimeout(() => (resendOtpBtn.disabled = false), 5000);
    }
  };

  // ===== Cancel OTP (back to edit) =====
  cancelOtpBtn.onclick = () => {
    pendingReg = null;
    otpWrap.classList.add("hidden");
    lockRegister(false);
    stopTimers();
    hideMsg(otpMsg);
    showMsg(regMsg, "OTP cancelled. You can edit details and try again.", "error");
  };
});
