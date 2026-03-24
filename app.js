// === API SETTINGS ===
const API_BASE_URL = "https://api_server_full_task-ssqsa23k.on-forge.com";

// === BINOM SETTINGS ===
const BINOM_DOMAIN = "https://clixtream.com";

const WATCH_SECONDS_REQUIRED = 30;
const PHONE_STRICT_REGEX = /^\+[1-9]\d{11,14}$/;

const params = new URLSearchParams(window.location.search);
const tracking = {
  pixelId: params.get("s3") || "",
  p1: params.get("p1") || "",
  fbclid: params.get("fbclid") || "",
  clickid: params.get("clickid") || "",
};

const video = document.getElementById("promoVideo");
const timerArea = document.getElementById("timerArea");
const timerValue = document.getElementById("timerValue");
const leadForm = document.getElementById("leadForm");
const statusMessage = document.getElementById("statusMessage");
const submitBtn = document.getElementById("submitBtn");

let watchedSeconds = 0;
let lastTime = 0;
let formUnlocked = false;
let binomEvent1Sent = false;
let leadTracked = false;

initPixel(tracking.pixelId);
setTimerLabel(WATCH_SECONDS_REQUIRED);

video.addEventListener("play", () => {
  lastTime = video.currentTime;
});

video.addEventListener("seeking", () => {
  lastTime = video.currentTime;
});

video.addEventListener("timeupdate", () => {
  if (formUnlocked || video.paused || video.seeking) {
    lastTime = video.currentTime;
    return;
  }

  const current = video.currentTime;
  const delta = current - lastTime;
  lastTime = current;

  // Count only natural playback movement, ignore large jumps from seeking.
  if (delta > 0 && delta <= 1.2) {
    watchedSeconds += delta;
    updateTimer();
  }
});

leadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  clearErrors();
  setStatus("", "");

  if (!leadForm.reportValidity()) {
    return;
  }

  const phoneValue = leadForm.phone.value.trim();
  if (!PHONE_STRICT_REGEX.test(phoneValue) || isLikelyFakePhone(phoneValue)) {
    setFieldError("phone", "Enter a real phone number in international format, example +14155552671.");
    setStatus("Please fix highlighted fields.", "error");
    return;
  }

  const payload = {
    first_name: leadForm.first_name.value.trim(),
    last_name: leadForm.last_name.value.trim(),
    email: leadForm.email.value.trim(),
    phone: phoneValue,
    p1: tracking.p1,
    fbclid: tracking.fbclid,
    pixel_id: tracking.pixelId,
  };

  submitBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = await safeJson(response);

    if (response.ok) {
      leadForm.classList.add("hidden");
      setStatus("Thanks. Your request is accepted.", "success");
      trackFacebook("Lead");
      fireBinomConversion();
      leadTracked = true;
      return;
    }

    if (response.status === 422 && body && body.errors) {
      showValidationErrors(body.errors);
      setStatus("Please fix highlighted fields.", "error");
      return;
    }

    if (response.status >= 500) {
      setStatus("Server error. Try again later.", "error");
      return;
    }

    setStatus("Request rejected. Check your form data.", "error");
  } catch (error) {
    setStatus("Connection error. Check API server and try again.", "error");
  } finally {
    if (!leadTracked) {
      submitBtn.disabled = false;
    }
  }
});

function updateTimer() {
  const remaining = Math.max(0, Math.ceil(WATCH_SECONDS_REQUIRED - watchedSeconds));
  setTimerLabel(remaining);

  if (!formUnlocked && watchedSeconds >= WATCH_SECONDS_REQUIRED) {
    unlockForm();
  }
}

function setTimerLabel(seconds) {
  timerValue.textContent = String(seconds);
}

function unlockForm() {
  formUnlocked = true;
  timerArea.classList.add("hidden");
  leadForm.classList.remove("hidden");
  trackFacebook("ViewContent");
  fireBinomEvent1();
}

function initPixel(pixelId) {
  if (!pixelId) {
    return;
  }

  if (window.fbq) {
    window.fbq("init", pixelId);
    window.fbq("track", "PageView");
    return;
  }

  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}

function trackFacebook(eventName) {
  if (!tracking.pixelId || !window.fbq) {
    return;
  }

  window.fbq("track", eventName);
}

function fireBinomEvent1() {
  if (binomEvent1Sent || !tracking.clickid) {
    return;
  }

  const img = new Image();
  img.src = `${BINOM_DOMAIN}/click?upd_clickid=${encodeURIComponent(tracking.clickid)}&event1=1`;
  binomEvent1Sent = true;
}

function fireBinomConversion() {
  if (!tracking.clickid) {
    return;
  }

  const img = new Image();
  img.src = `${BINOM_DOMAIN}/click?cnv_id=${encodeURIComponent(tracking.clickid)}`;
}

function showValidationErrors(errors) {
  Object.entries(errors).forEach(([field, messages]) => {
    const el = document.querySelector(`[data-error-for="${field}"]`);
    if (!el) return;
    el.textContent = Array.isArray(messages) && messages.length ? messages[0] : "Invalid value";
  });
}

function clearErrors() {
  document.querySelectorAll(".error").forEach((el) => {
    el.textContent = "";
  });
}

function setFieldError(field, message) {
  const el = document.querySelector(`[data-error-for="${field}"]`);
  if (el) {
    el.textContent = message;
  }
}

function setStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.classList.remove("success", "error");
  if (type) {
    statusMessage.classList.add(type);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

function isLikelyFakePhone(phone) {
  const digits = phone.replace(/^\+/, "");
  if (!digits) {
    return true;
  }

  if (/^(\d)\1+$/.test(digits)) {
    return true;
  }

  if (/(12345|23456|34567|45678|56789|98765|87654|76543|65432|54321)/.test(digits)) {
    return true;
  }

  return false;
}
