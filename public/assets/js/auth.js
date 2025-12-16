// =======================
// API
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

// OTP
const otpWrap = document.getElementById("otpWrap");
const otpCode = document.getElementById("otpCode");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const otpMsg = document.getElementById("otpMsg");
const otpEmailText = document.getElementById("otpEmailText");
const otpTimerEl = document.getElementById("otpTimer");
const resendOtpBtn = document.getElementById("resendOtpBtn");

// =======================
// HELPERS
// =======================
function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "msg " + type;
  el.classList.remove("hidden");
}
function hideMsg(el) {
  el.classList.add("hidden");
  el.textContent = "";
}
function showOtpMsg(text, type) {
  showMsg(otpMsg, text, type);
}
function hideOtpMsg() {
  hideMsg(otpMsg);
}

// =======================
// MASK EMAIL
// =======================
function maskEmail(email) {
  const [u, d] = email.split("@");
  if (u.length <= 2) return "*@" + d;
  return u[0] + "*".repeat(u.length - 2) + u.slice(-1) + "@" + d;
}

// =======================
// OTP TIMER
// =======================
let otpInterval = null;
let otpSeconds = 300;

function startOtpTimer() {
  otpSeconds = 300;
  resendOtpBtn.disabled = true;

  otpInterval && clearInterval(otpInterval);
  otpInterval = setInterval(() => {
    otpSeconds--;
    const m = String(Math.floor(otpSeconds / 60)).padStart(2, "0");
    const s = String(otpSeconds % 60).padStart(2, "0");
    otpTimerEl.textContent = `${m}:${s}`;

    if (otpSeconds <= 0) {
      clearInterval(otpInterval);
      resendOtpBtn.disabled = false;
      otpTimerEl.textContent = "Expired";
    }
  }, 1000);
}

// =======================
// STATE
// =======================
let pendingReg = null;

// =======================
// TABS
// =======================
loginTab.onclick = () => {
  loginTab.classList.add("active");
  registerTab.classList.remove("active");
  loginForm.style.display = "block";
  registerForm.style.display = "none";
  otpWrap.classList.add("hidden");
};

registerTab.onclick = () => {
  registerTab.classList.add("active");
  loginTab.classList.remove("active");
  registerForm.style.display = "block";
  loginForm.style.display = "none";
};

// =======================
// REGISTER → SEND OTP
// =======================
registerForm.onsubmit = async (e) => {
  e.preventDefault();
  hideMsg(regMsg);
  hideOtpMsg();

  const viber = regViber.value.replace(/\D/g, "");
  if (!/^09\d{9}$/.test(viber)) {
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
    viber,
    position: regPosition.value,
    province: regProvince.value,
  };

  const r = await fetch(API + "/api/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: pendingReg.email }),
  });
  const d = await r.json();
  if (!d.success) {
    return showMsg(regMsg, d.message || "Failed to send OTP.", "error");
  }

  otpEmailText.textContent = maskEmail(pendingReg.email);
  otpWrap.classList.remove("hidden");
  startOtpTimer();

  showMsg(regMsg, "OTP sent. Please check your email.", "success");
};

// =======================
// VERIFY OTP → CREATE ACCOUNT
// =======================
verifyOtpBtn.onclick = async () => {
  hideOtpMsg();
  const otp = otpCode.value.trim();
  if (!/^\d{6}$/.test(otp)) {
    return showOtpMsg("OTP must be 6 digits.", "error");
  }

  const vr = await fetch(API + "/api/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: pendingReg.email, otp }),
  });
  const vd = await vr.json();
  if (!vd.success) {
    return showOtpMsg(vd.message || "Invalid OTP.", "error");
  }

  const rr = await fetch(API + "/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pendingReg),
  });
  const rd = await rr.json();
  if (!rd.success) {
    return showOtpMsg(rd.message || "Registration failed.", "error");
  }

  showOtpMsg("✅ Account successfully created!", "success");
  pendingReg = null;
  registerForm.reset();

  setTimeout(() => {
    otpWrap.classList.add("hidden");
    loginTab.click();
  }, 1200);
};

// =======================
// RESEND OTP (Cooldown handled by timer)
// =======================
resendOtpBtn.onclick = async () => {
  if (!pendingReg) return;

  const r = await fetch(API + "/api/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: pendingReg.email }),
  });
  const d = await r.json();
  if (!d.success) {
    return showOtpMsg("Failed to resend OTP.", "error");
  }

  showOtpMsg("New OTP sent.", "success");
  startOtpTimer();
};
