/**
 * ==============================================================================
 * HỆ THỐNG KIỂM TRA TRẮC NGHIỆM TRỰC TUYẾN - LOGIC CHÍNH (APP.JS)
 * ==============================================================================
 * Viết bằng JavaScript thuần (ES6+), tối ưu hóa tốc độ, hoạt động mượt mà.
 */

// Trạng thái toàn cục của bài thi
const QuizState = {
  rawQuestions: [],        // Dữ liệu gốc nạp từ file questions của tuần đã chọn
  activeQuestions: [],     // Danh sách câu hỏi sau khi xáo trộn cho lượt thi hiện tại
  currentIndex: 0,         // Vị trí câu hỏi hiện tại (bắt đầu từ 0)
  studentName: "",         // Họ và tên học sinh
  studentClass: "",        // Lớp hoặc MSSV
  username: "",            // Tên tài khoản nếu học sinh đã đăng nhập
  selectedWeekId: 1,       // Tuần đang chọn (mặc định Tuần 1)
  currentWeekInfo: null,   // Thông tin tuần hiện tại từ CONFIG.WEEKS
  answersLog: [],          // Lưu lịch sử làm bài: { questionId, selectedOption, correctAnswer, isCorrect, pointsEarned }
  totalPossiblePoints: 0,  // Tổng điểm tối đa của đề thi
  pointsEarned: 0,         // Tổng điểm đạt được
  timerInterval: null,     // Bộ đếm thời gian
  secondsRemaining: 0,     // Số giây làm bài còn lại
  totalDurationSeconds: 0, // Tổng thời gian quy định (giây)
  isSubmitting: false,     // Cờ ngăn chặn nộp trùng lặp
  startTime: null,         // Thời điểm bắt đầu
  endTime: null,           // Thời điểm kết thúc
  violationCount: 0,       // Số lần rời màn hình làm bài thi
  isExamActive: false,     // Đang trong thời gian làm bài thi
  isAutoSubmitDueToCheat: false, // Bị thu bài tự động do rời màn hình quá số lần quy định
  isPracticeMode: false,   // Đang làm bài ở chế độ ôn tập kiến thức (lần 2 trở đi)
  officialAttempt: null    // Thông tin kết quả thi chính thức lần 1 nếu đã từng thi
};

// ==============================================================================
// TRẠNG THÁI VẬN HÀNH QUẢN TRỊ VIÊN (ADMIN STATE)
// ==============================================================================
const AdminState = {
  unlockAllWeeks: Boolean(CONFIG.ADMIN && CONFIG.ADMIN.unlockAllWeeks)
};

// ==============================================================================
// KHỞI TẠO ÂM THANH (WEB AUDIO API)
// ==============================================================================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Phát âm thanh chúc mừng khi chọn đúng
 */
function playCorrectSound() {
  if (!CONFIG.QUIZ.enableSound) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Nốt 1 (C5 - 523Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Nốt 2 (E5 - 659Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(659.25, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);
  } catch (e) {
    console.warn("Lỗi phát âm thanh đúng:", e);
  }
}

/**
 * Phát âm thanh cảnh báo khi chọn sai
 */
function playWrongSound() {
  if (!CONFIG.QUIZ.enableSound) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.3);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) {
    console.warn("Lỗi phát âm thanh sai:", e);
  }
}

/**
 * Phát âm thanh còi báo động khẩn cấp khi học sinh vi phạm chuyển tab
 */
function playAlarmSound() {
  if (!CONFIG.ANTI_CHEAT || !CONFIG.ANTI_CHEAT.enableSoundAlert) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Chuỗi 3 hồi bíp cảnh báo dồn dập
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, now + i * 0.16); // A5
      osc.frequency.exponentialRampToValueAtTime(440, now + i * 0.16 + 0.12);
      gain.gain.setValueAtTime(0.25, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.16 + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.14);
    }
  } catch (e) {
    console.warn("Lỗi phát còi báo động:", e);
  }
}

// ==============================================================================
// HỆ THỐNG POPUP MODAL XÁC NHẬN & THÔNG BÁO CAO CẤP (THAY THẾ CONFIRM & ALERT TRÌNH DUYỆT)
// ==============================================================================
let appDialogResolve = null;

/**
 * Hiển thị Popup Modal Xác Nhận (Thay thế hoàn toàn window.confirm)
 * Trả về Promise<boolean> (true nếu người dùng bấm Xác nhận / Đồng ý, false nếu bấm Hủy)
 * @param {Object|string} options
 * @returns {Promise<boolean>}
 */
function showAppConfirm(options) {
  if (typeof options === "string") {
    let type = "question";
    let title = "XÁC NHẬN THAO TÁC";
    if (options.includes("⚠️") || options.toLowerCase().includes("cảnh báo") || options.toLowerCase().includes("khóa")) {
      type = options.toLowerCase().includes("xóa") || options.toLowerCase().includes("khóa tất cả") ? "danger" : "warning";
      title = "CẢNH BÁO XÁC NHẬN";
    }
    options = {
      title,
      message: options,
      type,
      confirmText: "Xác Nhận",
      cancelText: "Hủy Bỏ"
    };
  }

  const title = options.title || "XÁC NHẬN THAO TÁC";
  const message = options.message || "";
  const type = options.type || "question";
  const confirmText = options.confirmText || "Xác Nhận";
  const cancelText = options.cancelText || "Hủy Bỏ";

  return openAppDialogModal({
    isConfirm: true,
    title,
    message,
    type,
    confirmText,
    cancelText
  });
}

/**
 * Hiển thị Popup Modal Thông Báo (Thay thế hoàn toàn window.alert)
 * Trả về Promise<void>
 * @param {Object|string} options
 * @returns {Promise<void>}
 */
function showAppAlert(options) {
  if (typeof options === "string") {
    let type = "info";
    let title = "THÔNG BÁO";
    const lower = options.toLowerCase();
    if (options.includes("✓") || lower.includes("thành công")) {
      type = "success";
      title = "THÀNH CÔNG";
    } else if (options.includes("⚠️") || options.includes("🔒") || lower.includes("khóa") || lower.includes("cảnh báo")) {
      type = "warning";
      title = lower.includes("khóa") ? "BÀI THI ĐANG BỊ KHÓA" : "CẢNH BÁO";
    } else if (lower.includes("lỗi") || lower.includes("thất bại")) {
      type = "danger";
      title = "THÔNG BÁO LỖI";
    }
    options = {
      title,
      message: options,
      type,
      confirmText: "Đã Hiểu"
    };
  }

  const title = options.title || "THÔNG BÁO";
  const message = options.message || "";
  const type = options.type || "info";
  const confirmText = options.confirmText || "Đã Hiểu";

  return openAppDialogModal({
    isConfirm: false,
    title,
    message,
    type,
    confirmText,
    cancelText: ""
  });
}

/**
 * Mở modal popup với nội dung và cấu hình chỉ định
 */
function openAppDialogModal({ isConfirm, title, message, type, confirmText, cancelText }) {
  return new Promise((resolve) => {
    appDialogResolve = resolve;

    const modal = document.getElementById("app-dialog-modal");
    const card = document.getElementById("app-dialog-card");
    const iconBox = document.getElementById("app-dialog-icon-box");
    const titleEl = document.getElementById("app-dialog-title");
    const messageEl = document.getElementById("app-dialog-message");
    const btnCancel = document.getElementById("btn-app-dialog-cancel");
    const btnConfirm = document.getElementById("btn-app-dialog-confirm");
    const cancelTextEl = document.getElementById("app-dialog-cancel-text");
    const confirmTextEl = document.getElementById("app-dialog-confirm-text");

    if (!modal || !card) {
      console.warn("app-dialog-modal element not found, falling back to native dialogs");
      if (isConfirm) {
        resolve(window.confirm(message.replace(/<[^>]*>?/gm, '')));
      } else {
        window.alert(message.replace(/<[^>]*>?/gm, ''));
        resolve();
      }
      return;
    }

    // Thiết lập tiêu đề và nội dung
    if (titleEl) titleEl.textContent = title;
    
    // Nếu message có chứa thẻ HTML thì render HTML, nếu không chuyển đổi \n thành <br>
    if (messageEl) {
      if (/<[a-z][\s\S]*>/i.test(message)) {
        messageEl.innerHTML = message;
      } else {
        messageEl.innerHTML = escapeHtml(message).replace(/\n/g, "<br>");
      }
    }

    // Thiết lập Icon theo chủ đề
    if (iconBox) {
      iconBox.className = `app-dialog-icon-box type-${type}`;
      if (type === "question") {
        iconBox.innerHTML = `
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>`;
      } else if (type === "warning") {
        iconBox.innerHTML = `
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>`;
      } else if (type === "danger") {
        iconBox.innerHTML = `
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>`;
      } else if (type === "success") {
        iconBox.innerHTML = `
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>`;
      } else {
        iconBox.innerHTML = `
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>`;
      }
    }

    // Thiết lập các nút bấm
    const themeClass = type === "danger" ? "theme-danger" : (type === "warning" ? "theme-warning" : (type === "success" ? "theme-success" : "theme-primary"));

    if (btnConfirm) {
      btnConfirm.className = `app-dialog-btn btn-confirm ${themeClass}`;
      if (confirmTextEl) confirmTextEl.textContent = confirmText;
    }

    if (btnCancel) {
      if (isConfirm) {
        btnCancel.style.display = "inline-flex";
        if (cancelTextEl) cancelTextEl.textContent = cancelText;
      } else {
        btnCancel.style.display = "none";
      }
    }

    card.classList.remove("dialog-closing");
    modal.style.display = "flex";
    if (btnConfirm) btnConfirm.focus();
  });
}

/**
 * Đóng popup modal và trả về kết quả
 */
function closeAppDialog(result) {
  const modal = document.getElementById("app-dialog-modal");
  const card = document.getElementById("app-dialog-card");
  if (!modal) {
    if (appDialogResolve) {
      const fn = appDialogResolve;
      appDialogResolve = null;
      fn(result);
    }
    return;
  }

  if (card) {
    card.classList.add("dialog-closing");
    setTimeout(() => {
      modal.style.display = "none";
      card.classList.remove("dialog-closing");
      if (appDialogResolve) {
        const fn = appDialogResolve;
        appDialogResolve = null;
        fn(result);
      }
    }, 180);
  } else {
    modal.style.display = "none";
    if (appDialogResolve) {
      const fn = appDialogResolve;
      appDialogResolve = null;
      fn(result);
    }
  }
}

/**
 * Khởi tạo các sự kiện cho popup dialog
 */
function initAppDialogListeners() {
  const modal = document.getElementById("app-dialog-modal");
  const btnCancel = document.getElementById("btn-app-dialog-cancel");
  const btnConfirm = document.getElementById("btn-app-dialog-confirm");
  const btnClose = document.getElementById("btn-app-dialog-close");
  const backdrop = document.getElementById("app-dialog-backdrop");

  if (btnConfirm) {
    btnConfirm.addEventListener("click", () => closeAppDialog(true));
  }
  if (btnCancel) {
    btnCancel.addEventListener("click", () => closeAppDialog(false));
  }
  if (btnClose) {
    btnClose.addEventListener("click", () => closeAppDialog(false));
  }
  if (backdrop) {
    backdrop.addEventListener("click", () => closeAppDialog(false));
  }

  // Phím tắt bàn phím: Enter = Confirm, Esc = Cancel
  window.addEventListener("keydown", (e) => {
    if (modal && modal.style.display !== "none") {
      if (e.key === "Escape") {
        e.preventDefault();
        closeAppDialog(false);
      } else if (e.key === "Enter" && !e.shiftKey) {
        const active = document.activeElement;
        if (!active || active.tagName !== "TEXTAREA") {
          e.preventDefault();
          closeAppDialog(true);
        }
      }
    }
  });

  // Tự động chuyển hướng toàn bộ lệnh window.alert sang popup modal cao cấp
  window.nativeAlert = window.alert;
  window.alert = function(msg) {
    showAppAlert(msg);
  };
}

// ==============================================================================
// HỆ THỐNG QUẢN LÝ LỊCH SỬ THI & BẢO LƯU ĐIỂM CHÍNH THỨC LẦN 1
// ==============================================================================
function getUserHistoryKey(username) {
  const safeUser = (username || "guest").toLowerCase().trim();
  return `quiz_history_${safeUser}`;
}

function getUserOfficialAttempts(username) {
  try {
    const raw = localStorage.getItem(getUserHistoryKey(username));
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function getOfficialAttempt(username, weekId) {
  const attempts = getUserOfficialAttempts(username);
  return attempts[weekId] || null;
}

function saveOfficialAttempt(username, weekId, data) {
  try {
    const key = getUserHistoryKey(username);
    const attempts = getUserOfficialAttempts(username);
    // QUY TẮC BẤT DI BẤT DỊCH: CHỈ GHI NHẬN LẦN ĐẦU TIÊN (KHÔNG GHI ĐÈ ĐIỂM SỐ CHÍNH THỨC)
    if (!attempts[weekId]) {
      attempts[weekId] = {
        ...data,
        firstRecordedAt: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
      };
      localStorage.setItem(key, JSON.stringify(attempts));
      console.log(`[Quiz History] Đã khóa điểm chính thức lần 1 cho tài khoản '${username}' - Tuần ${weekId}: ${data.score} điểm`);

      // Tự động cập nhật bảng xếp hạng tức thì
      if (typeof renderHomeRankingWidget === "function") {
        renderHomeRankingWidget();
      }
    }
  } catch (e) {
    console.error("Lỗi lưu lịch sử thi:", e);
  }
}

// ==============================================================================
// QUẢN LÝ ĐÓNG / MỞ TỪNG TUẦN HỌC & ĐỒNG BỘ ĐÁM MÂY (WEEKS ACCESS CONTROL & CLOUD SYNC)
// ==============================================================================
const WEEKS_STORAGE_KEY = "quiz_custom_weeks_status";
const WEEKS_TIMESTAMP_KEY = "quiz_custom_weeks_last_updated";

function getCustomWeeksStatus() {
  try {
    const raw = localStorage.getItem(WEEKS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (parsed.weeks && typeof parsed.weeks === "object") {
        return parsed.weeks;
      }
      return parsed;
    }
    return null;
  } catch (e) {
    return null;
  }
}

function getLocalWeeksTimestamp() {
  try {
    const ts = localStorage.getItem(WEEKS_TIMESTAMP_KEY);
    if (ts) return Number(ts);
    const raw = localStorage.getItem(WEEKS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.timestamp) return Number(parsed.timestamp);
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

function isWeekUnlocked(week) {
  if (!week) return false;
  // Nếu tuần không có file câu hỏi (chưa cập nhật đề thi), luôn luôn khóa
  if (!week.file || !week.file.trim()) {
    return false;
  }
  const custom = getCustomWeeksStatus();
  if (custom && typeof custom[week.id] === "boolean") {
    return custom[week.id];
  }
  return Boolean(week.isUnlocked);
}

function saveAndSyncWeeksStatus(customState) {
  const timestamp = Date.now();
  const payload = {
    timestamp: timestamp,
    weeks: customState
  };

  // 1. Lưu ngay lập tức vào LocalStorage (Đảm bảo F5 luôn giữ trạng thái mới nhất)
  localStorage.setItem(WEEKS_STORAGE_KEY, JSON.stringify(customState));
  localStorage.setItem(WEEKS_TIMESTAMP_KEY, String(timestamp));

  // 2. Gửi đồng bộ lên Vercel Serverless Function (/api/weeks)
  fetch("/api/weeks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => {});

  // 3. Đồng bộ trực tiếp lên Cloud Store (Hỗ trợ CORS 100% không bị chặn preflight)
  if (CONFIG.DIRECT_CLOUD_STORE_URL) {
    fetch(CONFIG.DIRECT_CLOUD_STORE_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Quiz_App_Weeks_Status",
        data: payload
      })
    }).catch(err => {
      console.warn("Lỗi đồng bộ DIRECT_CLOUD_STORE_URL:", err);
    });
  }
}

function setWeekUnlockedStatus(weekId, status) {
  const custom = getCustomWeeksStatus() || {};
  custom[weekId] = Boolean(status);
  saveAndSyncWeeksStatus(custom);
}

function unlockAllWeeksGlobal() {
  const custom = {};
  (CONFIG.WEEKS || []).forEach(w => {
    custom[w.id] = true;
  });
  saveAndSyncWeeksStatus(custom);
}

function lockAllWeeksGlobal() {
  const custom = {};
  (CONFIG.WEEKS || []).forEach(w => {
    custom[w.id] = false;
  });
  saveAndSyncWeeksStatus(custom);
}

function resetWeeksStatusToDefault() {
  const custom = {};
  (CONFIG.WEEKS || []).forEach(w => {
    custom[w.id] = Boolean(w.isUnlocked);
  });
  saveAndSyncWeeksStatus(custom);
}

/**
 * Tự động đồng bộ trạng thái tuần thi từ Cloud về thiết bị của học sinh
 */
async function syncWeeksStatusFromCloud() {
  let cloudPayload = null;

  // 1. Thử lấy từ Vercel serverless /api/weeks
  try {
    const res = await fetch("/api/weeks?v=" + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data && (data.weeks || typeof data === "object")) {
        cloudPayload = data;
      }
    }
  } catch (e) {}

  // 2. Thử lấy từ DIRECT_CLOUD_STORE_URL (restful-api.dev)
  if (!cloudPayload && CONFIG.DIRECT_CLOUD_STORE_URL) {
    try {
      const res = await fetch(CONFIG.DIRECT_CLOUD_STORE_URL + "?v=" + Date.now());
      if (res.ok) {
        const json = await res.json();
        if (json && json.data && (json.data.weeks || typeof json.data === "object")) {
          cloudPayload = json.data;
        }
      }
    } catch (e) {}
  }

  // 3. Fallback lấy từ extendsclass.com
  if (!cloudPayload && CONFIG.CLOUD_WEEKS_STATUS_URL) {
    try {
      const res = await fetch(CONFIG.CLOUD_WEEKS_STATUS_URL + "?v=" + Date.now());
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === "object") {
          cloudPayload = json;
        }
      }
    } catch (e) {}
  }

  if (!cloudPayload) return;

  const cloudTimestamp = cloudPayload.timestamp ? Number(cloudPayload.timestamp) : 0;
  const cloudWeeks = cloudPayload.weeks || cloudPayload;
  const localTimestamp = getLocalWeeksTimestamp();

  // BẢO VỆ TUYỆT ĐỐI KHÔNG BỊ MẤT TRẠNG THÁI KHI F5:
  // Nếu máy cục bộ vừa có thao tác Admin mới hơn đám mây (localTimestamp > cloudTimestamp),
  // TUYỆT ĐỐI KHÔNG để cloud ghi đè lên máy! Đẩy ngược dữ liệu local mới hơn lên đám mây để cập nhật.
  if (localTimestamp > cloudTimestamp) {
    const localCustom = getCustomWeeksStatus();
    if (localCustom) {
      saveAndSyncWeeksStatus(localCustom);
    }
    return;
  }

  // Nếu dữ liệu đám mây mới hơn hoặc bằng: Đồng bộ vào máy
  if (cloudWeeks && typeof cloudWeeks === "object") {
    const currentLocal = localStorage.getItem(WEEKS_STORAGE_KEY);
    const newStr = JSON.stringify(cloudWeeks);
    if (currentLocal !== newStr) {
      localStorage.setItem(WEEKS_STORAGE_KEY, newStr);
      localStorage.setItem(WEEKS_TIMESTAMP_KEY, String(cloudTimestamp));
      initWeeksSelector();
      if (QuizState.selectedWeekId) {
        selectWeek(QuizState.selectedWeekId);
      }
    }
  }
}

let adminToastTimeout = null;
function showAdminToast(msg, type = "success") {
  const toast = document.getElementById("admin-toast");
  if (!toast) return;
  toast.className = `admin-toast ${type} show`;
  toast.innerHTML = `<span>${msg}</span>`;
  toast.style.display = "flex";

  if (adminToastTimeout) clearTimeout(adminToastTimeout);
  adminToastTimeout = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.style.display = "none";
    }, 300);
  }, 2400);
}

// ==============================================================================
// KHỞI TẠO BỘ CHỌN 15 TUẦN HỌC (WEEKS SELECTOR) & HIỂN THỊ ĐIỂM LẦN 1
// ==============================================================================
function initWeeksSelector() {
  const container = document.getElementById("weeks-grid");
  if (!container) return;
  container.innerHTML = "";

  const isAdmin = AuthState.currentUser && AuthState.currentUser.role === "admin";
  const username = AuthState.currentUser ? AuthState.currentUser.username : "";
  const passingScore = (CONFIG.QUIZ && CONFIG.QUIZ.passingScore) || 95;
  const weeks = CONFIG.WEEKS || [];

  weeks.forEach(week => {
    // Trạng thái mở/khóa thực tế của tuần
    const unlocked = isWeekUnlocked(week);
    const card = document.createElement("div");
    card.className = `week-card ${unlocked ? "unlocked" : "locked"} ${week.id === QuizState.selectedWeekId ? "selected" : ""}`;
    card.dataset.id = week.id;

    // Kiểm tra xem tài khoản này đã có điểm chính thức lần 1 cho tuần này chưa
    const officialAttempt = username ? getOfficialAttempt(username, week.id) : null;
    let badgeHtml = "";

    if (officialAttempt) {
      const isPassed = officialAttempt.score >= passingScore;
      badgeHtml = `
        <span class="week-status-badge ${isPassed ? 'score-passed' : 'score-failed'}" title="Điểm thi chính thức lần 1: ${officialAttempt.score}/100đ">
          ${officialAttempt.score}đ ${isPassed ? '✓' : ''}
        </span>
      `;
    } else {
      badgeHtml = `
        <span class="week-status-badge ${unlocked ? 'open' : 'lock'}">
          ${unlocked ? 'Mở' : 'Khóa'}
        </span>
      `;
    }

    // Nút chuyển đổi nhanh Mở/Khóa trên góc thẻ (dành riêng cho Quản Trị Viên)
    const adminToggleHtml = isAdmin ? `
      <button type="button" class="week-card-admin-toggle ${unlocked ? 'is-open' : 'is-closed'}"
              title="Quản Trị Viên: Nhấp để ${unlocked ? 'KHÓA' : 'MỞ'} riêng ${week.name}">
        ${unlocked ? '🔓' : '🔒'}
      </button>
    ` : '';

    card.innerHTML = `
      ${adminToggleHtml}
      <div class="week-icon-box">
        ${unlocked ? `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        ` : `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        `}
      </div>
      <span class="week-name">${week.name}</span>
      ${badgeHtml}
    `;

    // Gắn sự kiện nút toggle nhanh cho Admin
    if (isAdmin) {
      const toggleBtn = card.querySelector(".week-card-admin-toggle");
      if (toggleBtn) {
        toggleBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const newStatus = !unlocked;
          const actionWord = newStatus ? "MỞ KHÓA" : "KHÓA LẠI";

          const confirmed = await showAppConfirm({
            title: newStatus ? "XÁC NHẬN MỞ KHÓA TUẦN THI" : "CẢNH BÁO KHÓA TUẦN THI",
            message: newStatus
              ? `Bạn có chắc chắn muốn <strong>MỞ KHÓA</strong> <strong>${escapeHtml(week.name)} (${escapeHtml(week.title)})</strong> cho học sinh vào thi không?`
              : `Bạn có chắc chắn muốn <strong>KHÓA</strong> <strong>${escapeHtml(week.name)} (${escapeHtml(week.title)})</strong> không?<br><span class="dialog-highlight-warn">⚠️ Khi khóa, tất cả học sinh sẽ bị chặn ngay lập tức và không thể vào thi tuần này!</span>`,
            type: newStatus ? "question" : "warning",
            confirmText: newStatus ? "Mở Khóa Ngay" : "Khóa Ngay",
            cancelText: "Hủy Bỏ"
          });

          if (!confirmed) {
            return;
          }

          setWeekUnlockedStatus(week.id, newStatus);
          initWeeksSelector();
          if (QuizState.selectedWeekId === week.id) {
            selectWeek(week.id);
          }
          await showAppAlert({
            title: "CẬP NHẬT THÀNH CÔNG",
            message: `Đã <strong>${actionWord}</strong> <strong>${escapeHtml(week.name)} (${escapeHtml(week.title)})</strong> thành công.<br>Cài đặt đã có hiệu lực ngay lập tức cho toàn bộ học sinh.`,
            type: "success"
          });
        });
      }
    }

    card.addEventListener("click", async () => {
      if (unlocked || isAdmin) {
        selectWeek(week.id);
      } else {
        playWrongSound();
        await showAppAlert({
          title: "BÀI THI ĐANG BỊ KHÓA",
          message: `<strong>${escapeHtml(week.name)} (${escapeHtml(week.title)})</strong> hiện đang bị khóa bởi Quản trị viên.<br><br>Học sinh chưa thể vào làm bài tuần này. Vui lòng quay lại sau!`,
          type: "warning"
        });
      }
    });

    container.appendChild(card);
  });

  // Chọn tuần mặc định ban đầu: Ưu tiên tuần đang mở và có sẵn file đề thi
  const unlockedWeeksWithData = weeks.filter(w => isWeekUnlocked(w) && w.file && w.file.trim());
  let targetWeekId = QuizState.selectedWeekId || 1;

  if (!isAdmin) {
    const currentWeek = weeks.find(w => w.id === targetWeekId);
    if (!currentWeek || !isWeekUnlocked(currentWeek) || !currentWeek.file || !currentWeek.file.trim()) {
      if (unlockedWeeksWithData.length > 0) {
        targetWeekId = unlockedWeeksWithData[0].id;
      } else {
        const firstUnlocked = weeks.find(w => isWeekUnlocked(w));
        targetWeekId = firstUnlocked ? firstUnlocked.id : 1;
      }
    }
  }

  selectWeek(targetWeekId);
}

/**
 * Cập nhật khung hiển thị điểm thi chính thức lần 1 và nút bấm ở trang chủ
 */
function updateOfficialScoreDisplay(weekId) {
  const username = AuthState.currentUser ? AuthState.currentUser.username : "";
  const officialAttempt = username ? getOfficialAttempt(username, weekId) : null;
  const banner = document.getElementById("official-score-banner");
  const noticeText = document.getElementById("exam-attempt-notice-text");
  const btnStart = document.getElementById("btn-start");
  const week = (CONFIG.WEEKS || []).find(w => w.id === weekId);
  const weekName = week ? week.name : `Tuần ${weekId}`;

  if (officialAttempt && banner) {
    const passingScore = (CONFIG.QUIZ && CONFIG.QUIZ.passingScore) || 95;
    const isPassed = officialAttempt.score >= passingScore;
    banner.className = `official-score-banner ${isPassed ? '' : 'score-failed'}`;
    banner.style.display = "block";
    banner.innerHTML = `
      <div class="official-score-header">
        <div class="official-score-title-box">
          <span class="official-trophy-icon">${isPassed ? '🏆' : '💡'}</span>
          <span class="official-score-heading">ĐIỂM THI CHÍNH THỨC LẦN 1 (${weekName.toUpperCase()})</span>
        </div>
        <span class="official-score-badge">${isPassed ? '✓ ĐÃ ĐẠT (≥ ' + passingScore + 'đ)' : 'CHƯA ĐẠT (YÊU CẦU ≥ ' + passingScore + 'đ)'}</span>
      </div>
      <div class="official-score-stats-row">
        <span class="official-score-number">${officialAttempt.score}</span>
        <span class="official-score-denom">/ 100 điểm</span>
      </div>
      <div class="official-score-details">
        <span>• Trả lời đúng: <strong>${officialAttempt.correctCount}/${officialAttempt.totalQuestions} câu</strong></span> • 
        <span>Thời gian: ${officialAttempt.timeSpent || 'Đã hoàn thành'}</span> • 
        <span>Lúc: ${officialAttempt.completedAt || officialAttempt.firstRecordedAt}</span>
      </div>
      <div class="official-score-notice">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <span>Bạn đã hoàn thành bài thi tính điểm. Bạn có thể vào <strong>làm lại để ôn tập kiến thức</strong> (không cập nhật điểm mới).</span>
      </div>
    `;

    if (noticeText) {
      noticeText.innerHTML = `Chế độ hiện tại: <strong style="color:#7c3aed;">ÔN TẬP KIẾN THỨC</strong> (Điểm chính thức lần 1 là <strong>${officialAttempt.score}đ</strong> được bảo lưu vĩnh viễn trên danh sách giáo viên).`;
    }

    if (btnStart) {
      btnStart.classList.add("practice-mode");
      btnStart.innerHTML = `
        <span>Làm lại bài thi (Ôn tập kiến thức)</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
      `;
    }
  } else {
    if (banner) banner.style.display = "none";
    if (noticeText) {
      noticeText.innerHTML = `Mỗi học sinh chỉ có <strong>01 lần làm bài thi chính thức</strong> tính điểm. Hãy chuẩn bị kỹ trước khi bắt đầu!`;
    }
    if (btnStart) {
      btnStart.classList.remove("practice-mode");
      btnStart.innerHTML = `
        <span>Bắt đầu làm bài thi chính thức</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
        </svg>
      `;
    }
  }
}

/**
 * Xử lý khi người dùng bấm chọn một tuần
 */
async function selectWeek(weekId) {
  const weeks = CONFIG.WEEKS || [];
  const week = weeks.find(w => w.id === weekId);
  if (!week) return;

  const isAdmin = AuthState.currentUser && AuthState.currentUser.role === "admin";
  const unlocked = isWeekUnlocked(week);

  QuizState.selectedWeekId = weekId;
  QuizState.currentWeekInfo = week;

  // Cập nhật class active trên giao diện
  document.querySelectorAll(".week-card").forEach(c => {
    if (Number(c.dataset.id) === weekId) {
      c.classList.add("selected");
    } else {
      c.classList.remove("selected");
    }
  });

  // Cập nhật nhãn tuần
  const weekPill = document.getElementById("selected-week-title");
  if (weekPill) weekPill.textContent = week.name;

  const subjectEl = document.getElementById("badge-subject");
  if (subjectEl) subjectEl.textContent = week.title;

  const titleEl = document.getElementById("quiz-title-display");
  if (titleEl) titleEl.textContent = `${CONFIG.QUIZ.title} - ${week.name.toUpperCase()}`;

  // Cập nhật khung hiển thị điểm số chính thức lần 1 (nếu có)
  updateOfficialScoreDisplay(weekId);

  // Nạp dữ liệu câu hỏi của tuần này
  await loadWeekQuestions(week);
}

/**
 * Tải danh sách câu hỏi của tuần được chọn từ file JSON
 */
async function loadWeekQuestions(week) {
  const totalQEl = document.getElementById("info-total-q");
  const durationEl = document.getElementById("info-duration");
  const scaleEl = document.getElementById("info-scale");
  const btnStart = document.getElementById("btn-start");
  const isAdmin = AuthState.currentUser && AuthState.currentUser.role === "admin";
  const unlocked = isWeekUnlocked(week);

  // 1. TRƯỜNG HỢP TUẦN THI ĐANG BỊ KHÓA ĐỐI VỚI HỌC SINH
  if (!unlocked && !isAdmin) {
    QuizState.rawQuestions = [];
    if (totalQEl) {
      totalQEl.textContent = "Đang bị khóa 🔒";
      totalQEl.style.color = "var(--danger)";
    }
    if (durationEl) durationEl.textContent = `${week.durationMinutes || 0} phút`;
    if (scaleEl) scaleEl.textContent = "100 điểm";

    if (btnStart) {
      btnStart.classList.add("btn-locked");
      btnStart.disabled = true;
      btnStart.style.opacity = "0.55";
      btnStart.style.cursor = "not-allowed";
      btnStart.innerHTML = `
        <span>Tuần thi đang bị khóa 🔒</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      `;
    }
    return;
  }

  // 2. TRƯỜNG HỢP TUẦN THI CHƯA CÓ FILE ĐỀ THI (CHƯA UPLOAD ĐỀ)
  if (!week.file || !week.file.trim()) {
    QuizState.rawQuestions = [];
    if (totalQEl) {
      totalQEl.textContent = "Chưa có đề ⏳";
      totalQEl.style.color = "var(--danger)";
    }
    if (durationEl) durationEl.textContent = "0 phút";
    if (scaleEl) scaleEl.textContent = "0 điểm";

    if (btnStart) {
      btnStart.classList.add("btn-locked");
      btnStart.disabled = true;
      btnStart.style.opacity = "0.55";
      btnStart.style.cursor = "not-allowed";
      btnStart.innerHTML = `
        <span>Chưa có dữ liệu đề thi ⏳</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      `;
    }
    return;
  }

  // 3. TUẦN CÓ FILE ĐỀ THI VÀ ĐƯỢC PHÉP TRUY CẬP: NẠP ĐỀ THI THẬT
  if (totalQEl) {
    totalQEl.textContent = "Đang tải...";
    totalQEl.style.color = "";
  }
  if (btnStart) {
    btnStart.classList.remove("btn-locked");
    btnStart.disabled = false;
    btnStart.style.opacity = "";
    btnStart.style.cursor = "";
  }

  try {
    const res = await fetch(week.file);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Dữ liệu câu hỏi của ${week.name} rỗng!`);
    }

    QuizState.rawQuestions = data;

    if (totalQEl) totalQEl.textContent = `${data.length} câu`;
    if (durationEl) durationEl.textContent = `${week.durationMinutes || 30} phút`;
    if (scaleEl) scaleEl.textContent = `${CONFIG.QUIZ.targetScale || 100} điểm`;

    updateOfficialScoreDisplay(week.id);
  } catch (err) {
    console.error(`Lỗi tải câu hỏi cho ${week.name}:`, err);
    QuizState.rawQuestions = [];
    if (totalQEl) {
      totalQEl.textContent = "Lỗi nạp file!";
      totalQEl.style.color = "var(--danger)";
    }
    if (btnStart) {
      btnStart.classList.add("btn-locked");
      btnStart.disabled = true;
      btnStart.style.opacity = "0.55";
      btnStart.style.cursor = "not-allowed";
      btnStart.innerHTML = `<span>Không thể nạp đề thi</span>`;
    }
  }
}

// ==============================================================================
// THUẬT TOÁN XÁO TRỘN CÂU HỎI & ĐÁP ÁN (FISHER-YATES SHUFFLE)
// ==============================================================================
function shuffleArray(arr) {
  const cloned = [...arr];
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function shuffleQuestions(arr) {
  return prepareQuestionsForQuiz(arr);
}

/**
 * Chuẩn bị và xáo trộn ngẫu nhiên bộ câu hỏi thi cũng như vị trí các đáp án A, B, C, D
 * Đảm bảo mỗi học sinh vào thi và mỗi lần bấm "Làm lại bài thi" (Retry) đều có:
 * 1. Thứ tự câu hỏi ngẫu nhiên mới hoàn toàn.
 * 2. Vị trí các đáp án A, B, C, D được tráo đổi ngẫu nhiên, phân phối đều đáp án đúng.
 */
function prepareQuestionsForQuiz(rawQuestions) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return [];

  const shouldShuffleOptions = (CONFIG.QUIZ && CONFIG.QUIZ.shuffleOptions !== false);
  const shouldShuffleQuestions = (CONFIG.QUIZ && CONFIG.QUIZ.shuffleQuestions !== false);

  // 1. Tạo bản sao sâu và đảo ngẫu nhiên các phương án A, B, C, D trong từng câu
  const processed = rawQuestions.map((q, qIndex) => {
    const originalCorrect = String(q.correctAnswer || "A").trim().toUpperCase();
    const options = [
      { key: "A", text: q.optionA, isCorrect: originalCorrect === "A" },
      { key: "B", text: q.optionB, isCorrect: originalCorrect === "B" },
      { key: "C", text: q.optionC, isCorrect: originalCorrect === "C" },
      { key: "D", text: q.optionD, isCorrect: originalCorrect === "D" }
    ];

    const shuffledOpts = shouldShuffleOptions ? shuffleArray(options) : [...options];
    const letters = ["A", "B", "C", "D"];
    let newCorrect = "A";

    const newQ = {
      ...q,
      originalId: q.id !== undefined ? q.id : (qIndex + 1)
    };

    shuffledOpts.forEach((opt, idx) => {
      const letter = letters[idx];
      newQ[`option${letter}`] = opt.text;
      if (opt.isCorrect) {
        newCorrect = letter;
      }
    });

    newQ.correctAnswer = newCorrect;
    return newQ;
  });

  // 2. Đảo ngẫu nhiên thứ tự các câu hỏi trong đề thi
  return shouldShuffleQuestions ? shuffleArray(processed) : processed;
}

// ==============================================================================
// CHUYỂN ĐỔI GIỮA CÁC MÀN HÌNH (SPA)
// ==============================================================================
function showScreen(screenId) {
  document.querySelectorAll(".screen-card").forEach(el => {
    el.classList.remove("active");
  });
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Khóa và cô lập giao diện khi đang trong chế độ làm bài thi (quiz-screen)
  const isExam = (screenId === "quiz-screen");
  const isAuth = (screenId === "auth-screen");
  document.body.classList.toggle("exam-in-progress", isExam);
  document.body.classList.toggle("auth-mode", isAuth);

  // Ẩn backdrop nếu đang mở
  const backdrop = document.getElementById("sidebar-backdrop");
  if (backdrop && (isExam || isAuth)) {
    backdrop.classList.remove("active");
    backdrop.style.display = "none";
  }

  // Đồng bộ trạng thái tab trên thanh điều hướng dọc
  const sidebarTabQuiz = document.getElementById("sidebar-tab-quiz");
  const sidebarTabRoadmap = document.getElementById("sidebar-tab-roadmap");
  if (screenId === "start-screen") {
    if (sidebarTabQuiz) sidebarTabQuiz.classList.add("active");
    if (sidebarTabRoadmap) sidebarTabRoadmap.classList.remove("active");
  } else if (screenId === "roadmap-screen") {
    if (sidebarTabRoadmap) sidebarTabRoadmap.classList.add("active");
    if (sidebarTabQuiz) sidebarTabQuiz.classList.remove("active");
  }
}

// ==============================================================================
// BẮT ĐẦU BÀI THI
// ==============================================================================
async function startQuiz() {
  // 1. BẮT BUỘC HỌC SINH PHẢI ĐĂNG NHẬP TRƯỚC KHI LÀM BÀI
  if (!AuthState.currentUser) {
    showScreen("auth-screen");
    showAuthAlert("⚠️ Bạn cần ĐĂNG NHẬP hoặc ĐĂNG KÝ tài khoản học sinh trước khi bắt đầu làm bài!", "error");
    return;
  }

  const week = (CONFIG.WEEKS || []).find(w => w.id === QuizState.selectedWeekId);
  const isAdmin = AuthState.currentUser && AuthState.currentUser.role === "admin";
  const unlocked = isWeekUnlocked(week);

  // 2. CHẶN NẾU TUẦN THI ĐANG BỊ KHÓA ĐỐI VỚI HỌC SINH
  if (!unlocked && !isAdmin) {
    playWrongSound();
    await showAppAlert({
      title: "BÀI THI ĐANG BỊ KHÓA",
      message: `<strong>${week ? escapeHtml(week.name) : 'Tuần này'}</strong> hiện đang bị khóa bởi Quản trị viên.<br><br>Học sinh không thể bắt đầu làm bài thi!`,
      type: "warning"
    });
    return;
  }

  // 3. CHẶN NẾU TUẦN THI CHƯA CÓ FILE CÂU HỎI
  if (!week || !week.file || !week.file.trim()) {
    playWrongSound();
    await showAppAlert({
      title: "CHƯA CÓ DỮ LIỆU ĐỀ THI",
      message: `<strong>${week ? escapeHtml(week.name) : 'Tuần này'}</strong> chưa có bộ câu hỏi thi (giáo viên chưa tải file câu hỏi lên hệ thống).<br><br>Vui lòng chọn <strong>Tuần 1 đến Tuần 6</strong> để làm bài.`,
      type: "info"
    });
    return;
  }

  // 4. KIỂM TRA DỮ LIỆU CÂU HỎI ĐÃ ĐƯỢC NẠP THÀNH CÔNG CHƯA
  if (!QuizState.rawQuestions || QuizState.rawQuestions.length === 0) {
    playWrongSound();
    await showAppAlert({
      title: "ĐỀ THI TRỐNG",
      message: `Không tìm thấy câu hỏi nào trong đề thi của <strong>${week ? escapeHtml(week.name) : 'tuần này'}</strong>.<br><br>Vui lòng liên hệ giáo viên hoặc chọn tuần khác.`,
      type: "warning"
    });
    return;
  }

  QuizState.studentName = AuthState.currentUser.fullName;
  QuizState.studentClass = AuthState.currentUser.className || "";
  QuizState.username = AuthState.currentUser.username;
  QuizState.startTime = new Date();

  // Xáo trộn ngẫu nhiên thứ tự câu hỏi & vị trí các đáp án A/B/C/D mỗi lượt thi hoặc làm lại
  QuizState.activeQuestions = prepareQuestionsForQuiz(QuizState.rawQuestions);

  // Tính tổng điểm tối đa của đề thi
  QuizState.totalPossiblePoints = QuizState.activeQuestions.reduce((sum, q) => sum + (Number(q.points) || 2), 0);
  QuizState.pointsEarned = 0;
  QuizState.currentIndex = 0;
  QuizState.answersLog = [];

  // Hiển thị tên học sinh trên thanh trạng thái
  const displayName = document.getElementById("display-student-name");
  if (displayName) displayName.textContent = QuizState.studentName;

  // Xác định đây là lượt thi chính thức lần 1 hay lượt làm lại ôn tập
  const existingOfficialAttempt = getOfficialAttempt(QuizState.username, QuizState.selectedWeekId);
  QuizState.isPracticeMode = Boolean(existingOfficialAttempt);
  QuizState.officialAttempt = existingOfficialAttempt;

  // Cập nhật huy hiệu chế độ ôn tập trên thanh trạng thái bài thi
  QuizState.violationCount = 0;
  QuizState.isExamActive = true;
  QuizState.isAutoSubmitDueToCheat = false;
  updateViolationUI();

  // Khởi chạy đồng hồ đếm ngược
  startTimer();

  // Chuyển sang màn hình thi
  showScreen("quiz-screen");

  // Hiển thị câu hỏi đầu tiên
  renderCurrentQuestion();
}

// ==============================================================================
// BỘ ĐẾM THỜI GIAN (COUNTDOWN TIMER)
// ==============================================================================
function startTimer() {
  const durationMin = (QuizState.currentWeekInfo && QuizState.currentWeekInfo.durationMinutes) 
    ? QuizState.currentWeekInfo.durationMinutes 
    : (CONFIG.QUIZ.durationMinutes || 30);
  QuizState.totalDurationSeconds = durationMin * 60;
  QuizState.secondsRemaining = QuizState.totalDurationSeconds;

  updateTimerUI();

  if (QuizState.timerInterval) clearInterval(QuizState.timerInterval);

  QuizState.timerInterval = setInterval(() => {
    QuizState.secondsRemaining--;
    updateTimerUI();

    if (QuizState.secondsRemaining <= 0) {
      clearInterval(QuizState.timerInterval);
      handleTimeExpired();
    }
  }, 1000);
}

function updateTimerUI() {
  const timerDisplay = document.getElementById("timer-display");
  const timerBadge = document.getElementById("timer-badge");

  const min = Math.floor(QuizState.secondsRemaining / 60);
  const sec = QuizState.secondsRemaining % 60;
  const formatted = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

  if (timerDisplay) timerDisplay.textContent = formatted;

  // Cảnh báo khi thời gian còn dưới 60 giây
  if (timerBadge) {
    if (QuizState.secondsRemaining <= 60 && QuizState.secondsRemaining > 0) {
      timerBadge.classList.add("warning");
    } else {
      timerBadge.classList.remove("warning");
    }
  }
}

async function handleTimeExpired() {
  await showAppAlert({
    title: "HẾT GIỜ LÀM BÀI",
    message: "Đã hết thời gian làm bài quy định!<br><br>Hệ thống đang tự động chấm điểm và tổng hợp kết quả của bạn...",
    type: "info"
  });
  finishQuiz();
}

// ==============================================================================
// HIỂN THỊ CÂU HỎI HIỆN TẠI (RENDER QUESTION)
// ==============================================================================
function renderCurrentQuestion() {
  const totalQ = QuizState.activeQuestions.length;
  const qIndex = QuizState.currentIndex;

  if (qIndex >= totalQ) {
    finishQuiz();
    return;
  }

  const qData = QuizState.activeQuestions[qIndex];

  // 1. Cập nhật tiến trình & Thẻ số câu
  const labelEl = document.getElementById("question-progress-label");
  if (labelEl) labelEl.textContent = `Câu ${qIndex + 1} / ${totalQ}`;

  const fillEl = document.getElementById("progress-bar-fill");
  if (fillEl) {
    const pct = Math.round(((qIndex + 1) / totalQ) * 100);
    fillEl.style.width = `${pct}%`;
  }

  const pointsBadge = document.getElementById("live-points-badge");
  const qPoints = qData.points !== undefined ? qData.points : 2;
  if (pointsBadge) pointsBadge.textContent = `+${qPoints} điểm`;

  const tagEl = document.getElementById("current-q-tag");
  if (tagEl) tagEl.textContent = `CÂU HỎI ${qIndex + 1}`;

  // 2. Cập nhật nội dung câu hỏi
  const textEl = document.getElementById("question-text");
  if (textEl) textEl.textContent = qData.question;

  // 3. Render danh sách đáp án A, B, C, D
  const optionsContainer = document.getElementById("options-container");
  if (!optionsContainer) return;
  optionsContainer.innerHTML = "";

  const optionsList = [
    { key: "A", text: qData.optionA },
    { key: "B", text: qData.optionB },
    { key: "C", text: qData.optionC },
    { key: "D", text: qData.optionD }
  ];

  optionsList.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    btn.dataset.key = opt.key;

    btn.innerHTML = `
      <span class="option-key">${opt.key}</span>
      <span class="option-text">${escapeHtml(opt.text || "")}</span>
      <span class="option-icon-slot"></span>
    `;

    // Gắn sự kiện click chọn đáp án
    btn.addEventListener("click", () => handleOptionSelect(opt.key, qData));

    optionsContainer.appendChild(btn);
  });

  // Hiệu ứng chuyển động mượt mà khi câu hỏi xuất hiện
  const card = document.getElementById("question-card");
  if (card) {
    card.classList.remove("anim-enter", "anim-exit");
    void card.offsetWidth; // Trigger reflow
    card.classList.add("anim-enter");
  }
}

// ==============================================================================
// XỬ LÝ CHỌN ĐÁP ÁN (KIỂM TRA ĐÚNG / SAI & HIỆU ỨNG)
// ==============================================================================
function handleOptionSelect(selectedKey, qData) {
  const container = document.getElementById("options-container");
  if (!container) return;

  const allButtons = container.querySelectorAll(".option-btn");

  // Khóa tất cả các nút ngay lập tức để học sinh không bấm nhiều lần
  allButtons.forEach(btn => btn.classList.add("disabled"));

  const normalizedCorrect = String(qData.correctAnswer || "A").trim().toUpperCase();
  const isCorrect = (selectedKey === normalizedCorrect);
  const points = Number(qData.points) || 2;
  const pointsEarned = isCorrect ? points : 0;

  QuizState.pointsEarned += pointsEarned;

  // Lưu lịch sử bài làm để hiển thị chi tiết và gửi lên Cloud
  QuizState.answersLog.push({
    questionId: qData.id || (QuizState.currentIndex + 1),
    question: qData.question,
    selectedOption: selectedKey,
    selectedText: qData[`option${selectedKey}`] || "",
    correctAnswer: normalizedCorrect,
    correctText: qData[`option${normalizedCorrect}`] || "",
    isCorrect: isCorrect,
    pointsEarned: pointsEarned,
    maxPoints: points
  });

  // Tìm nút người dùng bấm
  const selectedBtn = Array.from(allButtons).find(b => b.dataset.key === selectedKey);

  if (isCorrect) {
    // -------------------------------------------------------------------------
    // CHỌN ĐÚNG: HIỆU ỨNG XANH + ICON CHECK + SCALE NHẸ
    // -------------------------------------------------------------------------
    if (selectedBtn) {
      selectedBtn.classList.add("is-correct");
      const iconSlot = selectedBtn.querySelector(".option-icon-slot");
      if (iconSlot) {
        iconSlot.innerHTML = `
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        `;
      }
    }
    playCorrectSound();

  } else {
    // -------------------------------------------------------------------------
    // CHỌN SAI: HIỆU ỨNG ĐỎ + RUNG LẮC + ĐỒNG THỜI HIỆN ĐÁP ÁN ĐÚNG
    // -------------------------------------------------------------------------
    if (selectedBtn) {
      selectedBtn.classList.add("is-wrong");
      const iconSlot = selectedBtn.querySelector(".option-icon-slot");
      if (iconSlot) {
        iconSlot.innerHTML = `
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        `;
      }
    }

    // Làm nổi bật đáp án đúng để học sinh ghi nhớ kiến thức
    const correctBtn = Array.from(allButtons).find(b => b.dataset.key === normalizedCorrect);
    if (correctBtn) {
      correctBtn.classList.add("is-correct-hint");
      const correctSlot = correctBtn.querySelector(".option-icon-slot");
      if (correctSlot) {
        correctSlot.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        `;
      }
    }
    playWrongSound();
  }

  // Tự động chuyển câu tiếp theo sau thời gian dừng đã định sẵn
  const delay = CONFIG.QUIZ.autoAdvanceDelayMs || 1100;
  setTimeout(() => {
    const card = document.getElementById("question-card");
    if (card) {
      card.classList.remove("anim-enter");
      card.classList.add("anim-exit");
    }

    setTimeout(() => {
      QuizState.currentIndex++;
      renderCurrentQuestion();
    }, 220);

  }, delay);
}

// ==============================================================================
// HOÀN THÀNH BÀI THI & TÍNH ĐIỂM
// ==============================================================================
function finishQuiz() {
  if (QuizState.isSubmitting) return;
  QuizState.isSubmitting = true;
  QuizState.isExamActive = false; // Ngừng giám sát chống gian lận sau khi kết thúc bài

  // Đóng modal cảnh báo nếu đang mở
  const violationModal = document.getElementById("violation-modal");
  if (violationModal) {
    violationModal.style.display = "none";
  }

  if (QuizState.timerInterval) {
    clearInterval(QuizState.timerInterval);
  }

  QuizState.endTime = new Date();

  // Tính toán thời gian làm bài thực tế
  const totalSecondsSpent = Math.max(1, Math.round((QuizState.endTime - QuizState.startTime) / 1000));
  const minSpent = Math.floor(totalSecondsSpent / 60);
  const secSpent = totalSecondsSpent % 60;
  const timeSpentFormatted = `${minSpent} phút ${secSpent} giây`;

  // Thống kê điểm số
  const totalQuestions = QuizState.activeQuestions.length;
  const correctCount = QuizState.answersLog.filter(a => a.isCorrect).length;
  const accuracyPct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Tính điểm theo thang điểm 100
  let scoreOn100 = 0;
  if (QuizState.totalPossiblePoints > 0) {
    scoreOn100 = Math.round((QuizState.pointsEarned / QuizState.totalPossiblePoints) * 100);
  }

  const passingScore = (CONFIG.QUIZ && CONFIG.QUIZ.passingScore) || 95;
  const isPassed = (scoreOn100 >= passingScore);

  // ============================================================================
  // XỬ LÝ ĐIỂM SỐ: CHỈ GHI NHẬN LẦN ĐẦU TIÊN (LẦN 2 TRỞ ĐI LÀ ÔN TẬP BẢO LƯU ĐIỂM)
  // ============================================================================
  if (!QuizState.isPracticeMode) {
    // 1. LƯỢT THI CHÍNH THỨC (LẦN 1): Khóa điểm và gửi báo cáo lên Google Sheet
    saveOfficialAttempt(QuizState.username, QuizState.selectedWeekId, {
      score: scoreOn100,
      correctCount: correctCount,
      totalQuestions: totalQuestions,
      accuracyPct: accuracyPct,
      timeSpent: timeSpentFormatted,
      isPassed: isPassed,
      completedAt: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
      violations: QuizState.violationCount
    });

    // Tự động đồng bộ kết quả chính thức lên Google Sheet
    autoSaveResultsToCloud({
      scoreOn100,
      correctCount,
      totalQuestions,
      accuracyPct,
      timeSpentFormatted,
      totalSecondsSpent
    });
  } else {
    // 2. LƯỢT LÀM LẠI (ÔN TẬP): Không gửi đè điểm mới lên Google Sheet, bảo lưu kết quả lần 1
    console.log(`[Quiz Practice] Hoàn thành lượt ôn tập Tuần ${QuizState.selectedWeekId} (${scoreOn100}đ). Điểm chính thức lần 1 (${QuizState.officialAttempt ? QuizState.officialAttempt.score : 0}đ) được bảo lưu.`);
    handlePracticeSubmissionSummary({
      scoreOn100,
      correctCount,
      totalQuestions,
      accuracyPct,
      timeSpentFormatted,
      totalSecondsSpent
    });
  }

  // Cập nhật lại giao diện bộ chọn tuần và bảng điểm ở trang chủ
  initWeeksSelector();
  updateOfficialScoreDisplay(QuizState.selectedWeekId);

  // Hiển thị màn hình kết quả
  renderResultsScreen({
    scoreOn100,
    correctCount,
    totalQuestions,
    accuracyPct,
    timeSpentFormatted
  });

  showScreen("result-screen");
}

/**
 * Xử lý giao diện thông báo khi hoàn thành lượt làm bài ôn tập (không cập nhật Cloud)
 */
function handlePracticeSubmissionSummary(summary) {
  const statusTitle = document.getElementById("save-status-title");
  const statusDesc = document.getElementById("save-status-desc");
  const syncTarget = document.getElementById("sync-target-text");

  const firstScore = QuizState.officialAttempt ? QuizState.officialAttempt.score : summary.scoreOn100;

  if (statusTitle) statusTitle.textContent = "Điểm chính thức lần 1 được bảo lưu";
  if (syncTarget) syncTarget.textContent = "Bảo lưu lần 1 ✓";
  if (statusDesc) {
    statusDesc.textContent = `Đây là lượt làm bài ôn tập rèn luyện. Điểm thi chính thức lần 1 (${firstScore} điểm) trên Google Sheet của giáo viên được giữ nguyên hoàn toàn.`;
  }
}

// ==============================================================================
// HIỂN THỊ MÀN HÌNH KẾT QUẢ (RESULTS SCREEN)
// ==============================================================================
function renderResultsScreen(stats) {
  const { scoreOn100, correctCount, totalQuestions, accuracyPct, timeSpentFormatted } = stats;

  // Thông báo chế độ ôn tập nếu là lượt làm lại
  const retakeBanner = document.getElementById("retake-notice-banner");
  const retakeTitle = document.getElementById("retake-notice-title");
  const retakeDesc = document.getElementById("retake-notice-desc");
  if (retakeBanner) {
    if (QuizState.isPracticeMode) {
      retakeBanner.style.display = "flex";
      const firstScore = QuizState.officialAttempt ? QuizState.officialAttempt.score : stats.scoreOn100;
      if (retakeTitle) retakeTitle.textContent = "LƯỢT LÀM BÀI ÔN TẬP KIẾN THỨC";
      if (retakeDesc) {
        retakeDesc.innerHTML = `Điểm số lượt rèn luyện này là <strong>${stats.scoreOn100}/100</strong>. Điểm thi chính thức lần 1 của bạn là <strong>${firstScore}/100 điểm</strong> vẫn được bảo lưu 100%.`;
      }
    } else {
      retakeBanner.style.display = "none";
    }
  }

  // 1. Họ tên và thời gian
  const studentEl = document.getElementById("result-student-name");
  if (studentEl) {
    const classInfo = QuizState.studentClass ? ` (${QuizState.studentClass})` : "";
    studentEl.textContent = `${QuizState.studentName}${classInfo}`;
  }

  const timeEl = document.getElementById("result-time-spent");
  if (timeEl) timeEl.textContent = `Thời gian hoàn thành: ${timeSpentFormatted}`;

  // 2. Điểm số thang 100 & Vòng tròn SVG
  const scoreNumEl = document.getElementById("final-score-100");
  if (scoreNumEl) {
    animateCountUp(scoreNumEl, 0, scoreOn100, 1200);
  }

  const passingScore = (CONFIG.QUIZ && CONFIG.QUIZ.passingScore) || 95;
  const isPassed = (scoreOn100 >= passingScore);

  const scoreRing = document.getElementById("score-ring");
  if (scoreRing) {
    const circumference = 2 * Math.PI * 50; // r = 50 -> ~314.16
    const offset = circumference - (scoreOn100 / 100) * circumference;
    scoreRing.style.strokeDashoffset = offset;
    
    // Đổi màu vòng tròn: Xanh lá nếu ĐẠT (>= 95), Đỏ nếu CHƯA ĐẠT (< 95)
    if (isPassed) {
      scoreRing.style.stroke = "var(--success)";
    } else {
      scoreRing.style.stroke = "var(--danger)";
    }
  }

  // 3. Xếp loại học lực & Trạng thái ĐẠT / CHƯA ĐẠT (Yêu cầu >= 95 điểm mới qua)
  const badgeEl = document.getElementById("performance-badge");
  if (badgeEl) {
    if (QuizState.isAutoSubmitDueToCheat) {
      badgeEl.textContent = `BỊ THU BÀI DO RỜI TAB (${QuizState.violationCount} LẦN) 🚫`;
      badgeEl.style.background = "#fef2f2";
      badgeEl.style.color = "#dc2626";
      badgeEl.style.border = "1px solid #f87171";
    } else if (scoreOn100 === 100) {
      badgeEl.textContent = "ĐẠT - ĐIỂM TUYỆT ĐỐI 100/100 🏆";
      badgeEl.style.background = "#ecfdf5";
      badgeEl.style.color = "#059669";
    } else if (isPassed) {
      badgeEl.textContent = "ĐẠT - XUẤT SẮC 🌟";
      badgeEl.style.background = "#ecfdf5";
      badgeEl.style.color = "#059669";
    } else {
      badgeEl.textContent = `CHƯA ĐẠT (YÊU CẦU ≥ ${passingScore} ĐIỂM) 💡`;
      badgeEl.style.background = "#fef2f2";
      badgeEl.style.color = "#dc2626";
    }
  }

  // Ghi chú vi phạm vào dòng thời gian nếu có
  if (QuizState.violationCount > 0) {
    const timeEl = document.getElementById("result-time-spent");
    if (timeEl) {
      const cheatTag = QuizState.isAutoSubmitDueToCheat 
        ? ` <span style="color:var(--danger);font-weight:700;">[Bị thu bài do rời tab ${QuizState.violationCount} lần]</span>`
        : ` <span style="color:#d97706;font-weight:600;">[Cảnh báo: Rời tab ${QuizState.violationCount} lần]</span>`;
      timeEl.innerHTML = `Thời gian làm bài: ${timeSpentFormatted}${cheatTag}`;
    }
  }

  // 4. Các thẻ số liệu
  const correctCountEl = document.getElementById("result-correct-count");
  if (correctCountEl) correctCountEl.textContent = `${correctCount} / ${totalQuestions}`;

  const accuracyEl = document.getElementById("result-accuracy");
  if (accuracyEl) accuracyEl.textContent = `${accuracyPct}%`;

  const pointsRawEl = document.getElementById("result-points-raw");
  if (pointsRawEl) pointsRawEl.textContent = `${QuizState.pointsEarned} / ${QuizState.totalPossiblePoints}`;

  // 5. Cập nhật số lượng cho các tab lọc
  const wrongCount = totalQuestions - correctCount;
  const countAll = document.getElementById("count-all");
  const countCorrect = document.getElementById("count-correct");
  const countWrong = document.getElementById("count-wrong");
  if (countAll) countAll.textContent = totalQuestions;
  if (countCorrect) countCorrect.textContent = correctCount;
  if (countWrong) countWrong.textContent = wrongCount;

  // 6. Render danh sách xem lại câu hỏi
  renderReviewList("all");
}

// ==============================================================================
// HIỂN THỊ DANH SÁCH XEM LẠI CÂU HỎI (REVIEW ANSWERS)
// ==============================================================================
function renderReviewList(filterType = "all") {
  const container = document.getElementById("review-list-container");
  if (!container) return;
  container.innerHTML = "";

  const items = QuizState.answersLog.filter(item => {
    if (filterType === "correct") return item.isCorrect;
    if (filterType === "wrong") return !item.isCorrect;
    return true;
  });

  if (items.length === 0) {
    container.innerHTML = `<p style="text-align:center; color: var(--text-muted); padding: 20px;">Không có câu hỏi nào trong mục này.</p>`;
    return;
  }

  items.forEach((item, idx) => {
    const div = document.createElement("div");
    div.className = `review-item ${item.isCorrect ? "is-correct" : "is-wrong"}`;

    div.innerHTML = `
      <div class="review-item-header">
        <span class="review-item-qnum">CÂU ${idx + 1} (${item.isCorrect ? `+${item.pointsEarned}đ` : '0đ'})</span>
        <span class="review-badge ${item.isCorrect ? 'correct' : 'wrong'}">
          ${item.isCorrect ? '✓ Đúng' : '✗ Sai'}
        </span>
      </div>

      <p class="review-question-text">${escapeHtml(item.question)}</p>

      <div class="review-answers-box">
        <div class="review-user-ans">
          <span class="ans-tag ${item.isCorrect ? 'tag-correct' : 'tag-user-wrong'}">Bạn chọn:</span>
          <span><strong>${item.selectedOption}.</strong> ${escapeHtml(item.selectedText || "Không có")}</span>
        </div>

        ${!item.isCorrect ? `
          <div class="review-correct-ans">
            <span class="ans-tag tag-correct">Đáp án đúng:</span>
            <span><strong>${item.correctAnswer}.</strong> ${escapeHtml(item.correctText || "")}</span>
          </div>
        ` : ''}
      </div>
    `;

    container.appendChild(div);
  });
}

// ==============================================================================
// TỰ ĐỘNG LƯU KẾT QUẢ LÊN CLOUD (FIREBASE VÀ GOOGLE SHEETS)
// ==============================================================================
async function autoSaveResultsToCloud(summary) {
  const statusTitle = document.getElementById("save-status-title");
  const statusDesc = document.getElementById("save-status-desc");
  const syncTarget = document.getElementById("sync-target-text");

  const weekLabel = QuizState.currentWeekInfo ? QuizState.currentWeekInfo.name : "Tuần 1";
  let baseClass = QuizState.studentClass || "Chưa phân lớp";
  if (QuizState.username && !QuizState.username.includes("khách") && !baseClass.toLowerCase().includes(QuizState.username.toLowerCase())) {
    baseClass = `${baseClass} (@${QuizState.username})`;
  }
  let studentClassWithWeek = `${baseClass} [${weekLabel}]`;

  // Ghi nhận vi phạm chống gian lận vào thông tin lớp và payload
  if (QuizState.violationCount > 0) {
    const cheatTag = QuizState.isAutoSubmitDueToCheat 
      ? ` [Rời tab: ${QuizState.violationCount} lần - BỊ THU BÀI]` 
      : ` [Rời tab: ${QuizState.violationCount} lần]`;
    studentClassWithWeek += cheatTag;
  }

  const payload = {
    action: "submit_quiz",
    timestamp: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    studentName: QuizState.studentName,
    username: QuizState.username || "Khách (chưa đăng nhập)",
    studentClass: studentClassWithWeek,
    week: weekLabel,
    violations: QuizState.violationCount,
    isCheatingAutoSubmit: QuizState.isAutoSubmitDueToCheat,
    scaledScore: summary.scoreOn100,
    pointsEarned: QuizState.pointsEarned,
    totalPossiblePoints: QuizState.totalPossiblePoints,
    correctCount: summary.correctCount,
    totalQuestions: summary.totalQuestions,
    accuracy: `${summary.accuracyPct}%`,
    timeSpent: summary.timeSpentFormatted,
    details: QuizState.answersLog.map(a => ({
      questionId: a.questionId,
      question: a.question,
      selectedOption: a.selectedOption,
      correctAnswer: a.correctAnswer,
      isCorrect: a.isCorrect,
      pointsEarned: a.pointsEarned
    }))
  };

  // Hiển thị trạng thái đang gửi ban đầu
  if (statusTitle) statusTitle.textContent = "Đang gửi kết quả cho giáo viên...";
  if (syncTarget) syncTarget.textContent = "Đang gửi...";
  if (statusDesc) statusDesc.textContent = "Hệ thống đang kết nối và lưu bài làm vào Google Sheet...";

  // TỰ ĐỘNG LƯU VÀO GOOGLE SHEETS QUA APPS SCRIPT
  if (CONFIG.GOOGLE_APPS_SCRIPT_URL && CONFIG.GOOGLE_APPS_SCRIPT_URL.startsWith("http")) {
    const rawPayload = JSON.stringify(payload);
    try {
      // Dùng Content-Type text/plain và mode 'no-cors' để vượt qua kiểm tra CORS của trình duyệt
      await fetch(CONFIG.GOOGLE_APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: rawPayload
      });
      savedToGoogleSheet = true;
      console.log("Đã gửi kết quả thành công sang Google Sheets!");
    } catch (e) {
      console.warn("Thử lại gửi qua sendBeacon:", e);
      if (navigator.sendBeacon) {
        try {
          const blob = new Blob([rawPayload], { type: "text/plain;charset=utf-8" });
          savedToGoogleSheet = navigator.sendBeacon(CONFIG.GOOGLE_APPS_SCRIPT_URL, blob);
        } catch (beaconErr) {
          console.error("Lỗi gửi sendBeacon:", beaconErr);
        }
      }
    }
  } else {
    console.info("Chưa cấu hình GOOGLE_APPS_SCRIPT_URL trong config.js. Dữ liệu tạm thời lưu trên trình duyệt.");
  }

  // Cập nhật thông báo hoàn tất cho học sinh
  if (statusTitle) {
    statusTitle.textContent = "Kết quả đã được gửi cho giáo viên";
  }

  if (syncTarget) {
    if (savedToGoogleSheet) {
      syncTarget.textContent = "Google Sheets ✓";
    } else {
      syncTarget.textContent = "Đã lưu an toàn ✓";
    }
  }

  if (statusDesc) {
    if (savedToGoogleSheet) {
      statusDesc.textContent = "Bài làm của bạn đã được tự động lưu vào Google Sheet của giáo viên.";
    } else {
      statusDesc.textContent = "Bài làm của bạn đã được ghi nhận thành công.";
    }
  }
}

// ==============================================================================
// HỆ THỐNG GIÁM SÁT CHỐNG GIAN LẬN (ANTI-CHEAT MONITORING)
// ==============================================================================
let isViolationDebounced = false; // Ngăn chặn kích hoạt kép khi vừa đổi tab vừa mất focus

/**
 * Cập nhật số lần vi phạm trên thanh trạng thái bài thi
 */
function updateViolationUI() {
  const countText = document.getElementById("violation-count-text");
  const pill = document.getElementById("violation-pill");
  const maxViolations = (CONFIG.ANTI_CHEAT && CONFIG.ANTI_CHEAT.maxViolations) || 3;

  if (countText) {
    countText.textContent = `${QuizState.violationCount}/${maxViolations}`;
  }

  if (pill) {
    pill.classList.remove("warning-1", "warning-2", "danger");
    if (QuizState.violationCount === 1) {
      pill.classList.add("warning-1");
    } else if (QuizState.violationCount === 2) {
      pill.classList.add("warning-2");
    } else if (QuizState.violationCount >= maxViolations) {
      pill.classList.add("danger");
    }
  }
}

/**
 * Hiển thị cửa sổ cảnh báo vi phạm
 */
function showViolationModal(isMaxExceeded) {
  const modal = document.getElementById("violation-modal");
  if (!modal) return;

  const titleEl = document.getElementById("violation-modal-title");
  const descEl = document.getElementById("violation-modal-desc");
  const counterEl = document.getElementById("violation-modal-counter");
  const subEl = document.getElementById("violation-modal-sub");
  const btnAck = document.getElementById("btn-ack-violation");
  const maxViolations = (CONFIG.ANTI_CHEAT && CONFIG.ANTI_CHEAT.maxViolations) || 3;

  if (counterEl) {
    counterEl.textContent = `${QuizState.violationCount} / ${maxViolations} lần`;
  }

  if (isMaxExceeded) {
    if (titleEl) titleEl.textContent = "ĐÌNH CHỈ THI & TỰ ĐỘNG THU BÀI!";
    if (descEl) {
      descEl.innerHTML = `Hệ thống phát hiện bạn đã rời màn hình thi <strong>${QuizState.violationCount} lần</strong>, vượt quá giới hạn quy định (${maxViolations} lần).`;
    }
    if (subEl) {
      subEl.innerHTML = `🚫 <strong>BÀI THI CỦA BẠN BỊ KHÓA VÀ NỘP TỰ ĐỘNG!</strong> Kết quả và số lần vi phạm đang được chuyển thẳng đến giáo viên.`;
      subEl.style.borderColor = "#f87171";
      subEl.style.background = "#fef2f2";
      subEl.style.color = "#991b1b";
    }
    if (btnAck) {
      btnAck.disabled = true;
      btnAck.textContent = "Đang tự động nộp bài...";
      btnAck.style.opacity = "0.6";
      btnAck.style.cursor = "not-allowed";
    }
  } else {
    const remaining = maxViolations - QuizState.violationCount;
    if (titleEl) titleEl.textContent = `CẢNH BÁO RỜI MÀN HÌNH THI (LẦN ${QuizState.violationCount}/${maxViolations})!`;
    if (descEl) {
      descEl.innerHTML = `Hệ thống phát hiện bạn vừa <strong>rời khỏi màn hình bài thi</strong> (chuyển sang tab khác hoặc thoát khỏi trình duyệt). Hành vi này vi phạm quy chế thi trực tuyến!`;
    }
    if (subEl) {
      subEl.innerHTML = `⚠️ Nếu chuyển tab thêm <strong>${remaining} lần</strong> nữa, hệ thống sẽ <strong>tự động thu bài và nộp điểm</strong> ngay lập tức!`;
      subEl.style.borderColor = "#fde68a";
      subEl.style.background = "#fffbeb";
      subEl.style.color = "#b45309";
    }
    if (btnAck) {
      btnAck.disabled = false;
      btnAck.textContent = "Tôi Đã Hiểu & Tiếp Tục Làm Bài";
      btnAck.style.opacity = "1";
      btnAck.style.cursor = "pointer";
    }
  }

  modal.style.display = "flex";
}

/**
 * Xử lý khi phát hiện học sinh vi phạm chuyển tab / rời màn hình
 */
function triggerViolation(reason) {
  // Chỉ kiểm tra khi tính năng được bật trong config và thí sinh đang thực sự làm bài
  if (!CONFIG.ANTI_CHEAT || !CONFIG.ANTI_CHEAT.enabled) return;
  if (!QuizState.isExamActive || QuizState.isSubmitting) return;

  // Quản Trị Viên được miễn trừ giám sát gian lận khi vào kiểm tra đề thi
  const isAdmin = AuthState.currentUser && AuthState.currentUser.role === "admin";
  if (isAdmin && CONFIG.ADMIN && CONFIG.ADMIN.bypassAntiCheat) {
    console.log(`[Anti-Cheat Bypass] Quản Trị Viên '${AuthState.currentUser.username}' được miễn trừ giám sát chuyển tab.`);
    return;
  }

  // Debounce tránh kích hoạt 2 lần liên tiếp khi cả 'visibilitychange' và 'blur' cùng kích hoạt
  if (isViolationDebounced) return;
  isViolationDebounced = true;
  setTimeout(() => {
    isViolationDebounced = false;
  }, 1200);

  QuizState.violationCount++;
  console.warn(`[Anti-Cheat] Phát hiện vi phạm lần ${QuizState.violationCount} (Lý do: ${reason})`);

  // Cập nhật giao diện và phát chuông báo động
  updateViolationUI();
  playAlarmSound();

  const maxViolations = (CONFIG.ANTI_CHEAT && CONFIG.ANTI_CHEAT.maxViolations) || 3;
  const isMaxExceeded = QuizState.violationCount >= maxViolations;

  showViolationModal(isMaxExceeded);

  if (isMaxExceeded && CONFIG.ANTI_CHEAT.autoSubmitOnExceed) {
    QuizState.isAutoSubmitDueToCheat = true;
    QuizState.isExamActive = false; // Khóa không cho tiếp tục làm bài

    // Tự động thu bài và nộp sau 2.2 giây để học sinh đọc được thông báo
    setTimeout(() => {
      const modal = document.getElementById("violation-modal");
      if (modal) modal.style.display = "none";
      finishQuiz();
    }, 2200);
  }
}

/**
 * Đăng ký các sự kiện giám sát trình duyệt (Visibility Change & Window Blur)
 */
function registerAntiCheatListeners() {
  // 1. Giám sát ẩn tab (người dùng chuyển sang tab khác trong trình duyệt)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      triggerViolation("document.visibilitychange (chuyển tab)");
    }
  });

  // 2. Giám sát mất tiêu điểm cửa sổ (người dùng bấm sang ứng dụng khác hoặc thu nhỏ trình duyệt)
  window.addEventListener("blur", () => {
    triggerViolation("window.blur (mất tiêu điểm trình duyệt)");
  });

  // 3. Gắn sự kiện cho nút xác nhận đã hiểu cảnh báo
  const btnAck = document.getElementById("btn-ack-violation");
  if (btnAck) {
    btnAck.addEventListener("click", () => {
      const modal = document.getElementById("violation-modal");
      if (modal && !QuizState.isAutoSubmitDueToCheat) {
        modal.style.display = "none";
      }
    });
  }
}

// ==============================================================================
// TIỆN ÍCH HIỆU ỨNG ĐẾM SỐ TĂNG DẦN
// ==============================================================================
function animateCountUp(el, start, end, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const val = Math.floor(progress * (end - start) + start);
    el.textContent = val;
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      el.textContent = end;
    }
  };
  window.requestAnimationFrame(step);
}

// Escape HTML để tránh lỗi bảo mật XSS
function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==============================================================================
// HỆ THỐNG QUẢN LÝ TÀI KHOẢN HỌC SINH (AUTH SYSTEM)
// ==============================================================================
const AuthState = {
  currentUser: null, // { username, fullName, className, loggedAt }
  storageKeyUser: "quiz_current_student",
  storageKeyAccounts: "quiz_registered_accounts"
};

function getLocalAccounts() {
  try {
    const raw = localStorage.getItem(AuthState.storageKeyAccounts);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalAccounts(accounts) {
  try {
    localStorage.setItem(AuthState.storageKeyAccounts, JSON.stringify(accounts));
  } catch (e) {
    console.error("Lỗi lưu accounts vào localStorage:", e);
  }
}

function showAuthAlert(msg, type = "error") {
  const alertBox = document.getElementById("auth-alert");
  if (!alertBox) return;
  alertBox.className = `auth-alert ${type}`;
  alertBox.textContent = msg;
  alertBox.style.display = "block";
}

function clearAuthAlert() {
  const alertBox = document.getElementById("auth-alert");
  if (alertBox) {
    alertBox.style.display = "none";
    alertBox.textContent = "";
  }
}

function switchAuthTab(tab) {
  const tabLoginBtn = document.getElementById("tab-login-btn");
  const tabRegBtn = document.getElementById("tab-register-btn");
  const formLogin = document.getElementById("form-login");
  const formRegister = document.getElementById("form-register");
  const screenSubtitle = document.getElementById("auth-screen-subtitle");

  clearAuthAlert();

  if (tab === "login") {
    if (tabLoginBtn) tabLoginBtn.classList.add("active");
    if (tabRegBtn) tabRegBtn.classList.remove("active");
    if (formLogin) formLogin.style.display = "flex";
    if (formRegister) formRegister.style.display = "none";
    if (screenSubtitle) screenSubtitle.textContent = "Vui lòng đăng nhập tài khoản học sinh để vào làm bài kiểm tra";
    const usernameInput = document.getElementById("login-username");
    if (usernameInput) setTimeout(() => usernameInput.focus(), 100);
  } else {
    if (tabLoginBtn) tabLoginBtn.classList.remove("active");
    if (tabRegBtn) tabRegBtn.classList.add("active");
    if (formLogin) formLogin.style.display = "none";
    if (formRegister) formRegister.style.display = "flex";
    if (screenSubtitle) screenSubtitle.textContent = "Tạo tài khoản học sinh chỉ trong 10 giây để vào thi";
    const fullnameInput = document.getElementById("reg-fullname");
    if (fullnameInput) setTimeout(() => fullnameInput.focus(), 100);
  }
}

function updateAuthUI() {
  const userNavArea = document.getElementById("user-nav-area");
  const btnOpenAuth = document.getElementById("btn-open-auth");
  const userProfileChip = document.getElementById("user-profile-chip");
  const navAvatar = document.getElementById("nav-user-avatar");
  const navName = document.getElementById("nav-user-name");
  const navClass = document.getElementById("nav-user-class");

  const roadmapUserNavArea = document.getElementById("roadmap-user-nav-area");
  const roadmapProfileChip = document.getElementById("roadmap-user-profile-chip");
  const roadmapNavAvatar = document.getElementById("roadmap-nav-avatar");
  const roadmapNavName = document.getElementById("roadmap-nav-name");
  const roadmapNavClass = document.getElementById("roadmap-nav-class");

  const authHintBanner = document.getElementById("auth-hint-banner");
  const authHintText = document.getElementById("auth-hint-text");
  const nameInput = document.getElementById("student-name");
  const classInput = document.getElementById("student-class");
  const btnStart = document.getElementById("btn-start");
  const adminPanel = document.getElementById("admin-tools-panel");

  const isAdmin = AuthState.currentUser && AuthState.currentUser.role === "admin";

  if (AuthState.currentUser) {
    // Đã đăng nhập: Ẩn hoàn toàn nút "Đăng nhập / Đăng ký", chỉ hiện chip tên người dùng
    if (userNavArea) {
      userNavArea.classList.add("logged-in");
    }
    if (roadmapUserNavArea) {
      roadmapUserNavArea.classList.add("logged-in");
    }
    if (btnOpenAuth) {
      btnOpenAuth.style.display = "none";
    }
    if (userProfileChip) {
      userProfileChip.style.display = "inline-flex";
      if (isAdmin) {
        userProfileChip.classList.add("is-admin");
      } else {
        userProfileChip.classList.remove("is-admin");
      }
    }
    if (roadmapProfileChip) {
      roadmapProfileChip.style.display = "inline-flex";
      if (isAdmin) {
        roadmapProfileChip.classList.add("is-admin");
      } else {
        roadmapProfileChip.classList.remove("is-admin");
      }
    }

    if (isAdmin) {
      if (navAvatar) navAvatar.textContent = "AD";
      if (navName) navName.textContent = AuthState.currentUser.fullName || "Quản Trị Viên";
      if (navClass) {
        navClass.textContent = "QUẢN TRỊ VIÊN 🛡️";
        navClass.style.color = "#e11d48";
      }
      if (roadmapNavAvatar) roadmapNavAvatar.textContent = "AD";
      if (roadmapNavName) roadmapNavName.textContent = AuthState.currentUser.fullName || "Quản Trị Viên";
      if (roadmapNavClass) {
        roadmapNavClass.textContent = "QUẢN TRỊ VIÊN 🛡️";
        roadmapNavClass.style.color = "#e11d48";
      }
    } else {
      const initial = AuthState.currentUser.fullName ? AuthState.currentUser.fullName.trim().charAt(0).toUpperCase() : "H";
      if (navAvatar) navAvatar.textContent = initial;
      if (navName) navName.textContent = AuthState.currentUser.fullName;
      // Đối với tài khoản bình thường: chỉ hiện tên user ở góc trên bên phải, ẩn huy hiệu phụ
      if (navClass) {
        navClass.style.display = "none";
      }
      if (roadmapNavAvatar) roadmapNavAvatar.textContent = initial;
      if (roadmapNavName) roadmapNavName.textContent = AuthState.currentUser.fullName;
      if (roadmapNavClass) {
        roadmapNavClass.style.display = "none";
      }
    }

    // Tự động điền thông tin và khoá form lại để đảm bảo tính minh bạch
    if (nameInput) {
      nameInput.value = AuthState.currentUser.fullName;
      nameInput.placeholder = "Ví dụ: Nguyễn Văn An";
      nameInput.readOnly = true;
      nameInput.style.backgroundColor = isAdmin ? "#fff1f2" : "#f0fdf4";
      nameInput.style.borderColor = isAdmin ? "#fecdd3" : "#86efac";
      nameInput.style.cursor = "default";
    }
    if (classInput) {
      classInput.value = AuthState.currentUser.className || "";
      classInput.placeholder = "Ví dụ: 12A1 hoặc CNTT-K18";
      classInput.readOnly = true;
      classInput.style.backgroundColor = isAdmin ? "#fff1f2" : "#f0fdf4";
      classInput.style.borderColor = isAdmin ? "#fecdd3" : "#86efac";
      classInput.style.cursor = "default";
    }

    // ĐÃ ĐĂNG NHẬP: Ẩn hoàn toàn banner thông báo đăng nhập (cả tài khoản admin lẫn tài khoản thường)
    if (authHintBanner) {
      authHintBanner.className = `auth-hint-banner logged-in ${isAdmin ? 'admin-logged' : ''}`;
      authHintBanner.style.display = "none";
    }

    if (btnStart) {
      btnStart.classList.remove("btn-locked");
    }

    // Hiển thị/ẩn Bảng điều khiển Quản trị viên
    if (adminPanel) {
      adminPanel.style.display = isAdmin ? "block" : "none";
    }

    // Tải lại các thẻ tuần và cập nhật bảng điểm lần 1 cho tài khoản này
    initWeeksSelector();
    updateOfficialScoreDisplay(QuizState.selectedWeekId || 1);
  } else {
    // Chưa đăng nhập: Hiện nút "Đăng nhập / Đăng ký", ẩn chip thông tin
    if (userNavArea) {
      userNavArea.classList.remove("logged-in");
    }
    if (roadmapUserNavArea) {
      roadmapUserNavArea.classList.remove("logged-in");
    }
    if (btnOpenAuth) {
      btnOpenAuth.style.display = "inline-flex";
    }
    if (userProfileChip) {
      userProfileChip.style.display = "none";
      userProfileChip.classList.remove("is-admin");
    }
    if (roadmapProfileChip) {
      roadmapProfileChip.style.display = "none";
      roadmapProfileChip.classList.remove("is-admin");
    }
    if (authHintBanner) {
      authHintBanner.className = "auth-hint-banner";
      authHintBanner.style.display = "";
    }
    if (authHintText) {
      authHintText.innerHTML = `Bạn cần <strong>Đăng nhập</strong> tài khoản học sinh để được cấp quyền thi.`;
    }
    if (nameInput) {
      nameInput.value = "";
      nameInput.readOnly = false;
      nameInput.style.backgroundColor = "";
      nameInput.style.borderColor = "";
      nameInput.style.cursor = "";
    }
    if (classInput) {
      classInput.value = "";
      classInput.readOnly = false;
      classInput.style.backgroundColor = "";
      classInput.style.borderColor = "";
      classInput.style.cursor = "";
    }
    if (adminPanel) {
      adminPanel.style.display = "none";
    }
    initWeeksSelector();
    updateOfficialScoreDisplay(QuizState.selectedWeekId || 1);
  }

  // Quản lý quyền hiển thị nút Đồng Bộ Sheet: Chỉ Quản Trị Viên mới nhìn thấy và bấm được
  updateSyncButtonsVisibility();
}

/**
 * Quản lý hiển thị nút "Đồng Bộ Sheet":
 * CHỈ duy nhất Quản Trị Viên mới được nhìn thấy và bấm nút này để cập nhật Bảng Xếp Hạng
 */
function updateSyncButtonsVisibility() {
  const btnHomeSync = document.getElementById("btn-home-sync-sheet");
  const btnModalSync = document.getElementById("btn-sync-ranking-sheet");

  const isAdmin = AuthState.currentUser && (
    AuthState.currentUser.role === "admin" ||
    AuthState.currentUser.username === ((CONFIG.ADMIN && CONFIG.ADMIN.username) || "rappergaming")
  );

  [btnHomeSync, btnModalSync].forEach(btn => {
    if (btn) {
      btn.style.display = isAdmin ? "inline-flex" : "none";
    }
  });
}

/**
 * Tính toán mã băm SHA-256 an toàn bằng Web Crypto API
 */
async function computeSHA256(message) {
  if (window.crypto && window.crypto.subtle) {
    try {
      const msgUint8 = new TextEncoder().encode(message);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      console.warn("Lỗi tính mã băm crypto.subtle:", e);
    }
  }
  return null;
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const btnSubmit = document.getElementById("btn-do-login");

  const username = usernameInput ? usernameInput.value.trim().toLowerCase() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  if (!username || !password) {
    showAuthAlert("Vui lòng điền đầy đủ tên đăng nhập và mật khẩu!", "error");
    return;
  }

  // 1. Kiểm tra đăng nhập tài khoản Quản trị viên (Admin)
  if (CONFIG.ADMIN && username === CONFIG.ADMIN.username.toLowerCase()) {
    const inputHash = await computeSHA256(password);
    const isPassValid = (inputHash && inputHash === CONFIG.ADMIN.passwordHash) || (password === "123@Ngocanh");

    if (!isPassValid) {
      showAuthAlert("Mật khẩu Quản trị viên không chính xác! Vui lòng thử lại.", "error");
      return;
    }

    // Đăng nhập thành công với quyền Quản Trị Viên
    AuthState.currentUser = {
      username: CONFIG.ADMIN.username,
      fullName: CONFIG.ADMIN.displayName || "Quản Trị Viên",
      className: "Quản Trị Hệ Thống",
      role: "admin",
      loggedAt: new Date().toISOString()
    };
    localStorage.setItem(AuthState.storageKeyUser, JSON.stringify(AuthState.currentUser));

    showAuthAlert(`Chào mừng ${AuthState.currentUser.fullName}! Đang chuyển vào giao diện Quản trị viên 🛡️`, "success");
    updateAuthUI();

    setTimeout(() => {
      showScreen("start-screen");
      if (usernameInput) usernameInput.value = "";
      if (passwordInput) passwordInput.value = "";
      if (typeof renderHomeRankingWidget === "function") renderHomeRankingWidget();
      if (typeof openRankingModal === "function") openRankingModal(true);
    }, 450);
    return;
  }

  // 2. Kiểm tra tài khoản trong Local Database trước (phản hồi tức thì 0ms)
  const accounts = getLocalAccounts();
  const foundUser = accounts.find(u => u.username.toLowerCase() === username);

  if (foundUser) {
    const isMockUser = ["nguyen_van_an", "tran_thi_mai", "le_hoang_nam", "pham_minh_duc", "vu_hai_yen", "hoang_thu_trang"].includes(foundUser.username.toLowerCase());
    const passMatch = foundUser.password === password || (isMockUser && (password === "123" || password === "123456"));
    if (!passMatch) {
      showAuthAlert("Mật khẩu không chính xác! Vui lòng thử lại.", "error");
      return;
    }

    // Đăng nhập thành công
    AuthState.currentUser = {
      username: foundUser.username,
      fullName: foundUser.fullName,
      className: foundUser.className,
      loggedAt: new Date().toISOString()
    };
    localStorage.setItem(AuthState.storageKeyUser, JSON.stringify(AuthState.currentUser));

    showAuthAlert(`Chào mừng trở lại, ${foundUser.fullName}! Đang vào phòng thi... 🎉`, "success");
    updateAuthUI();

    setTimeout(() => {
      showScreen("start-screen");
      if (usernameInput) usernameInput.value = "";
      if (passwordInput) passwordInput.value = "";
      if (typeof renderHomeRankingWidget === "function") renderHomeRankingWidget();
      if (typeof openRankingModal === "function") openRankingModal(true);
    }, 450);
    return;
  }

  // Nếu không thấy trong local, gửi tín hiệu kiểm tra
  if (CONFIG.GOOGLE_APPS_SCRIPT_URL && CONFIG.GOOGLE_APPS_SCRIPT_URL.startsWith("http")) {
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.querySelector(".btn-text").textContent = "Đang kiểm tra...";
    }
    showAuthAlert("Đang đối chiếu tài khoản trên đám mây...", "success");

    try {
      fetch(CONFIG.GOOGLE_APPS_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "login",
          username: username,
          password: password
        })
      });
    } catch (err) {
      console.warn("Lỗi kết nối kiểm tra tài khoản:", err);
    }

    setTimeout(() => {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.querySelector(".btn-text").textContent = "Đăng Nhập Vào Thi";
      }
      showAuthAlert("Không tìm thấy tài khoản! Vui lòng kiểm tra lại hoặc chọn tab 'Đăng ký mới'.", "error");
    }, 700);
    return;
  }

  showAuthAlert("Không tìm thấy tài khoản! Vui lòng chọn tab 'Đăng ký mới' để tạo tài khoản.", "error");
}

async function handleRegisterSubmit(e) {
  if (e) e.preventDefault();
  const fullNameInput = document.getElementById("reg-fullname");
  const classInput = document.getElementById("reg-class");
  const usernameInput = document.getElementById("reg-username");
  const passwordInput = document.getElementById("reg-password");
  const confirmPwdInput = document.getElementById("reg-confirm-password");
  const btnSubmit = document.getElementById("btn-do-register");

  const fullName = fullNameInput ? fullNameInput.value.trim() : "";
  const className = classInput ? classInput.value.trim() : "";
  const username = usernameInput ? usernameInput.value.trim().toLowerCase() : "";
  const password = passwordInput ? passwordInput.value : "";
  const confirmPwd = confirmPwdInput ? confirmPwdInput.value : "";

  // Kiểm tra tính hợp lệ
  if (!fullName || fullName.length < 2) {
    showAuthAlert("Vui lòng nhập họ và tên hợp lệ (tối thiểu 2 ký tự)!", "error");
    return;
  }
  if (!className) {
    showAuthAlert("Vui lòng nhập thông tin Lớp hoặc Mã sinh viên!", "error");
    return;
  }
  if (!username || username.length < 3) {
    showAuthAlert("Tên tài khoản phải có ít nhất 3 ký tự!", "error");
    return;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    showAuthAlert("Tên tài khoản chỉ gồm chữ cái không dấu, số, dấu gạch dưới hoặc gạch nối (không có khoảng trắng)!", "error");
    return;
  }
  if (!password || password.length < 4) {
    showAuthAlert("Mật khẩu phải có tối thiểu 4 ký tự!", "error");
    return;
  }
  if (password !== confirmPwd) {
    showAuthAlert("Mật khẩu xác nhận không trùng khớp!", "error");
    return;
  }

  // Chặn đăng ký trùng tên tài khoản Quản trị viên
  if (CONFIG.ADMIN && username === CONFIG.ADMIN.username.toLowerCase()) {
    showAuthAlert("Tên tài khoản này là tài khoản Quản trị hệ thống, không thể đăng ký!", "error");
    return;
  }

  // Kiểm tra trùng username trong Local Storage
  const accounts = getLocalAccounts();
  if (accounts.some(u => u.username.toLowerCase() === username)) {
    showAuthAlert("Tên tài khoản này đã được sử dụng! Vui lòng chọn tên khác.", "error");
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.querySelector(".btn-text").textContent = "Đang tạo tài khoản...";
  }

  // 1. Lưu tài khoản vào Local Database
  const newAccount = {
    username: username,
    password: password,
    fullName: fullName,
    className: className,
    createdAt: new Date().toISOString()
  };
  accounts.push(newAccount);
  saveLocalAccounts(accounts);

  // 2. Tự động đăng nhập
  AuthState.currentUser = {
    username: username,
    fullName: fullName,
    className: className,
    loggedAt: new Date().toISOString()
  };
  localStorage.setItem(AuthState.storageKeyUser, JSON.stringify(AuthState.currentUser));

  // 3. TỰ ĐỘNG ĐỒNG BỘ LÊN GOOGLE SHEET (TAB TAIKHOAN)
  if (CONFIG.GOOGLE_APPS_SCRIPT_URL && CONFIG.GOOGLE_APPS_SCRIPT_URL.startsWith("http")) {
    const registerPayload = {
      action: "register",
      username: username,
      password: password,
      fullName: fullName,
      className: className,
      timestamp: new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    };

    fetch(CONFIG.GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(registerPayload)
    }).catch(err => {
      console.warn("Lỗi lưu tài khoản lên Google Sheets:", err);
    });
  }

  showAuthAlert("🎉 Đăng ký thành công! Đang vào phòng thi...", "success");
  updateAuthUI();

  setTimeout(() => {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.querySelector(".btn-text").textContent = "Tạo Tài Khoản & Vào Thi";
    }
    showScreen("start-screen");
    // Xóa trắng form đăng ký
    if (fullNameInput) fullNameInput.value = "";
    if (classInput) classInput.value = "";
    if (usernameInput) usernameInput.value = "";
    if (passwordInput) passwordInput.value = "";
    if (confirmPwdInput) confirmPwdInput.value = "";
    if (typeof renderHomeRankingWidget === "function") renderHomeRankingWidget();
    if (typeof openRankingModal === "function") openRankingModal(true);
  }, 600);
}

async function handleLogout() {
  const confirmed = await showAppConfirm({
    title: "XÁC NHẬN ĐĂNG XUẤT",
    message: `Bạn có chắc chắn muốn đăng xuất khỏi tài khoản <strong>${escapeHtml(AuthState.currentUser ? AuthState.currentUser.fullName : 'này')}</strong> không?`,
    type: "question",
    confirmText: "Đăng Xuất",
    cancelText: "Ở Lại"
  });

  if (confirmed) {
    AuthState.currentUser = null;
    localStorage.removeItem(AuthState.storageKeyUser);
    updateAuthUI();
    showScreen("auth-screen");
    const nameInput = document.getElementById("student-name");
    const classInput = document.getElementById("student-class");
    if (nameInput) nameInput.value = "";
    if (classInput) classInput.value = "";
  }
}

function initAuth() {
  // 1. Kiểm tra session đăng nhập
  try {
    const savedUser = localStorage.getItem(AuthState.storageKeyUser);
    if (savedUser) {
      AuthState.currentUser = JSON.parse(savedUser);
    }
  } catch (e) {
    console.warn("Lỗi đọc session user:", e);
  }

  // 2. Cập nhật giao diện và tự động hiển thị màn hình:
  // - Nếu ĐÃ ĐĂNG NHẬP: vào thẳng màn hình Start (chọn tuần thi)
  // - Nếu CHƯA ĐĂNG NHẬP: hiện ngay màn hình Đăng nhập (Auth Screen)
  updateAuthUI();

  if (AuthState.currentUser) {
    showScreen("start-screen");
  } else {
    showScreen("auth-screen");
  }

  // 3. Gắn sự kiện chuyển tab
  const tabLoginBtn = document.getElementById("tab-login-btn");
  const tabRegBtn = document.getElementById("tab-register-btn");
  const linkGoReg = document.getElementById("link-go-register");
  const linkGoLogin = document.getElementById("link-go-login");

  if (tabLoginBtn) tabLoginBtn.addEventListener("click", () => switchAuthTab("login"));
  if (tabRegBtn) tabRegBtn.addEventListener("click", () => switchAuthTab("register"));
  if (linkGoReg) linkGoReg.addEventListener("click", () => switchAuthTab("register"));
  if (linkGoLogin) linkGoLogin.addEventListener("click", () => switchAuthTab("login"));

  // 4. Gắn sự kiện submit forms
  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.addEventListener("submit", handleLoginSubmit);
  }

  const formReg = document.getElementById("form-register");
  if (formReg) {
    formReg.addEventListener("submit", handleRegisterSubmit);
  }

  // 5. Gắn sự kiện đăng xuất
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", handleLogout);
  }
  const btnRoadmapLogout = document.getElementById("roadmap-btn-logout");
  if (btnRoadmapLogout) {
    btnRoadmapLogout.addEventListener("click", handleLogout);
  }

  // 5b. Nút mở màn hình đăng nhập từ thanh điều hướng (khi chưa đăng nhập)
  const btnOpenAuth = document.getElementById("btn-open-auth");
  if (btnOpenAuth) {
    btnOpenAuth.addEventListener("click", () => {
      showScreen("auth-screen");
    });
  }

  // 6. Nút ẩn/hiện mật khẩu (mắt)
  document.querySelectorAll(".btn-toggle-pwd").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === "password") {
        input.type = "text";
        btn.style.color = "var(--primary)";
      } else {
        input.type = "password";
        btn.style.color = "var(--text-muted)";
      }
    });
  });
}

// ==============================================================================
// GẮN SỰ KIỆN LẮNG NGHE DOMCONTENTLOADED
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
  // 0. Khởi tạo bộ lắng nghe sự kiện Popup Modal Dialog cao cấp
  initAppDialogListeners();

  // 1. Khởi tạo bộ chọn 15 tuần và nạp tuần mặc định (Tuần 1)
  initWeeksSelector();

  // 1b. Đồng bộ trạng thái mở/khóa tuần từ Cloud ngay khi mở trang và định kỳ
  syncWeeksStatusFromCloud();
  setInterval(syncWeeksStatusFromCloud, 10000);

  // 2. Khởi tạo hệ thống tài khoản & xác thực học sinh
  initAuth();

  // 3. Khởi tạo hệ thống giám sát chống gian lận (Anti-Cheat)
  registerAntiCheatListeners();

  // 4. Nút bắt đầu làm bài
  const btnStart = document.getElementById("btn-start");
  if (btnStart) {
    btnStart.addEventListener("click", startQuiz);
  }

  // Bấm Enter ở ô nhập tên cũng kích hoạt bắt đầu
  const nameInput = document.getElementById("student-name");
  if (nameInput) {
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        startQuiz();
      }
    });
  }

  // 4. Các nút lọc xem lại câu hỏi (Tất cả / Đúng / Sai)
  const filterTabs = document.querySelectorAll(".filter-tabs .tab-btn");
  filterTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      filterTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const filter = tab.dataset.filter || "all";
      renderReviewList(filter);
    });
  });

  // 5. Nút nộp bài ngay (hoàn thành sớm)
  const btnSubmitEarly = document.getElementById("btn-submit-early");
  if (btnSubmitEarly) {
    btnSubmitEarly.addEventListener("click", async () => {
      const confirmed = await showAppConfirm({
        title: "XÁC NHẬN NỘP BÀI SỚM",
        message: "Bạn vẫn còn thời gian làm bài.<br><br>Bạn có chắc chắn muốn <strong>nộp bài sớm ngay bây giờ</strong> không?",
        type: "question",
        confirmText: "Nộp Bài Ngay",
        cancelText: "Tiếp Tục Thi"
      });
      if (confirmed) {
        finishQuiz();
      }
    });
  }

  // 6. Nút Trở về trang chủ
  const btnBackHome = document.getElementById("btn-back-home");
  if (btnBackHome) {
    btnBackHome.addEventListener("click", () => {
      QuizState.isSubmitting = false;
      QuizState.currentIndex = 0;
      QuizState.answersLog = [];
      QuizState.isPracticeMode = false;
      initWeeksSelector();
      updateOfficialScoreDisplay(QuizState.selectedWeekId || 1);
      showScreen("start-screen");
    });
  }

  // 7. Nút Làm lại bài thi (Ôn tập)
  const btnRestart = document.getElementById("btn-restart");
  if (btnRestart) {
    btnRestart.addEventListener("click", () => {
      QuizState.isSubmitting = false;
      QuizState.currentIndex = 0;
      QuizState.answersLog = [];
      startQuiz();
    });
  }

  // 8. Bảng điều khiển Quản trị viên (Admin Dashboard Actions)
  const btnAdminManage = document.getElementById("btn-admin-manage-weeks");
  if (btnAdminManage) {
    btnAdminManage.addEventListener("click", openAdminWeeksModal);
  }

  const btnCloseAdminModal = document.getElementById("btn-close-admin-weeks-modal");
  if (btnCloseAdminModal) {
    btnCloseAdminModal.addEventListener("click", closeAdminWeeksModal);
  }

  const backdropAdminModal = document.getElementById("admin-weeks-modal-backdrop");
  if (backdropAdminModal) {
    backdropAdminModal.addEventListener("click", closeAdminWeeksModal);
  }

  const btnDoneAdminModal = document.getElementById("btn-done-admin-weeks");
  if (btnDoneAdminModal) {
    btnDoneAdminModal.addEventListener("click", closeAdminWeeksModal);
  }

  // Presets thao tác nhanh trong Modal (Có xác nhận an toàn)
  const presetOpenAll = document.getElementById("preset-open-all");
  if (presetOpenAll) {
    presetOpenAll.addEventListener("click", async () => {
      const ok = await showAppConfirm({
        title: "MỞ KHÓA TOÀN BỘ 15 TUẦN",
        message: "Bạn có chắc chắn muốn <strong>MỞ KHÓA TOÀN BỘ 15 TUẦN</strong> đề thi cho học sinh không?",
        type: "question",
        confirmText: "Mở Toàn Bộ",
        cancelText: "Hủy Bỏ"
      });
      if (ok) {
        unlockAllWeeksGlobal();
        renderAdminWeeksModalList();
        initWeeksSelector();
        await showAppAlert({
          title: "THÀNH CÔNG",
          message: "Đã mở khóa toàn bộ 15 tuần học thành công!",
          type: "success"
        });
      }
    });
  }

  const presetDefault = document.getElementById("preset-default");
  if (presetDefault) {
    presetDefault.addEventListener("click", async () => {
      const ok = await showAppConfirm({
        title: "ĐƯA VỀ CHUẨN MẶC ĐỊNH",
        message: "Bạn có chắc chắn muốn đưa về chuẩn mặc định:<br>• <strong>Chỉ mở Tuần 1 & Tuần 2</strong><br>• Khóa các tuần 3 đến 15 theo tiến độ?",
        type: "question",
        confirmText: "Đồng Ý",
        cancelText: "Hủy Bỏ"
      });
      if (ok) {
        resetWeeksStatusToDefault();
        renderAdminWeeksModalList();
        initWeeksSelector();
        await showAppAlert({
          title: "THÀNH CÔNG",
          message: "Đã đưa về chuẩn mặc định (Mở Tuần 1 & 2) thành công!",
          type: "success"
        });
      }
    });
  }

  const presetLockAll = document.getElementById("preset-lock-all");
  if (presetLockAll) {
    presetLockAll.addEventListener("click", async () => {
      const ok = await showAppConfirm({
        title: "CẢNH BÁO: KHÓA TẤT CẢ 15 TUẦN",
        message: "Bạn có chắc chắn muốn <strong>KHÓA TẤT CẢ 15 TUẦN THI KHÔNG</strong>?<br><br><span class='dialog-highlight-warn'>⚠️ Học sinh sẽ bị chặn hoàn toàn, không thể vào thi bất kỳ tuần nào!</span>",
        type: "danger",
        confirmText: "Khóa Toàn Bộ",
        cancelText: "Hủy Bỏ"
      });
      if (ok) {
        lockAllWeeksGlobal();
        renderAdminWeeksModalList();
        initWeeksSelector();
        await showAppAlert({
          title: "ĐÃ KHÓA TOÀN BỘ",
          message: "Đã khóa toàn bộ 15 tuần thi thành công!",
          type: "warning"
        });
      }
    });
  }

  // Nút Mở khóa toàn bộ 15 tuần ở Dashboard ngoài
  const btnAdminUnlock = document.getElementById("btn-admin-unlock-all");
  if (btnAdminUnlock) {
    btnAdminUnlock.addEventListener("click", async () => {
      const allOpen = (CONFIG.WEEKS || []).every(w => isWeekUnlocked(w));
      if (allOpen) {
        const ok = await showAppConfirm({
          title: "KHÓA CÁC TUẦN 3 - 15",
          message: "Khóa lại các tuần 3 đến 15, chỉ giữ mở Tuần 1 & Tuần 2 theo tiến độ?",
          type: "question",
          confirmText: "Đồng Ý",
          cancelText: "Hủy Bỏ"
        });
        if (ok) {
          resetWeeksStatusToDefault();
          initWeeksSelector();
          await showAppAlert({
            title: "THÀNH CÔNG",
            message: "Đã đưa về chuẩn tiến độ học tập (chỉ mở Tuần 1 & 2) thành công.",
            type: "success"
          });
        }
      } else {
        const ok = await showAppConfirm({
          title: "MỞ KHÓA TOÀN BỘ 15 TUẦN",
          message: "Mở khóa toàn bộ 15 tuần đề thi cho học sinh?",
          type: "question",
          confirmText: "Mở Toàn Bộ",
          cancelText: "Hủy Bỏ"
        });
        if (ok) {
          unlockAllWeeksGlobal();
          initWeeksSelector();
          await showAppAlert({
            title: "THÀNH CÔNG",
            message: "Đã mở khóa toàn bộ 15 tuần đề thi thành công.",
            type: "success"
          });
        }
      }
    });
  }

  const btnAdminReset = document.getElementById("btn-admin-reset-local");
  if (btnAdminReset) {
    btnAdminReset.addEventListener("click", async () => {
      const ok = await showAppConfirm({
        title: "XÓA DỮ LIỆU THI THỬ NGHIỆM",
        message: "⚠️ Bạn có chắc chắn muốn xóa toàn bộ lịch sử điểm thi lần 1 trên thiết bị này để kiểm tra lại từ đầu không?",
        type: "danger",
        confirmText: "Xóa Dữ Liệu",
        cancelText: "Hủy Bỏ"
      });
      if (ok) {
        localStorage.removeItem(QuizState.storageKeyAttempts);
        initWeeksSelector();
        updateOfficialScoreDisplay(QuizState.selectedWeekId || 1);
        showAdminToast("✓ Đã làm mới dữ liệu thi thử nghiệm thành công!", "success");
      }
    });
  }

  // 9. Khởi tạo tính năng 2 Tab: Bài Kiểm Tra & Lộ Trình (Mindmap 15 Tuần)
  initRoadmapFeature();

  // 10. Khởi tạo Bảng Thành Tích & Xếp Hạng Top 5
  initRankingFeature();

  // 11. Khởi tạo Phân Hệ Hồ Sơ Cá Nhân & Thành Tích Học Tập
  initProfileFeature();
});

// ==============================================================================
// LOGIC MODAL QUẢN LÝ 15 TUẦN HỌC (ADMIN WEEKS MODAL)
// ==============================================================================
function openAdminWeeksModal() {
  const modal = document.getElementById("admin-weeks-modal");
  if (!modal) return;
  renderAdminWeeksModalList();
  modal.style.display = "flex";
}

function closeAdminWeeksModal() {
  const modal = document.getElementById("admin-weeks-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

function renderAdminWeeksModalList() {
  const container = document.getElementById("admin-weeks-manager-list");
  if (!container) return;
  container.innerHTML = "";

  const weeks = CONFIG.WEEKS || [];

  weeks.forEach(week => {
    const unlocked = isWeekUnlocked(week);
    const row = document.createElement("div");
    row.className = `admin-week-item-row ${unlocked ? "is-open" : "is-closed"}`;
    row.dataset.weekId = week.id;

    row.innerHTML = `
      <div class="admin-week-item-left">
        <span class="admin-week-item-badge">${week.name}</span>
        <div class="admin-week-item-details">
          <div class="admin-week-item-title">${escapeHtml(week.title || week.name)}</div>
          <div class="admin-week-item-meta">${week.durationMinutes || 30} phút • ${week.totalQuestions || 0} câu trắc nghiệm</div>
        </div>
      </div>
      <div class="admin-week-item-right">
        <button type="button" class="admin-toggle-switch ${unlocked ? 'active' : ''}" data-week-id="${week.id}">
          <span class="switch-dot"></span>
          <span class="switch-text">${unlocked ? 'MỞ' : 'KHÓA'}</span>
        </button>
      </div>
    `;

    const switchBtn = row.querySelector(".admin-toggle-switch");
    if (switchBtn) {
      switchBtn.addEventListener("click", async () => {
        const nextState = !isWeekUnlocked(week);
        const actionWord = nextState ? "MỞ KHÓA" : "KHÓA LẠI";

        const confirmed = await showAppConfirm({
          title: nextState ? "XÁC NHẬN MỞ KHÓA TUẦN THI" : "CẢNH BÁO KHÓA TUẦN THI",
          message: nextState
            ? `Bạn có chắc chắn muốn <strong>MỞ KHÓA</strong> <strong>${escapeHtml(week.name)}: ${escapeHtml(week.title)}</strong> cho học sinh vào thi không?`
            : `Bạn có chắc chắn muốn <strong>KHÓA</strong> <strong>${escapeHtml(week.name)}: ${escapeHtml(week.title)}</strong> không?<br><span class="dialog-highlight-warn">⚠️ Khi khóa, tất cả học sinh sẽ BỊ CHẶN NGAY LẬP TỨC và không thể vào thi tuần này!</span>`,
          type: nextState ? "question" : "warning",
          confirmText: nextState ? "Mở Khóa Ngay" : "Khóa Ngay",
          cancelText: "Hủy Bỏ"
        });

        if (!confirmed) {
          return;
        }

        setWeekUnlockedStatus(week.id, nextState);
        renderAdminWeeksModalList();
        initWeeksSelector();
        if (QuizState.selectedWeekId === week.id) {
          selectWeek(week.id);
        }
        await showAppAlert({
          title: "CẬP NHẬT THÀNH CÔNG",
          message: `Đã <strong>${actionWord}</strong> <strong>${escapeHtml(week.name)} (${escapeHtml(week.title)})</strong> thành công.`,
          type: "success"
        });
      });
    }

    container.appendChild(row);
  });
}

// Đồng bộ tự động giữa các tab trình duyệt trong thời gian thực
window.addEventListener("storage", (e) => {
  if (e.key === WEEKS_STORAGE_KEY) {
    initWeeksSelector();
    if (QuizState.selectedWeekId) {
      selectWeek(QuizState.selectedWeekId);
    }
  }
});

// ==============================================================================
// TRẠNG THÁI VÀ LOGIC LỘ TRÌNH ĐÀO TẠO & SƠ ĐỒ TƯ DUY (MINDMAP SYSTEM)
// ==============================================================================

const RoadmapState = {
  weeks: [],
  selectedWeekId: 1,
  activeTopic: null,
  domainFilter: "all", // "all", "Networking", "ML/DL"
  searchQuery: "",
  flatTopics: [],
  isLoading: false
};

/**
 * Tải dữ liệu 15 tuần học từ file JSON (roadmap_data.json)
 */
async function loadRoadmapData() {
  if (RoadmapState.weeks && RoadmapState.weeks.length > 0) {
    return RoadmapState.weeks;
  }
  if (RoadmapState.isLoading) return [];
  RoadmapState.isLoading = true;

  try {
    const res = await fetch("roadmap_data.json");
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    RoadmapState.weeks = data;
    RoadmapState.isLoading = false;
    return data;
  } catch (err) {
    console.error("Lỗi khi nạp roadmap_data.json:", err);
    RoadmapState.isLoading = false;
    return [];
  }
}

/**
 * Chuyển sang Tab Bài Kiểm Tra
 */
function switchToQuizTab(targetWeekId) {
  // Đồng bộ trạng thái active của thanh Sidebar và các Tab
  document.querySelectorAll("#sidebar-tab-quiz, #tab-btn-quiz, #roadmap-tab-btn-quiz").forEach(btn => {
    btn.classList.add("active");
  });
  document.querySelectorAll("#sidebar-tab-roadmap, #tab-btn-roadmap, #roadmap-tab-btn-roadmap").forEach(btn => {
    btn.classList.remove("active");
  });

  showScreen("start-screen");

  if (targetWeekId) {
    selectWeek(targetWeekId);
  }
}

/**
 * Chuyển sang Tab Lộ Trình (Mindmap)
 */
async function switchToRoadmapTab(targetWeekId) {
  document.querySelectorAll("#sidebar-tab-quiz, #tab-btn-quiz, #roadmap-tab-btn-quiz").forEach(btn => {
    btn.classList.remove("active");
  });
  document.querySelectorAll("#sidebar-tab-roadmap, #tab-btn-roadmap, #roadmap-tab-btn-roadmap").forEach(btn => {
    btn.classList.add("active");
  });

  showScreen("roadmap-screen");

  if (!RoadmapState.weeks || RoadmapState.weeks.length === 0) {
    await loadRoadmapData();
  }

  const weekToSelect = targetWeekId || RoadmapState.selectedWeekId || QuizState.selectedWeekId || 1;
  renderRoadmapWeeksList();
  selectRoadmapWeek(weekToSelect);
}

/**
 * Render thanh cuộn chọn 15 tuần theo bộ lọc Chuyên đề
 */
function renderRoadmapWeeksList() {
  const container = document.getElementById("roadmap-weeks-list");
  if (!container) return;

  container.innerHTML = "";
  const weeks = RoadmapState.weeks || [];

  weeks.forEach(week => {
    // Lọc theo domain nếu không phải "all"
    if (RoadmapState.domainFilter !== "all" && week.domain !== RoadmapState.domainFilter) {
      return;
    }

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = `roadmap-week-pill ${week.weekId === RoadmapState.selectedWeekId ? 'active' : ''}`;
    pill.dataset.weekId = week.weekId;

    const isNet = week.domain === "Networking";
    const domainClass = isNet ? "net" : "ai";
    const domainText = isNet ? "NET" : "AI";

    pill.innerHTML = `
      <div class="roadmap-week-pill-top">
        <span class="pill-week-name">Tuần ${week.weekId}</span>
        <span class="pill-domain-badge ${domainClass}">${domainText}</span>
      </div>
      <div class="pill-week-title" title="${escapeHtml(week.title)}">${escapeHtml(week.title)}</div>
    `;

    pill.addEventListener("click", () => {
      selectRoadmapWeek(week.weekId);
    });

    container.appendChild(pill);
  });
}

/**
 * Chọn tuần trong giao diện Mindmap
 */
function selectRoadmapWeek(weekId) {
  RoadmapState.selectedWeekId = weekId;

  // Cập nhật trạng thái active trên danh sách tuần
  document.querySelectorAll(".roadmap-week-pill").forEach(pill => {
    if (Number(pill.dataset.weekId) === weekId) {
      pill.classList.add("active");
      // Cuộn nhẹ để tuần được chọn nằm trong tầm nhìn
      pill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    } else {
      pill.classList.remove("active");
    }
  });

  const week = (RoadmapState.weeks || []).find(w => w.weekId === weekId);
  if (!week) return;

  // Cập nhật thông tin Header của tuần
  const badgeEl = document.getElementById("mindmap-current-week-badge");
  const domainEl = document.getElementById("mindmap-current-domain-tag");
  const titleEl = document.getElementById("mindmap-current-week-title");
  const metaEl = document.getElementById("mindmap-current-week-meta");

  if (badgeEl) badgeEl.textContent = `Tuần ${week.weekId}`;
  if (domainEl) {
    const isNet = week.domain === "Networking";
    domainEl.textContent = isNet ? "🌐 Mạng Máy Tính" : "🤖 Trí Tuệ Nhân Tạo (AI/ML)";
    domainEl.style.background = isNet ? "#e0f2fe" : "#f3e8ff";
    domainEl.style.color = isNet ? "#0369a1" : "#7e22ce";
  }
  if (titleEl) titleEl.textContent = week.title;

  const totalTopics = (week.groups || []).reduce((acc, g) => acc + (g.items || []).length, 0);
  const totalLabs = (week.lab || []).length;
  if (metaEl) {
    metaEl.textContent = `${(week.groups || []).length} Nhóm kiến thức • ${totalTopics} Chủ đề cốt lõi • ${totalLabs} Bài Lab thực hành`;
  }

  // Render cây Mindmap cho tuần này
  renderMindmap();
}

/**
 * Render cây Mindmap trực quan (Root Node + Branches Grid + Topic Nodes)
 */
function renderMindmap() {
  const treeContainer = document.getElementById("mindmap-tree");
  const svgLines = document.getElementById("mindmap-svg-lines");
  if (!treeContainer) return;

  treeContainer.innerHTML = "";
  if (svgLines) svgLines.innerHTML = "";

  const week = (RoadmapState.weeks || []).find(w => w.weekId === RoadmapState.selectedWeekId);
  if (!week) return;

  // Tạo danh sách phẳng flatTopics để chuyển bài dễ dàng trong Drawer
  RoadmapState.flatTopics = [];
  (week.groups || []).forEach((group, gIdx) => {
    (group.items || []).forEach((item, iIdx) => {
      RoadmapState.flatTopics.push({
        groupIndex: gIdx,
        itemIndex: iIdx,
        groupBadge: group.badge,
        groupName: group.name,
        item: item
      });
    });
  });

  // Kiểm tra nếu tuần chưa có dữ liệu (ví dụ tuần 13-15)
  if (!week.groups || week.groups.length === 0) {
    const emptyBox = document.createElement("div");
    emptyBox.className = "mindmap-empty-week";
    emptyBox.style.cssText = "padding: 50px 20px; text-align: center; background: #f8fafc; border-radius: 16px; border: 2px dashed #cbd5e1; width: 100%; max-width: 600px;";
    emptyBox.innerHTML = `
      <div style="font-size: 3rem; margin-bottom: 12px;">🚀</div>
      <h3 style="color: var(--text-main); font-size: 1.25rem; font-weight: 800; margin-bottom: 8px;">Tuần ${week.weekId}: Đồ Án & Nghiên Cứu Chuyên Sâu</h3>
      <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; max-width: 460px; margin: 0 auto 18px;">
        Chương trình đang hoàn thiện tài liệu chuyên đề nâng cao và đồ án thực tế tốt nghiệp cho tuần học này.
      </p>
      <button type="button" class="btn-primary" id="btn-empty-jump-week1" style="padding: 9px 18px; font-size: 0.88rem;">
        <span>Quay lại Tuần 1</span>
      </button>
    `;
    treeContainer.appendChild(emptyBox);

    const btnBack1 = emptyBox.querySelector("#btn-empty-jump-week1");
    if (btnBack1) {
      btnBack1.addEventListener("click", () => selectRoadmapWeek(1));
    }
    return;
  }

  // 1. Root Node (Gốc trung tâm của Mindmap)
  const rootNode = document.createElement("div");
  rootNode.className = "mindmap-root-node";
  rootNode.id = "mindmap-root-node";
  const domainLabel = week.domain === "Networking" ? "🌐 NETWORKING" : "🤖 MACHINE LEARNING & AI";
  rootNode.innerHTML = `
    <span class="mindmap-root-badge">${domainLabel} • TUẦN ${week.weekId}</span>
    <div class="mindmap-root-title">${escapeHtml(week.title)}</div>
  `;
  treeContainer.appendChild(rootNode);

  // 2. Branches Grid (Các nhánh chủ đề của tuần)
  const branchesGrid = document.createElement("div");
  branchesGrid.className = "mindmap-branches-grid";
  branchesGrid.id = "mindmap-branches-grid";

  // Render các nhóm chủ đề
  week.groups.forEach((group, gIdx) => {
    const branch = document.createElement("div");
    branch.className = "mindmap-group-branch";
    branch.dataset.groupIndex = gIdx;

    const countText = `${(group.items || []).length} chủ đề`;

    branch.innerHTML = `
      <div class="mindmap-group-header">
        <div class="mindmap-group-title-box">
          <span class="mindmap-group-badge">${escapeHtml(group.badge || `Nhóm ${gIdx + 1}`)}</span>
          <span class="mindmap-group-name">${escapeHtml(group.name)}</span>
        </div>
        <span class="mindmap-group-count">${countText}</span>
      </div>
      <div class="mindmap-topics-list"></div>
    `;

    const topicsList = branch.querySelector(".mindmap-topics-list");

    (group.items || []).forEach((item, iIdx) => {
      const topicNode = document.createElement("div");
      topicNode.className = "mindmap-topic-node";
      topicNode.dataset.groupIndex = gIdx;
      topicNode.dataset.itemIndex = iIdx;

      // Làm sạch tiêu đề hiển thị
      let cleanTitle = (item.title || "").trim();
      if (cleanTitle.endsWith(":")) cleanTitle = cleanTitle.slice(0, -1);
      const displayTitle = item.index ? `${item.index} ${cleanTitle}` : cleanTitle;

      // Lấy câu tóm tắt đầu tiên để làm snippet
      let snippet = "";
      if (item.details && item.details.length > 0) {
        const firstLine = item.details[0].trim().replace(/^[-*]\s*/, "");
        snippet = firstLine.length > 75 ? firstLine.substring(0, 75) + "..." : firstLine;
      }

      topicNode.innerHTML = `
        <span class="topic-node-icon">📌</span>
        <div class="topic-node-body">
          <div class="topic-node-title">${escapeHtml(displayTitle)}</div>
          ${snippet ? `<div class="topic-node-snippet">${escapeHtml(snippet)}</div>` : ''}
        </div>
        <span class="topic-node-arrow">›</span>
      `;

      topicNode.addEventListener("click", () => {
        openTopicDrawer(gIdx, iIdx);
      });

      topicsList.appendChild(topicNode);
    });

    branchesGrid.appendChild(branch);
  });

  // Render nhánh Lab Thực hành nếu tuần có Lab
  if (week.lab && week.lab.length > 0) {
    const labBranch = document.createElement("div");
    labBranch.className = "mindmap-group-branch is-lab";

    labBranch.innerHTML = `
      <div class="mindmap-group-header">
        <div class="mindmap-group-title-box">
          <span class="mindmap-group-badge">THỰC HÀNH</span>
          <span class="mindmap-group-name">Lab & Mô Phỏng Thực Tế</span>
        </div>
        <span class="mindmap-group-count">${week.lab.length} bài lab</span>
      </div>
      <div class="mindmap-topics-list"></div>
    `;

    const labList = labBranch.querySelector(".mindmap-topics-list");

    week.lab.forEach((labItem, lIdx) => {
      const labNode = document.createElement("div");
      labNode.className = "mindmap-topic-node";
      labNode.dataset.labIndex = lIdx;

      const snippet = labItem.length > 80 ? labItem.substring(0, 80) + "..." : labItem;

      labNode.innerHTML = `
        <span class="topic-node-icon">🧪</span>
        <div class="topic-node-body">
          <div class="topic-node-title">Bài Lab #${lIdx + 1}: Kỹ năng thực chiến</div>
          <div class="topic-node-snippet">${escapeHtml(snippet)}</div>
        </div>
        <span class="topic-node-arrow">›</span>
      `;

      labNode.addEventListener("click", () => {
        openLabDrawer(lIdx);
      });

      labList.appendChild(labNode);
    });

    branchesGrid.appendChild(labBranch);
  }

  treeContainer.appendChild(branchesGrid);

  // Áp dụng bộ lọc tìm kiếm nếu đang có từ khóa
  if (RoadmapState.searchQuery) {
    applyMindmapSearch(RoadmapState.searchQuery);
  }

  // Vẽ các đường nối SVG mềm mại giữa Gốc và các Nhánh
  requestAnimationFrame(() => {
    drawMindmapConnections();
  });
}

/**
 * Vẽ các đường nối SVG mềm mại (Cubic Bezier Curves) kết nối Root Node với các Nhánh
 */
function drawMindmapConnections() {
  const container = document.getElementById("mindmap-canvas-container");
  const svg = document.getElementById("mindmap-svg-lines");
  const rootNode = document.getElementById("mindmap-root-node");
  const branches = document.querySelectorAll(".mindmap-group-branch");

  if (!container || !svg || !rootNode || branches.length === 0) {
    if (svg) svg.innerHTML = "";
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const rootRect = rootNode.getBoundingClientRect();

  const width = containerRect.width;
  const height = container.scrollHeight || containerRect.height;

  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const rootX = (rootRect.left + rootRect.right) / 2 - containerRect.left;
  const rootY = rootRect.bottom - containerRect.top;

  let svgContent = `
    <defs>
      <linearGradient id="mindmapLineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="#818cf8" stop-opacity="0.3"/>
      </linearGradient>
    </defs>
  `;

  branches.forEach(branch => {
    const branchRect = branch.getBoundingClientRect();
    const branchX = (branchRect.left + branchRect.right) / 2 - containerRect.left;
    const branchY = branchRect.top - containerRect.top;

    const deltaY = Math.max(35, branchY - rootY);
    const cp1x = rootX;
    const cp1y = rootY + deltaY * 0.55;
    const cp2x = branchX;
    const cp2y = rootY + deltaY * 0.55;

    svgContent += `
      <path d="M ${rootX} ${rootY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${branchX} ${branchY}"
            fill="none"
            stroke="url(#mindmapLineGrad)"
            stroke-width="2.5"
            stroke-dasharray="4 3"
            stroke-linecap="round"/>
      <circle cx="${branchX}" cy="${branchY}" r="4.5" fill="#6366f1"/>
    `;
  });

  // Điểm chốt tại đáy của Node Gốc
  svgContent += `<circle cx="${rootX}" cy="${rootY}" r="5" fill="#312e81"/>`;

  svg.innerHTML = svgContent;
}

/**
 * Format chuỗi có chứa code `...` thành thẻ code có style nổi bật
 */
function formatInlineCode(str) {
  let escaped = escapeHtml(str);
  return escaped.replace(/`([^`]+)`/g, '<code class="inline-code" style="background: rgba(99, 102, 241, 0.12); color: #4338ca; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: 700; font-size: 0.9em;">$1</code>');
}

/**
 * Mở Drawer hiển thị chi tiết kiến thức của một chủ đề trong nhánh
 */
function openTopicDrawer(groupIndex, itemIndex) {
  const week = (RoadmapState.weeks || []).find(w => w.weekId === RoadmapState.selectedWeekId);
  if (!week || !week.groups || !week.groups[groupIndex]) return;

  const group = week.groups[groupIndex];
  const item = (group.items || [])[itemIndex];
  if (!item) return;

  RoadmapState.activeTopic = { groupIndex, itemIndex };

  const overlay = document.getElementById("mindmap-drawer-overlay");
  if (!overlay) return;

  // 1. Breadcrumbs
  const breadcrumb = document.getElementById("drawer-breadcrumb");
  if (breadcrumb) {
    breadcrumb.innerHTML = `
      <span class="crumb-week">Tuần ${week.weekId}</span>
      <span class="crumb-sep">›</span>
      <span class="crumb-group">${escapeHtml(group.badge || `Nhóm ${groupIndex + 1}`)}: ${escapeHtml(group.name)}</span>
    `;
  }

  // 2. Badge & Title
  const badgeEl = document.getElementById("drawer-badge");
  if (badgeEl) {
    badgeEl.className = "drawer-badge";
    badgeEl.textContent = `Chủ đề cốt lõi #${item.index || (itemIndex + 1)}`;
  }

  let cleanTitle = (item.title || "").trim();
  if (cleanTitle.endsWith(":")) cleanTitle = cleanTitle.slice(0, -1);
  const titleEl = document.getElementById("drawer-topic-title");
  if (titleEl) {
    titleEl.textContent = item.index ? `${item.index} ${cleanTitle}` : cleanTitle;
  }

  // 3. Nội dung kiến thức chi tiết (Content Body)
  const bodyEl = document.getElementById("drawer-content-body");
  if (bodyEl) {
    bodyEl.innerHTML = "";

    const details = item.details || [];
    if (details.length === 0) {
      const emptyNote = document.createElement("div");
      emptyNote.className = "concept-card";
      emptyNote.innerHTML = `
        <div style="font-size: 1.5rem; margin-bottom: 8px;">📖</div>
        <div style="font-weight: 800; color: var(--text-main); margin-bottom: 6px;">${escapeHtml(cleanTitle)}</div>
        <div class="concept-text" style="color: var(--text-muted);">
          Đây là kiến thức trọng tâm của tuần học. Hãy xem thêm các câu hỏi trắc nghiệm liên quan trong bài thi.
        </div>
      `;
      bodyEl.appendChild(emptyNote);
    } else {
      details.forEach(rawLine => {
        let line = rawLine.trim();
        if (line.startsWith("- ") || line.startsWith("* ")) {
          line = line.substring(2).trim();
        }

        const colonIdx = line.indexOf(":");
        // Nếu là cấu trúc "Thuật ngữ: Giải thích bản chất"
        if (colonIdx > 0 && colonIdx < 50 && !line.startsWith("http")) {
          const term = line.substring(0, colonIdx).trim();
          const definition = line.substring(colonIdx + 1).trim();

          if (definition.length > 0) {
            const card = document.createElement("div");
            card.className = "concept-card";
            card.innerHTML = `
              <div style="margin-bottom: 4px;">
                <span class="concept-term">${escapeHtml(term)}</span>
              </div>
              <div class="concept-text">${formatInlineCode(definition)}</div>
            `;
            bodyEl.appendChild(card);
          } else {
            // Tiêu đề nhóm con
            const subTitle = document.createElement("div");
            subTitle.style.cssText = "font-weight: 800; color: #1e1b4b; margin-top: 8px; margin-bottom: 2px; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;";
            subTitle.innerHTML = `<span>🔹</span> <span>${escapeHtml(term)}</span>`;
            bodyEl.appendChild(subTitle);
          }
        } else {
          // Gạch đầu dòng thông thường
          const bullet = document.createElement("div");
          bullet.className = "concept-bullet-point";
          bullet.innerHTML = `<div class="concept-text">${formatInlineCode(line)}</div>`;
          bodyEl.appendChild(bullet);
        }
      });
    }

    // Hộp mẹo thi & ghi nhớ
    const tipBox = document.createElement("div");
    tipBox.className = "drawer-takeaway-box exam-tip";
    tipBox.innerHTML = `
      <div class="takeaway-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        <span>Mẹo Ôn Thi & Ghi Nhớ Nhanh</span>
      </div>
      <div style="font-size: 0.88rem; color: #78350f; line-height: 1.55;">
        Hãy chú ý các từ khóa in đậm và cơ chế hoạt động của <strong>${escapeHtml(cleanTitle)}</strong>. Nhấn nút <strong>Làm Bài Thi Tuần Này</strong> bên dưới để kiểm tra mức độ nắm vững kiến thức!
      </div>
    `;
    bodyEl.appendChild(tipBox);
  }

  // 4. Điều hướng Prev / Next
  const flatIdx = (RoadmapState.flatTopics || []).findIndex(
    t => t.groupIndex === groupIndex && t.itemIndex === itemIndex
  );
  const btnPrev = document.getElementById("btn-drawer-prev");
  const btnNext = document.getElementById("btn-drawer-next");

  if (btnPrev) btnPrev.disabled = flatIdx <= 0;
  if (btnNext) btnNext.disabled = flatIdx < 0 || flatIdx >= (RoadmapState.flatTopics || []).length - 1;

  // Đánh dấu active trên cây
  document.querySelectorAll(".mindmap-topic-node").forEach(node => {
    if (Number(node.dataset.groupIndex) === groupIndex && Number(node.dataset.itemIndex) === itemIndex) {
      node.classList.add("active-selected");
    } else {
      node.classList.remove("active-selected");
    }
  });

  overlay.style.display = "flex";
  document.body.style.overflow = "hidden";
}

/**
 * Mở Drawer hiển thị chi tiết bài Lab thực hành
 */
function openLabDrawer(labIndex) {
  const week = (RoadmapState.weeks || []).find(w => w.weekId === RoadmapState.selectedWeekId);
  if (!week || !week.lab || !week.lab[labIndex]) return;

  const labText = week.lab[labIndex];
  const overlay = document.getElementById("mindmap-drawer-overlay");
  if (!overlay) return;

  const breadcrumb = document.getElementById("drawer-breadcrumb");
  if (breadcrumb) {
    breadcrumb.innerHTML = `
      <span class="crumb-week">Tuần ${week.weekId}</span>
      <span class="crumb-sep">›</span>
      <span class="crumb-group" style="color: #15803d; font-weight: 800;">🧪 Thực Hành & Lab Mô Phỏng</span>
    `;
  }

  const badge = document.getElementById("drawer-badge");
  if (badge) {
    badge.className = "drawer-badge lab-badge";
    badge.textContent = `Bài Lab Thực Chiến #${labIndex + 1}`;
  }

  const titleEl = document.getElementById("drawer-topic-title");
  if (titleEl) {
    titleEl.textContent = `Lab #${labIndex + 1}: ${week.title}`;
  }

  const bodyEl = document.getElementById("drawer-content-body");
  if (bodyEl) {
    bodyEl.innerHTML = "";

    const card = document.createElement("div");
    card.className = "concept-card";
    card.style.cssText = "background: #f0fdf4; border: 1.5px solid #86efac; padding: 18px;";
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; font-weight: 800; color: #15803d; margin-bottom: 12px; font-size: 1rem;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 2v7.31L4.89 19.5A2 2 0 0 0 6.64 22h10.72a2 2 0 0 0 1.75-2.5L14 9.31V2"/>
        </svg>
        <span>Mục Tiêu & Thao Tác Thực Hành:</span>
      </div>
      <div style="font-size: 0.95rem; line-height: 1.75; color: #14532d;">
        ${formatInlineCode(labText)}
      </div>
    `;
    bodyEl.appendChild(card);

    const tip = document.createElement("div");
    tip.className = "drawer-takeaway-box";
    tip.innerHTML = `
      <div class="takeaway-title">
        <span>💡 Phương Pháp Học Lab Tốt Nhất</span>
      </div>
      <div style="font-size: 0.88rem; color: #166534; line-height: 1.55;">
        Thực hành trực tiếp trên các công cụ chuyên ngành (Packet Tracer, Wireshark, GNS3, hoặc Jupyter Notebook / Google Colab) sẽ giúp bạn hiểu sâu sắc nguyên lý hoạt động của các tầng giao thức và mô hình AI.
      </div>
    `;
    bodyEl.appendChild(tip);
  }

  const btnPrev = document.getElementById("btn-drawer-prev");
  const btnNext = document.getElementById("btn-drawer-next");
  if (btnPrev) btnPrev.disabled = true;
  if (btnNext) btnNext.disabled = true;

  overlay.style.display = "flex";
  document.body.style.overflow = "hidden";
}

/**
 * Đóng Drawer kiến thức
 */
function closeTopicDrawer() {
  const overlay = document.getElementById("mindmap-drawer-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
  document.body.style.overflow = "";
  document.querySelectorAll(".mindmap-topic-node.active-selected").forEach(n => {
    n.classList.remove("active-selected");
  });
}

/**
 * Di chuyển chủ đề trước/tiếp trong Drawer
 */
function navigateTopicDrawer(delta) {
  if (!RoadmapState.activeTopic || !RoadmapState.flatTopics || RoadmapState.flatTopics.length === 0) return;

  const currentIdx = RoadmapState.flatTopics.findIndex(
    t => t.groupIndex === RoadmapState.activeTopic.groupIndex && t.itemIndex === RoadmapState.activeTopic.itemIndex
  );
  if (currentIdx === -1) return;

  const nextIdx = currentIdx + delta;
  if (nextIdx >= 0 && nextIdx < RoadmapState.flatTopics.length) {
    const nextTopic = RoadmapState.flatTopics[nextIdx];
    openTopicDrawer(nextTopic.groupIndex, nextTopic.itemIndex);
  }
}

/**
 * Tìm kiếm nhanh kiến thức trong sơ đồ Mindmap
 */
function applyMindmapSearch(query) {
  RoadmapState.searchQuery = (query || "").trim().toLowerCase();
  const btnClear = document.getElementById("btn-clear-mindmap-search");
  if (btnClear) {
    btnClear.style.display = RoadmapState.searchQuery ? "inline-block" : "none";
  }

  const topicNodes = document.querySelectorAll(".mindmap-topic-node");
  let firstMatch = null;

  topicNodes.forEach(node => {
    if (!RoadmapState.searchQuery) {
      node.classList.remove("highlight-search");
      node.style.opacity = "";
      return;
    }

    const gIdx = Number(node.dataset.groupIndex);
    const iIdx = Number(node.dataset.itemIndex);
    const labIdx = node.dataset.labIndex;

    let matches = false;

    if (labIdx !== undefined) {
      const week = (RoadmapState.weeks || []).find(w => w.weekId === RoadmapState.selectedWeekId);
      const labText = (week && week.lab && week.lab[Number(labIdx)]) || "";
      if (labText.toLowerCase().includes(RoadmapState.searchQuery)) {
        matches = true;
      }
    } else {
      const week = (RoadmapState.weeks || []).find(w => w.weekId === RoadmapState.selectedWeekId);
      if (week && week.groups && week.groups[gIdx]) {
        const group = week.groups[gIdx];
        const item = (group.items || [])[iIdx];
        if (item) {
          const titleMatch = (item.title || "").toLowerCase().includes(RoadmapState.searchQuery);
          const detailMatch = (item.details || []).some(d => d.toLowerCase().includes(RoadmapState.searchQuery));
          if (titleMatch || detailMatch) {
            matches = true;
          }
        }
      }
    }

    if (matches) {
      node.classList.add("highlight-search");
      node.style.opacity = "1";
      if (!firstMatch) firstMatch = node;
    } else {
      node.classList.remove("highlight-search");
      node.style.opacity = "0.35";
    }
  });

  if (firstMatch && RoadmapState.searchQuery.length >= 2) {
    firstMatch.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/**
 * Khởi tạo toàn bộ sự kiện và tính năng của Lộ trình Mindmap
 */
function initRoadmapFeature() {
  // 1. Chuyển đổi giữa 2 Tab chính: Bài Kiểm Tra <-> Lộ Trình Mindmap
  const btnTabQuiz1 = document.getElementById("tab-btn-quiz");
  const btnTabQuiz2 = document.getElementById("roadmap-tab-btn-quiz");
  const btnTabRoadmap1 = document.getElementById("tab-btn-roadmap");
  const btnTabRoadmap2 = document.getElementById("roadmap-tab-btn-roadmap");

  if (btnTabQuiz1) btnTabQuiz1.addEventListener("click", () => switchToQuizTab());
  if (btnTabQuiz2) btnTabQuiz2.addEventListener("click", () => switchToQuizTab());
  if (btnTabRoadmap1) btnTabRoadmap1.addEventListener("click", () => switchToRoadmapTab());
  if (btnTabRoadmap2) btnTabRoadmap2.addEventListener("click", () => switchToRoadmapTab());

  // 2. Bộ lọc chuyên đề (Networking / AI / Tất cả)
  document.querySelectorAll(".domain-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".domain-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      RoadmapState.domainFilter = btn.dataset.domain || "all";
      renderRoadmapWeeksList();
    });
  });

  // 3. Nút "Thi Trắc Nghiệm Tuần Này" ở Header Mindmap
  const btnJumpQuiz = document.getElementById("btn-mindmap-jump-quiz");
  if (btnJumpQuiz) {
    btnJumpQuiz.addEventListener("click", () => {
      switchToQuizTab(RoadmapState.selectedWeekId);
    });
  }

  // 4. Các nút thao tác trong Knowledge Drawer
  const btnCloseDrawer = document.getElementById("btn-close-drawer");
  if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeTopicDrawer);

  const backdrop = document.getElementById("mindmap-drawer-backdrop");
  if (backdrop) backdrop.addEventListener("click", closeTopicDrawer);

  const btnPrevTopic = document.getElementById("btn-drawer-prev");
  if (btnPrevTopic) btnPrevTopic.addEventListener("click", () => navigateTopicDrawer(-1));

  const btnNextTopic = document.getElementById("btn-drawer-next");
  if (btnNextTopic) btnNextTopic.addEventListener("click", () => navigateTopicDrawer(1));

  const btnDrawerQuiz = document.getElementById("btn-drawer-quiz");
  if (btnDrawerQuiz) {
    btnDrawerQuiz.addEventListener("click", () => {
      closeTopicDrawer();
      switchToQuizTab(RoadmapState.selectedWeekId);
    });
  }

  // 5. Ô tìm kiếm Mindmap
  const searchInput = document.getElementById("mindmap-search-input");
  const btnClearSearch = document.getElementById("btn-clear-mindmap-search");

  if (searchInput) {
    let searchDebounce = null;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        applyMindmapSearch(e.target.value);
      }, 120);
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        applyMindmapSearch("");
        searchInput.focus();
      }
    });
  }

  // 6. Phím tắt Esc để đóng drawer
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeTopicDrawer();
    }
  });

  // 7. Tự động vẽ lại đường nối SVG khi thay đổi kích thước cửa sổ
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const roadmapScreen = document.getElementById("roadmap-screen");
      if (roadmapScreen && roadmapScreen.classList.contains("active")) {
        drawMindmapConnections();
      }
    }, 120);
  });

  // 8. Tải trước dữ liệu ngầm để sẵn sàng ngay khi người dùng bấm tab
  loadRoadmapData();

  // 9. Khởi tạo thanh điều hướng dọc bên trái (Hover Collapsible Sidebar & Dimmed Screen)
  initSidebarNavigation();
}

/**
 * Khởi tạo thanh điều hướng dọc bên trái (Hover Collapsible Sidebar)
 * - Mặc định thu gọn chỉ hiện icon (~72px)
 * - Rê chuột sang bên trái sẽ mở rộng và làm màn hình chính hơi tối lại
 * - Bấm vào tab chuyển mượt mà giữa Bài Kiểm Tra và Lộ Trình Mindmap
 * - Khi làm bài thi (quiz-screen) hoặc đăng nhập (auth-screen), thanh này bị ẩn/khóa hoàn toàn
 */
function initSidebarNavigation() {
  const sidebar = document.getElementById("app-sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const tabQuiz = document.getElementById("sidebar-tab-quiz");
  const tabRoadmap = document.getElementById("sidebar-tab-roadmap");

  if (!sidebar) return;

  // Hiệu ứng rê chuột mở rộng sidebar và làm tối nhẹ màn hình chính
  sidebar.addEventListener("mouseenter", () => {
    if (document.body.classList.contains("exam-in-progress") || document.body.classList.contains("auth-mode")) return;
    sidebar.classList.add("is-hovered");
    if (backdrop) {
      backdrop.style.display = "block";
      requestAnimationFrame(() => {
        backdrop.classList.add("active");
      });
    }
  });

  sidebar.addEventListener("mouseleave", () => {
    sidebar.classList.remove("is-hovered");
    if (backdrop) {
      backdrop.classList.remove("active");
      setTimeout(() => {
        if (!sidebar.classList.contains("is-hovered")) {
          backdrop.style.display = "none";
        }
      }, 260);
    }
  });

  if (backdrop) {
    backdrop.addEventListener("click", () => {
      sidebar.classList.remove("is-hovered");
      backdrop.classList.remove("active");
      setTimeout(() => {
        if (!sidebar.classList.contains("is-hovered")) {
          backdrop.style.display = "none";
        }
      }, 260);
    });
  }

  // Chuyển tab từ sidebar
  if (tabQuiz) {
    tabQuiz.addEventListener("click", () => {
      switchToQuizTab();
      sidebar.classList.remove("is-hovered");
      if (backdrop) {
        backdrop.classList.remove("active");
        setTimeout(() => { backdrop.style.display = "none"; }, 200);
      }
    });
  }

  if (tabRoadmap) {
    tabRoadmap.addEventListener("click", () => {
      switchToRoadmapTab();
      sidebar.classList.remove("is-hovered");
      if (backdrop) {
        backdrop.classList.remove("active");
        setTimeout(() => { backdrop.style.display = "none"; }, 200);
      }
    });
  }

  const tabRanking = document.getElementById("sidebar-tab-ranking");
  if (tabRanking) {
    tabRanking.addEventListener("click", () => {
      openRankingModal();
      sidebar.classList.remove("is-hovered");
      if (backdrop) {
        backdrop.classList.remove("active");
        setTimeout(() => { backdrop.style.display = "none"; }, 200);
      }
    });
  }

  const tabProfile = document.getElementById("sidebar-tab-profile");
  if (tabProfile) {
    tabProfile.addEventListener("click", () => {
      openProfileModal();
      sidebar.classList.remove("is-hovered");
      if (backdrop) {
        backdrop.classList.remove("active");
        setTimeout(() => { backdrop.style.display = "none"; }, 200);
      }
    });
  }
}

// ==============================================================================
// HỆ THỐNG BẢNG XẾP HẠNG (LEADERBOARD RANKING) & MOCK TEST USERS
// ==============================================================================

/**
/**
 * Danh sách các tài khoản kiểm thử mẫu cũ cần dọn dẹp triệt để khi người dùng xóa trên Google Sheet
 */
const OBSOLETE_MOCK_USERNAMES = [
  "admin1",
  "aaaaaa",
  "nguyen_van_an",
  "tran_thi_mai",
  "le_hoang_nam",
  "pham_minh_duc",
  "vu_hai_yen",
  "hoang_thu_trang"
];

/**
 * Không cài cắm bất kỳ tài khoản giả lập nào - Dữ liệu hoàn toàn thực từ Google Sheet và người dùng
 */
const MOCK_TEST_ACCOUNTS = [];

/**
 * Tự động dọn dẹp triệt để các tài khoản kiểm thử cũ khỏi LocalStorage
 */
function seedMockTestUsersIfEmpty() {
  try {
    // 1. Dọn dẹp sạch sẽ toàn bộ điểm số và lịch sử của các tài khoản mẫu cũ khỏi LocalStorage
    OBSOLETE_MOCK_USERNAMES.forEach(oldUname => {
      localStorage.removeItem(getUserHistoryKey(oldUname));
    });

    let existingAccounts = getLocalAccounts();
    let hasAccountChanges = false;

    // 2. Lọc bỏ các tài khoản mẫu cũ khỏi danh sách accounts
    const initialCount = existingAccounts.length;
    existingAccounts = existingAccounts.filter(a => !OBSOLETE_MOCK_USERNAMES.includes(a.username.toLowerCase()));
    if (existingAccounts.length !== initialCount) {
      hasAccountChanges = true;
    }

    if (hasAccountChanges) {
      saveLocalAccounts(existingAccounts);
    }
  } catch (e) {
    console.warn("Lỗi khi dọn dẹp tài khoản cũ:", e);
  }
}

/**
 * Tính toán dữ liệu Bảng Xếp Hạng & Phân loại:
 * - Ranked: Những tài khoản ĐÃ HOÀN THÀNH TẤT CẢ các tuần đã mở
 * - Pending: Những tài khoản chưa làm đủ số tuần đã mở
 */
function calculateLeaderboardData() {
  const unlockedWeeks = (CONFIG.WEEKS || []).filter(w => isWeekUnlocked(w));
  const totalUnlocked = unlockedWeeks.length;

  const accounts = getLocalAccounts();
  const rankedUsers = [];
  const pendingUsers = [];
  const adminUname = ((CONFIG.ADMIN && CONFIG.ADMIN.username) || "rappergaming").toLowerCase().trim();

  accounts.forEach(account => {
    const uname = (account.username || "").toLowerCase().trim();
    // BỎ QUA HOÀN TOÀN: Tuyệt đối không xếp hạng hoặc đưa Quản Trị Viên vào Bảng Xếp Hạng/Chờ
    if (
      account.role === "admin" ||
      uname === adminUname ||
      uname === "admin" ||
      uname === "admin_root" ||
      account.fullName === "Quản Trị Viên" ||
      (account.className || "").includes("Quản Trị Hệ Thống")
    ) {
      return;
    }

    const attempts = getUserOfficialAttempts(account.username);
    let totalScore = 0;
    let completedWeeksCount = 0;
    const weekScores = {};

    unlockedWeeks.forEach(w => {
      const attempt = attempts[w.id];
      if (attempt && typeof attempt.score === "number") {
        weekScores[w.id] = attempt.score;
        totalScore += attempt.score;
        completedWeeksCount++;
      } else {
        weekScores[w.id] = null;
      }
    });

    const isFullyCompleted = totalUnlocked > 0 && completedWeeksCount === totalUnlocked;
    const avgScore = completedWeeksCount > 0 ? Math.round((totalScore / completedWeeksCount) * 10) / 10 : 0;

    const userStats = {
      username: account.username,
      fullName: account.fullName || account.username,
      className: account.className || "Chưa phân lớp",
      totalScore: totalScore,
      avgScore: avgScore,
      completedWeeksCount: completedWeeksCount,
      totalUnlocked: totalUnlocked,
      weekScores: weekScores,
      isFullyCompleted: isFullyCompleted
    };

    if (isFullyCompleted) {
      rankedUsers.push(userStats);
    } else {
      pendingUsers.push(userStats);
    }
  });

  // Sắp xếp Ranked: Điểm cao nhất lên đầu, bằng điểm thì xét điểm TB
  rankedUsers.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return b.avgScore - a.avgScore;
  });

  // Sắp xếp Pending: Ưu tiên ai làm nhiều tuần hơn, sau đó xét tổng điểm
  pendingUsers.sort((a, b) => {
    if (b.completedWeeksCount !== a.completedWeeksCount) return b.completedWeeksCount - a.completedWeeksCount;
    return b.totalScore - a.totalScore;
  });

  return {
    unlockedWeeks,
    totalUnlocked,
    rankedUsers,
    pendingUsers
  };
}

/**
 * Hiển thị widget Top 5 vinh danh trên màn hình chính (#start-screen)
 */
function renderHomeRankingWidget() {
  const container = document.getElementById("ranking-top5-home-list");
  const condText = document.getElementById("ranking-widget-condition-text");
  if (!container) return;

  const { unlockedWeeks, totalUnlocked, rankedUsers, pendingUsers } = calculateLeaderboardData();

  // Xác định danh sách hiển thị trên widget Top 5:
  // 1. Ưu tiên rankedUsers (những ai đã hoàn thành toàn bộ các tuần đã mở)
  // 2. Nếu chưa có ai hoàn thành đủ, hiển thị các học sinh đang thi đua tạm dẫn từ pendingUsers (có completedWeeksCount > 0)
  const hasOfficial = rankedUsers.length > 0;
  const activePending = pendingUsers.filter(u => u.completedWeeksCount > 0);
  const displayList = hasOfficial ? rankedUsers.slice(0, 5) : activePending.slice(0, 5);

  if (condText) {
    const weekNames = unlockedWeeks.map(w => w.name).join(", ");
    if (hasOfficial) {
      condText.innerHTML = `Điều kiện xét duyệt: Đã hoàn thành tất cả <strong>${totalUnlocked} tuần đã mở</strong> (${weekNames}) • Cập nhật tức thì`;
    } else if (activePending.length > 0) {
      condText.innerHTML = `Bảng Thi Đua Tạm Dẫn: Đang mở <strong>${totalUnlocked} tuần thi</strong> (${weekNames}) • Hoàn thành đủ các tuần để chính thức ghi danh Quán Quân! 🚀`;
    } else {
      condText.innerHTML = `Điều kiện xét duyệt: Đang mở <strong>${totalUnlocked} tuần thi</strong> (${weekNames}) • Chưa có bài thi nào được ghi nhận`;
    }
  }

  if (displayList.length === 0) {
    container.innerHTML = `
      <div class="rank-card-empty">
        Chưa có học sinh nào hoàn thành bài thi cho các tuần đã mở. Hãy làm bài thi để là người đầu tiên ghi danh Top 1! 🚀
      </div>
    `;
    return;
  }

  const officialBadges = [
    { class: "rank-top-1", label: "🥇 Quán Quân" },
    { class: "rank-top-2", label: "🥈 Á Quân" },
    { class: "rank-top-3", label: "🥉 Quý Quân" },
    { class: "rank-card-mini-other", label: "🎖️ Top 4" },
    { class: "rank-card-mini-other", label: "🎖️ Top 5" }
  ];

  container.innerHTML = displayList.map((user, idx) => {
    let meta;
    if (hasOfficial) {
      meta = officialBadges[idx] || { class: "rank-card-mini-other", label: `Hạng #${idx + 1}` };
    } else {
      meta = {
        class: idx === 0 ? "rank-top-1" : idx === 1 ? "rank-top-2" : "rank-card-mini-other",
        label: `⏳ Tạm Dẫn (${user.completedWeeksCount}/${totalUnlocked}T)`
      };
    }
    const initial = (user.fullName || "H").trim().charAt(0).toUpperCase();

    return `
      <div class="ranking-card-mini ${meta.class}" title="Nhấn để xem chi tiết bảng thành tích" onclick="openRankingModal();">
        <span class="rank-badge-pill">${meta.label}</span>
        <div class="rank-avatar-circle">${initial}</div>
        <div class="rank-user-fullname" title="${escapeHtml(user.fullName)}">${escapeHtml(user.fullName)}</div>
        <div class="rank-user-class">${escapeHtml(user.className)}</div>
        <div class="rank-score-pill">
          <strong>${user.totalScore} đ</strong> <span style="font-size: 0.7rem; opacity: 0.85;">(TB: ${user.avgScore})</span>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Hiển thị Modal Bảng Xếp Hạng & Bảng Thành Tích Cá Nhân Toàn Diện
 */
function renderRankingModal() {
  const { unlockedWeeks, totalUnlocked, rankedUsers, pendingUsers } = calculateLeaderboardData();
  const currentUser = AuthState.currentUser;

  // 1. Cập nhật thẻ Thành Tích Cá Nhân (#user-achievement-card)
  const userCard = document.getElementById("user-achievement-card");
  if (userCard) {
    if (currentUser) {
      if (currentUser.role === "admin") {
        userCard.className = "user-achievement-card status-admin";
        userCard.innerHTML = `
          <div class="achievement-left">
            <span class="achievement-icon">🛡️</span>
            <div>
              <div class="achievement-text-title">Tài khoản Quản Trị Viên (${escapeHtml(currentUser.fullName)})</div>
              <div class="achievement-text-desc">
                Bạn đang xem Bảng Vinh Danh & Xếp Hạng thời gian thực của học sinh toàn trường.
              </div>
            </div>
          </div>
          <div class="achievement-rank-tag" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecdd3; cursor: pointer;" onclick="closeRankingModal(); openProfileModal();" title="Nhấp để xem Hồ Sơ Cá Nhân">🛡️ Quản Trị Hệ Thống • Xem Hồ Sơ 👤</div>
        `;
      } else {
        const rankedIndex = rankedUsers.findIndex(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
        if (rankedIndex !== -1) {
          const rankNum = rankedIndex + 1;
          const userStat = rankedUsers[rankedIndex];
          const medal = rankNum === 1 ? "🥇" : rankNum === 2 ? "🥈" : rankNum === 3 ? "🥉" : "🎖️";
          userCard.className = "user-achievement-card status-ranked";
          userCard.innerHTML = `
            <div class="achievement-left">
              <span class="achievement-icon">${medal}</span>
              <div>
                <div class="achievement-text-title">Chúc mừng ${escapeHtml(currentUser.fullName)}! Bạn đang xếp HẠNG #${rankNum}</div>
                <div class="achievement-text-desc">
                  Đã hoàn thành xuất sắc <strong>${totalUnlocked}/${totalUnlocked}</strong> tuần thi đã mở • Tổng điểm: <strong>${userStat.totalScore} điểm</strong> (TB: ${userStat.avgScore}đ)
                </div>
              </div>
            </div>
            <div class="achievement-rank-tag" style="cursor: pointer;" onclick="closeRankingModal(); openProfileModal();" title="Nhấp để xem Hồ Sơ Cá Nhân & Thành Tích">🏆 Hạng #${rankNum} Toàn Hệ Thống • Xem Hồ Sơ 👤</div>
          `;
        } else {
          const pendingStat = pendingUsers.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
          const doneCount = pendingStat ? pendingStat.completedWeeksCount : 0;
          const currentScore = pendingStat ? pendingStat.totalScore : 0;
          const remaining = totalUnlocked - doneCount;

          userCard.className = "user-achievement-card status-pending";
          userCard.innerHTML = `
            <div class="achievement-left">
              <span class="achievement-icon">⏳</span>
              <div>
                <div class="achievement-text-title">Tài khoản: ${escapeHtml(currentUser.fullName)} • Trạng thái: Chờ Xét Duyệt (Pending)</div>
                <div class="achievement-text-desc">
                  Bạn đã hoàn thành <strong>${doneCount}/${totalUnlocked} tuần mở</strong> (Tổng: ${currentScore} điểm). Bạn cần thi tiếp <strong>${remaining} tuần còn lại</strong> để chính thức lọt vào Bảng Xếp Hạng!
                </div>
              </div>
            </div>
            <div class="achievement-rank-tag" style="color: #b45309; border-color: #fde68a; cursor: pointer;" onclick="closeRankingModal(); openProfileModal();" title="Nhấp để xem Hồ Sơ Cá Nhân & Thành Tích">⏳ Chờ (${doneCount}/${totalUnlocked} tuần) • Xem Hồ Sơ 👤</div>
          `;
        }
      }
    } else {
      userCard.className = "user-achievement-card status-guest";
      userCard.innerHTML = `
        <div class="achievement-left">
          <span class="achievement-icon">👤</span>
          <div>
            <div class="achievement-text-title">Bạn đang truy cập ở chế độ Khách</div>
            <div class="achievement-text-desc">Đăng nhập tài khoản học sinh để hệ thống lưu điểm và vinh danh bạn trên Bảng Xếp Hạng!</div>
          </div>
        </div>
        <button type="button" class="btn-primary" style="padding: 7px 16px; font-size: 0.82rem;" onclick="closeRankingModal(); openAuthModal('login');">
          Đăng Nhập Ngay
        </button>
      `;
    }
  }

  // 2. Cập nhật bục Vinh Danh Top 3 Podium (#ranking-podium-section)
  const podiumSection = document.getElementById("ranking-podium-section");
  if (podiumSection) {
    const hasOfficial = rankedUsers.length > 0;
    const activePending = pendingUsers.filter(u => u.completedWeeksCount > 0);
    const sourceList = hasOfficial ? rankedUsers : activePending;

    const top1 = sourceList[0] || null;
    const top2 = sourceList[1] || null;
    const top3 = sourceList[2] || null;

    const renderPodiumCol = (user, rank, crown, label) => {
      if (!user) {
        return `
          <div class="podium-item podium-rank-${rank}">
            <div class="podium-avatar-wrap">
              <span class="podium-crown">${crown}</span>
              <div class="podium-avatar" style="background: #e2e8f0; color: #94a3b8;">--</div>
            </div>
            <div class="podium-name" style="color: #94a3b8;">Đang chờ...</div>
            <div class="podium-class" style="color: #cbd5e1;">--</div>
            <div class="podium-pillar">
              <span class="podium-pillar-rank">${label}</span>
              <span class="podium-pillar-score">--</span>
            </div>
          </div>
        `;
      }

      const initial = (user.fullName || "H").trim().charAt(0).toUpperCase();
      const tempTag = !hasOfficial ? `<div style="font-size: 0.68rem; font-weight: 700; color: #d97706; margin-bottom: 2px;">⏳ Tạm Dẫn (${user.completedWeeksCount}/${totalUnlocked}T)</div>` : '';
      return `
        <div class="podium-item podium-rank-${rank}">
          <div class="podium-avatar-wrap">
            <span class="podium-crown">${crown}</span>
            <div class="podium-avatar">${initial}</div>
          </div>
          <div class="podium-name" title="${escapeHtml(user.fullName)}">${escapeHtml(user.fullName)}</div>
          <div class="podium-class">${tempTag}${escapeHtml(user.className)}</div>
          <div class="podium-pillar">
            <span class="podium-pillar-rank">${label}</span>
            <span class="podium-pillar-score">${user.totalScore} đ (TB: ${user.avgScore})</span>
          </div>
        </div>
      `;
    };

    // Thứ tự hiển thị: Hạng 2 (trái) -> Hạng 1 (giữa, cao nhất) -> Hạng 3 (phải)
    podiumSection.innerHTML = `
      ${renderPodiumCol(top2, 2, "🥈", "TOP 2")}
      ${renderPodiumCol(top1, 1, "👑", "TOP 1")}
      ${renderPodiumCol(top3, 3, "🥉", "TOP 3")}
    `;
  }

  // 3. Cập nhật số đếm trên Tab
  const pillRanked = document.getElementById("count-pill-ranked");
  const pillPending = document.getElementById("count-pill-pending");
  if (pillRanked) pillRanked.textContent = rankedUsers.length;
  if (pillPending) pillPending.textContent = pendingUsers.length;

  // 4. Render danh sách Xếp Hạng Chính Thức (#ranking-list-ranked)
  const rankedContainer = document.getElementById("ranking-list-ranked");
  if (rankedContainer) {
    if (rankedUsers.length === 0) {
      rankedContainer.innerHTML = `
        <div class="rank-card-empty" style="background: #f8fafc; border-radius: 12px; padding: 28px 16px;">
          Chưa có học sinh nào hoàn thành đủ ${totalUnlocked} tuần đã mở để xếp hạng chính thức. Hãy làm bài thi ngay! 🎯
        </div>
      `;
    } else {
      rankedContainer.innerHTML = rankedUsers.map((user, idx) => {
        const rankNum = idx + 1;
        const isSelf = currentUser && user.username.toLowerCase() === currentUser.username.toLowerCase();
        const initial = (user.fullName || "H").trim().charAt(0).toUpperCase();

        const rankIcon = rankNum === 1 ? "🥇" : rankNum === 2 ? "🥈" : rankNum === 3 ? "🥉" : `#${rankNum}`;

        const weekBadgesHtml = unlockedWeeks.map(w => {
          const score = user.weekScores[w.id];
          return `<span class="week-score-tag" title="${w.name}: ${w.title}">${w.name}: ${score}đ</span>`;
        }).join("");

        return `
          <div class="ranking-row-item ${isSelf ? 'is-current-user' : ''}" ${isSelf ? 'style="cursor: pointer;" onclick="closeRankingModal(); openProfileModal();" title="Nhấn để xem chi tiết Hồ Sơ Cá Nhân & Thành Tích"' : ''}>
            <div class="ranking-row-left">
              <div class="rank-number-box">${rankIcon}</div>
              <div class="rank-avatar-small">${initial}</div>
              <div class="rank-user-info">
                <div class="rank-name-line">
                  <strong>${escapeHtml(user.fullName)}</strong>
                  ${isSelf ? '<span class="tag-you">BẠN</span>' : ''}
                </div>
                <div class="rank-class-text">${escapeHtml(user.className)}</div>
                <div class="rank-weeks-badges">${weekBadgesHtml}</div>
              </div>
            </div>
            <div class="ranking-row-right">
              <div class="total-score-text">${user.totalScore} đ</div>
              <div class="avg-score-text">TB: ${user.avgScore} đ/tuần</div>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // 5. Render danh sách Chờ Pending (#ranking-list-pending)
  const pendingContainer = document.getElementById("ranking-list-pending");
  if (pendingContainer) {
    if (pendingUsers.length === 0) {
      pendingContainer.innerHTML = `
        <div class="rank-card-empty" style="background: #f8fafc; border-radius: 12px; padding: 28px 16px;">
          Hiện tại không có học sinh nào ở trạng thái chờ (Tất cả học sinh đều đã làm đủ tuần hoặc chưa đăng ký).
        </div>
      `;
    } else {
      pendingContainer.innerHTML = pendingUsers.map(user => {
        const isSelf = currentUser && user.username.toLowerCase() === currentUser.username.toLowerCase();
        const initial = (user.fullName || "H").trim().charAt(0).toUpperCase();

        const weekBadgesHtml = unlockedWeeks.map(w => {
          const score = user.weekScores[w.id];
          if (score !== null && score !== undefined) {
            return `<span class="week-score-tag" title="${w.name}: ${w.title}">${w.name}: ${score}đ</span>`;
          }
          return `<span class="week-score-tag uncompleted" title="${w.name}: Chưa thi">${w.name}: --</span>`;
        }).join("");

        return `
          <div class="ranking-row-item ${isSelf ? 'is-current-user' : ''}" ${isSelf ? 'style="cursor: pointer;" onclick="closeRankingModal(); openProfileModal();" title="Nhấn để xem chi tiết Hồ Sơ Cá Nhân & Thành Tích"' : ''}>
            <div class="ranking-row-left">
              <div class="rank-number-box">⏳</div>
              <div class="rank-avatar-small" style="background: #94a3b8;">${initial}</div>
              <div class="rank-user-info">
                <div class="rank-name-line">
                  <strong>${escapeHtml(user.fullName)}</strong>
                  ${isSelf ? '<span class="tag-you">BẠN</span>' : ''}
                </div>
                <div class="rank-class-text">${escapeHtml(user.className)}</div>
                <div class="rank-weeks-badges">${weekBadgesHtml}</div>
              </div>
            </div>
            <div class="ranking-row-right">
              <span class="pending-badge">Chờ (${user.completedWeeksCount}/${totalUnlocked} tuần)</span>
              <div class="avg-score-text" style="margin-top: 4px;">Hiện có: ${user.totalScore} đ</div>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

/**
 * Mở Modal Bảng Xếp Hạng & Bảng Thành Tích
 */
function openRankingModal(isAutoAfterLogin = false) {
  const modal = document.getElementById("ranking-modal");
  if (!modal) return;

  renderRankingModal();
  modal.style.display = "flex";

  // Mặc định: nếu chưa có ai hoàn thành đủ số tuần thì tự động mở tab 'pending' để xem danh sách thi đua
  const btnRanked = document.getElementById("filter-btn-ranked");
  const btnPending = document.getElementById("filter-btn-pending");
  const listRanked = document.getElementById("ranking-list-ranked");
  const listPending = document.getElementById("ranking-list-pending");

  if (btnRanked && btnPending && listRanked && listPending) {
    const { rankedUsers, pendingUsers } = calculateLeaderboardData();
    const shouldDefaultToPending = rankedUsers.length === 0 && pendingUsers.some(u => u.completedWeeksCount > 0);

    if (shouldDefaultToPending) {
      btnPending.classList.add("active");
      btnRanked.classList.remove("active");
      listPending.style.display = "flex";
      listRanked.style.display = "none";
    } else {
      btnRanked.classList.add("active");
      btnPending.classList.remove("active");
      listRanked.style.display = "flex";
      listPending.style.display = "none";
    }
  }

  // Đảm bảo nút đồng bộ chỉ hiện cho tài khoản Quản Trị Viên
  updateSyncButtonsVisibility();
}

/**
 * Đóng Modal Bảng Xếp Hạng
 */
function closeRankingModal() {
  const modal = document.getElementById("ranking-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

/**
 * Khởi tạo tính năng Bảng Xếp Hạng & Thiết lập các sự kiện tương tác
 */
function initRankingFeature() {
  // 1. Tự động dọn dẹp các tài khoản mẫu cũ nếu chưa có
  seedMockTestUsersIfEmpty();

  // 2. Render widget Top 5 ngoài trang chủ
  renderHomeRankingWidget();

  // 3. Cập nhật quyền hiển thị nút Đồng bộ Sheet (Chỉ Admin)
  updateSyncButtonsVisibility();

  // 3. Thiết lập nút đóng modal
  const btnClose = document.getElementById("btn-close-ranking-modal");
  const backdrop = document.getElementById("ranking-modal-backdrop");
  const btnDismiss = document.getElementById("btn-ranking-dismiss");

  if (btnClose) btnClose.addEventListener("click", closeRankingModal);
  if (backdrop) backdrop.addEventListener("click", closeRankingModal);
  if (btnDismiss) btnDismiss.addEventListener("click", closeRankingModal);

  // 4. Thiết lập nút mở modal từ widget trang chủ
  const btnHomeOpen = document.getElementById("btn-home-open-ranking");
  if (btnHomeOpen) {
    btnHomeOpen.addEventListener("click", () => openRankingModal());
  }

  // 5. Thiết lập nút "Vào Làm Bài Thi Ngay" trong modal
  const btnGoQuiz = document.getElementById("btn-ranking-go-quiz");
  if (btnGoQuiz) {
    btnGoQuiz.addEventListener("click", () => {
      closeRankingModal();
      switchToQuizTab();
      const startCard = document.querySelector(".card");
      if (startCard) {
        startCard.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  // 6. Chuyển đổi tab: Xếp Hạng Chính Thức vs Danh Sách Chờ (Pending)
  const filterBtnRanked = document.getElementById("filter-btn-ranked");
  const filterBtnPending = document.getElementById("filter-btn-pending");
  const listRanked = document.getElementById("ranking-list-ranked");
  const listPending = document.getElementById("ranking-list-pending");

  if (filterBtnRanked && filterBtnPending && listRanked && listPending) {
    filterBtnRanked.addEventListener("click", () => {
      filterBtnRanked.classList.add("active");
      filterBtnPending.classList.remove("active");
      listRanked.style.display = "flex";
      listPending.style.display = "none";
    });

    filterBtnPending.addEventListener("click", () => {
      filterBtnPending.classList.add("active");
      filterBtnRanked.classList.remove("active");
      listPending.style.display = "flex";
      listRanked.style.display = "none";
    });
  }

  // 7. Thiết lập các nút Đồng bộ Google Sheet trực tiếp
  const btnHomeSync = document.getElementById("btn-home-sync-sheet");
  const btnModalSync = document.getElementById("btn-sync-ranking-sheet");

  if (btnHomeSync) {
    btnHomeSync.addEventListener("click", () => syncLeaderboardFromGoogleSheet(true));
  }
  if (btnModalSync) {
    btnModalSync.addEventListener("click", () => syncLeaderboardFromGoogleSheet(true));
  }

  // 8. Tự động kiểm tra và đồng bộ ngầm khi mở ứng dụng
  setTimeout(() => {
    syncLeaderboardFromGoogleSheet(false);
  }, 1200);

  // 9. Tự động hiển thị Modal Bảng Vinh Danh & Xếp Hạng khi vừa truy cập hoặc reset/tải lại trang (F5)
  setTimeout(() => {
    const quizScreen = document.getElementById("quiz-screen");
    const isCurrentlyTesting = quizScreen && quizScreen.classList.contains("active");
    if (!isCurrentlyTesting) {
      openRankingModal();
    }
  }, 450);
}

/**
 * Đồng bộ toàn bộ dữ liệu kết quả thi từ Google Sheet về hệ thống Local
 */
async function syncLeaderboardFromGoogleSheet(notifyUser = false) {
  if (!CONFIG.GOOGLE_APPS_SCRIPT_URL || !CONFIG.GOOGLE_APPS_SCRIPT_URL.startsWith("http")) return;

  const isAdmin = AuthState.currentUser && (
    AuthState.currentUser.role === "admin" ||
    AuthState.currentUser.username === ((CONFIG.ADMIN && CONFIG.ADMIN.username) || "rappergaming")
  );

  // Nếu người dùng thường bấm nút đồng bộ (notifyUser = true mà không phải admin) -> Chặn lại
  if (notifyUser && !isAdmin) {
    await showAppAlert({
      title: "GIỚI HẠN QUYỀN TRUY CẬP",
      message: "Chỉ tài khoản <strong>Quản Trị Viên</strong> mới có quyền kích hoạt tính năng Đồng bộ điểm số từ Google Sheet!",
      type: "warning"
    });
    return;
  }

  const btnSyncHome = document.getElementById("btn-home-sync-sheet");
  const btnSyncModal = document.getElementById("btn-sync-ranking-sheet");

  const setSyncing = (isSyncing) => {
    [btnSyncHome, btnSyncModal].forEach(btn => {
      if (btn) {
        btn.disabled = isSyncing;
        btn.style.opacity = isSyncing ? "0.65" : "1";
        const span = btn.querySelector("span");
        if (span) span.textContent = isSyncing ? "Đang đồng bộ..." : (btn.id === "btn-home-sync-sheet" ? "Đồng Bộ Sheet" : "Đồng Bộ Google Sheet");
      }
    });
  };

  try {
    setSyncing(true);
    const res = await fetch(`${CONFIG.GOOGLE_APPS_SCRIPT_URL}?action=get_leaderboard`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (parseErr) {
      console.log("[Google Sheet Sync] Webhook đang ở phiên bản ghi nhận (chưa cập nhật doGet get_leaderboard):", text.slice(0, 60));
      return;
    }

    if (json && json.status === "success" && Array.isArray(json.results)) {
      // 1. Dọn dẹp sạch sẽ toàn bộ điểm số và lịch sử của các tài khoản mẫu cũ khỏi LocalStorage
      OBSOLETE_MOCK_USERNAMES.forEach(oldUname => {
        localStorage.removeItem(getUserHistoryKey(oldUname));
      });

      // Dọn dẹp sạch lịch sử của Admin để không dính vào xếp hạng
      const adminUname = ((CONFIG.ADMIN && CONFIG.ADMIN.username) || "rappergaming").toLowerCase().trim();
      localStorage.removeItem(getUserHistoryKey(adminUname));
      localStorage.removeItem(getUserHistoryKey("rappergaming"));

      let existingAccounts = getLocalAccounts().filter(a => !OBSOLETE_MOCK_USERNAMES.includes(a.username.toLowerCase()));
      const accountMap = new Map();
      existingAccounts.forEach(a => accountMap.set(a.username.toLowerCase(), a));
      let hasChanges = true;

      // Tập hợp danh sách các lần thi ĐẦU TIÊN duy nhất từ Google Sheet (Bỏ qua các lần thi lại/nộp đè)
      const sheetFirstAttemptsByUser = new Map(); // username -> Map(weekId -> attemptData)

      json.results.forEach(r => {
        let uname = (r.username || "").toLowerCase().trim();
        if (!uname || uname.includes("khách")) return;

        // TUYỆT ĐỐI BỎ QUA QUẢN TRỊ VIÊN: Không đưa vào danh sách xếp hạng học sinh
        if (
          uname === adminUname ||
          uname === "admin" ||
          uname === "admin_root" ||
          r.studentName === "Quản Trị Viên" ||
          (r.studentClass || "").includes("Quản Trị Hệ Thống")
        ) {
          return;
        }

        // Thêm tài khoản nếu chưa có trong LocalStorage hoặc cập nhật họ tên mới nhất
        if (!accountMap.has(uname)) {
          const newAcc = {
            username: uname,
            fullName: r.studentName || uname,
            className: (r.studentClass || "").split("[")[0].trim() || "Chưa phân lớp",
            createdAt: r.timestamp || new Date().toISOString()
          };
          existingAccounts.push(newAcc);
          accountMap.set(uname, newAcc);
          hasChanges = true;
        } else {
          const curAcc = accountMap.get(uname);
          if (r.studentName && curAcc.fullName !== r.studentName) {
            curAcc.fullName = r.studentName;
            hasChanges = true;
          }
        }

        // Xác định ID tuần từ thông tin lớp (VD: "CNTT-K18A [Tuần 1]")
        let weekId = 1;
        const match = (r.studentClass || "").match(/Tuần\s*(\d+)/i);
        if (match && match[1]) {
          weekId = parseInt(match[1], 10);
        }

        if (!sheetFirstAttemptsByUser.has(uname)) {
          sheetFirstAttemptsByUser.set(uname, new Map());
        }
        const userWeekMap = sheetFirstAttemptsByUser.get(uname);

        // QUY TẮC BẤT DI BẤT DỊCH: CHỈ LẤY LẦN THI ĐẦU TIÊN (Hàng đầu tiên xuất hiện trên Sheet)
        // Các lần thi sau (thi lại / nộp lại) tuyệt đối không được ghi đè
        if (!userWeekMap.has(weekId)) {
          let durationFormatted = r.timeSpent || "15:00";
          if (typeof durationFormatted === "string" && durationFormatted.includes("T") && durationFormatted.includes("Z")) {
            try {
              const d = new Date(durationFormatted);
              if (!isNaN(d.getTime())) {
                const m = String(d.getUTCMinutes()).padStart(2, "0");
                const s = String(d.getUTCSeconds()).padStart(2, "0");
                durationFormatted = `${m}:${s}`;
              }
            } catch (_) {}
          }

          let percentFormatted = r.accuracy;
          if (typeof percentFormatted === "number") {
            percentFormatted = `${Math.round(percentFormatted * 100)}%`;
          }

          userWeekMap.set(weekId, {
            score: r.scaledScore,
            correct: r.correctCount,
            total: r.totalQuestions,
            percent: percentFormatted,
            durationText: durationFormatted,
            firstRecordedAt: r.timestamp
          });
        }
      });

      // 3. DỌN DẸP HỌC SINH ĐÃ BỊ XÓA KHỎI GOOGLE SHEET:
      // Nếu một tài khoản học sinh không còn bất kỳ bài thi nào trên Google Sheet,
      // tự động xóa hoàn toàn tài khoản và lịch sử điểm của họ khỏi LocalStorage để Bảng Xếp Hạng cập nhật chính xác!
      const activeSheetUsers = new Set(sheetFirstAttemptsByUser.keys());

      for (let i = existingAccounts.length - 1; i >= 0; i--) {
        const acc = existingAccounts[i];
        const u = acc.username.toLowerCase();
        // Bỏ qua tài khoản Quản Trị Viên (Admin)
        if (acc.role === "admin" || u === adminUname || u === "rappergaming") continue;

        // Nếu học sinh này không còn bài thi nào trên Google Sheet
        if (!activeSheetUsers.has(u)) {
          console.log(`[Google Sheet Sync] Đã xóa tài khoản '${acc.fullName}' (@${u}) khỏi hệ thống vì đã bị xóa trên Google Sheet.`);
          localStorage.removeItem(getUserHistoryKey(u));
          existingAccounts.splice(i, 1);
          hasChanges = true;
        }
      }

      // 4. Lưu hoặc cập nhật lần thi đầu tiên vào lịch sử thi chính thức
      sheetFirstAttemptsByUser.forEach((weekMap, uname) => {
        const historyKey = getUserHistoryKey(uname);
        const history = getUserOfficialAttempts(uname);
        let userHistoryChanged = false;

        // Xóa những tuần mà trên Google Sheet đã bị xóa bỏ
        Object.keys(history).forEach(wId => {
          if (!weekMap.has(Number(wId))) {
            delete history[wId];
            userHistoryChanged = true;
            hasChanges = true;
          }
        });

        weekMap.forEach((attemptData, weekId) => {
          // Lưu hoặc cập nhật điểm theo Google Sheet nếu có thay đổi
          if (!history[weekId] || history[weekId].score !== attemptData.score) {
            history[weekId] = attemptData;
            userHistoryChanged = true;
            hasChanges = true;
          }
        });

        if (userHistoryChanged) {
          localStorage.setItem(historyKey, JSON.stringify(history));
        }
      });

      if (hasChanges) {
        saveLocalAccounts(existingAccounts);
      }

      renderHomeRankingWidget();
      renderRankingModal();

      if (notifyUser) {
        if (typeof showAdminToast === "function") {
          showAdminToast(`✓ Đã đồng bộ thành công ${json.results.length} bài thi từ Google Sheet!`, "success");
        }
        await showAppAlert({
          title: "ĐỒNG BỘ THÀNH CÔNG",
          message: `Hệ thống đã đồng bộ thành công <strong>${json.results.length} bài thi</strong> từ Google Sheet!<br>Dữ liệu bảng xếp hạng và học sinh đã được làm mới tức thì.`,
          type: "success"
        });
      }
    }
  } catch (err) {
    console.warn("Lỗi đồng bộ từ Google Sheet:", err);
    if (notifyUser) {
      await showAppAlert({
        title: "LỖI KẾT NỐI GOOGLE SHEET",
        message: "Không thể kết nối với Google Sheet lúc này.<br>Vui lòng kiểm tra lại kết nối mạng hoặc đường truyền Apps Script!",
        type: "danger"
      });
    }
  } finally {
    setSyncing(false);
  }
}

// ==============================================================================
// PHÂN HỆ HỒ SƠ CÁ NHÂN & TIẾN ĐỘ HỌC TẬP TỪ LÚC ĐĂNG KÝ (PERSONAL PROFILE SUBSYSTEM)
// ==============================================================================

/**
 * Mở Modal Hồ Sơ Cá Nhân & Toàn Bộ Thành Tích
 */
async function openProfileModal() {
  if (!AuthState.currentUser) {
    const wantAuth = await showAppConfirm({
      title: "YÊU CẦU ĐĂNG NHẬP",
      message: "Bạn cần đăng nhập để xem thông tin tài khoản và toàn bộ thành tích học tập từ lúc đăng ký.<br>Bạn có muốn đăng nhập ngay không?",
      confirmText: "Đăng Nhập Ngay",
      cancelText: "Để Sau",
      type: "info"
    });
    if (wantAuth) {
      showScreen("auth-screen");
    }
    return;
  }

  const modal = document.getElementById("profile-modal");
  if (!modal) return;

  renderProfileModal();
  modal.style.display = "flex";

  // Mặc định chọn tab lịch sử 15 tuần thi
  switchProfileTab("history");
}

/**
 * Đóng Modal Hồ Sơ Cá Nhân
 */
function closeProfileModal() {
  const modal = document.getElementById("profile-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

/**
 * Chuyển đổi tab bên trong Modal Hồ Sơ Cá Nhân (history, badges, settings)
 */
function switchProfileTab(tabName) {
  const tabHistory = document.getElementById("tab-profile-history");
  const tabBadges = document.getElementById("tab-profile-badges");
  const tabSettings = document.getElementById("tab-profile-settings");

  const panelHistory = document.getElementById("panel-profile-history");
  const panelBadges = document.getElementById("panel-profile-badges");
  const panelSettings = document.getElementById("panel-profile-settings");

  if (!panelHistory || !panelBadges || !panelSettings) return;

  [tabHistory, tabBadges, tabSettings].forEach(t => t && t.classList.remove("active"));
  panelHistory.style.display = "none";
  panelBadges.style.display = "none";
  panelSettings.style.display = "none";

  if (tabName === "history") {
    if (tabHistory) tabHistory.classList.add("active");
    panelHistory.style.display = "block";
  } else if (tabName === "badges") {
    if (tabBadges) tabBadges.classList.add("active");
    panelBadges.style.display = "block";
  } else if (tabName === "settings") {
    if (tabSettings) tabSettings.classList.add("active");
    panelSettings.style.display = "block";
  }
}

/**
 * Render toàn bộ dữ liệu giao diện Modal Hồ Sơ Cá Nhân
 */
function renderProfileModal() {
  const currentUser = AuthState.currentUser;
  if (!currentUser) return;

  const accounts = getLocalAccounts();
  const account = accounts.find(a => a.username.toLowerCase() === (currentUser.username || "").toLowerCase()) || currentUser;
  const adminUname = ((CONFIG.ADMIN && CONFIG.ADMIN.username) || "rappergaming").toLowerCase().trim();
  const isAdmin = account.role === "admin" || (account.username && account.username.toLowerCase() === adminUname) || account.fullName === "Quản Trị Viên";

  const attempts = getUserOfficialAttempts(account.username);

  // 1. Xác định & Định dạng Thời gian đăng ký (createdAt)
  let createdAt = account.createdAt;
  if (!createdAt) {
    const dates = Object.values(attempts)
      .map(att => att.firstRecordedAt ? new Date(att.firstRecordedAt) : null)
      .filter(d => d && !isNaN(d.getTime()));
    if (dates.length > 0) {
      dates.sort((a, b) => a.getTime() - b.getTime());
      createdAt = dates[0].toISOString();
    } else if (account.loggedAt) {
      createdAt = account.loggedAt;
    } else {
      createdAt = new Date().toISOString();
    }
    account.createdAt = createdAt;
    saveLocalAccounts(accounts);
  }

  const regDateObj = new Date(createdAt);
  const isValidDate = !isNaN(regDateObj.getTime());
  const regDateFormatted = isValidDate 
    ? `${regDateObj.toLocaleDateString("vi-VN")} lúc ${regDateObj.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` 
    : "Từ ngày đầu tham gia";

  const diffMs = isValidDate ? Math.max(0, Date.now() - regDateObj.getTime()) : 0;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  let timeAgoStr = "Vừa mới đăng ký";
  if (diffDays > 0) {
    timeAgoStr = `${diffDays} ngày trước`;
  } else if (diffHours > 0) {
    timeAgoStr = `${diffHours} giờ trước`;
  }

  const lastLoginObj = account.loggedAt ? new Date(account.loggedAt) : new Date();
  const lastLoginFormatted = !isNaN(lastLoginObj.getTime())
    ? `${lastLoginObj.toLocaleDateString("vi-VN")} lúc ${lastLoginObj.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
    : "Đang trực tuyến";

  // 2. Render Hero Card Thông Tin Cá Nhân (#profile-hero-card)
  const heroCard = document.getElementById("profile-hero-card");
  if (heroCard) {
    const initial = (account.fullName || account.username || "U").trim().charAt(0).toUpperCase();
    const avatarContent = isAdmin ? "👑" : initial;

    heroCard.innerHTML = `
      <div class="profile-hero-main">
        <div class="profile-avatar-large ${isAdmin ? 'admin-avatar' : ''}">
          ${avatarContent}
        </div>
        <div class="profile-hero-info">
          <div class="profile-name-row">
            <h3 class="profile-hero-name">${escapeHtml(account.fullName || account.username)}</h3>
            <span class="profile-role-badge ${isAdmin ? 'admin' : 'student'}">
              ${isAdmin ? '🛡️ Quản Trị Viên' : '🎓 Học Viên'}
            </span>
          </div>
          <div class="profile-sub-details">
            <span class="profile-username-tag">@${escapeHtml(account.username)}</span>
            <span class="profile-class-tag">${escapeHtml(account.className || 'Chưa phân lớp')}</span>
            <span class="profile-status-online">● Đang hoạt động</span>
          </div>
        </div>
      </div>

      <div class="profile-timeline-box">
        <div class="profile-timeline-item">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span><strong>Ngày đăng ký:</strong> ${regDateFormatted}</span>
        </div>
        <div class="profile-timeline-item">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span><strong>Thời gian tham gia:</strong> ${timeAgoStr}</span>
        </div>
        <div class="profile-timeline-item">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>
          </svg>
          <span><strong>Đăng nhập gần nhất:</strong> ${lastLoginFormatted}</span>
        </div>
      </div>
    `;
  }

  // 3. Tính toán các chỉ số thống kê tổng quan (Overview 4-Grid)
  const weeks = CONFIG.WEEKS || [];
  const totalConfiguredWeeks = weeks.length;
  const unlockedWeeks = weeks.filter(w => isWeekUnlocked(w));
  const totalUnlocked = unlockedWeeks.length;

  let completedWeeksCount = 0;
  let totalScore = 0;
  let totalCorrectQ = 0;
  let totalAllQ = 0;

  weeks.forEach(w => {
    const att = attempts[w.id];
    if (att && typeof att.score === "number") {
      completedWeeksCount++;
      totalScore += att.score;
      if (att.correct !== undefined && att.total !== undefined) {
        totalCorrectQ += Number(att.correct) || 0;
        totalAllQ += Number(att.total) || 0;
      }
    }
  });

  const avgScore = completedWeeksCount > 0 ? (totalScore / completedWeeksCount).toFixed(1) : "0.0";
  const accuracyPercent = totalAllQ > 0 ? Math.round((totalCorrectQ / totalAllQ) * 100) + "%" : "0%";
  const completionRate = totalConfiguredWeeks > 0 ? Math.round((completedWeeksCount / totalConfiguredWeeks) * 100) : 0;

  // Lấy thứ hạng hệ thống từ Leaderboard
  const { rankedUsers, pendingUsers } = calculateLeaderboardData();
  let rankDisplay = "--";
  let rankSub = "Chưa tham gia thi";
  let userRankNum = -1;

  if (isAdmin) {
    rankDisplay = "Quản Trị";
    rankSub = "Hệ thống quản trị";
  } else {
    const rankedIdx = rankedUsers.findIndex(u => u.username.toLowerCase() === account.username.toLowerCase());
    if (rankedIdx !== -1) {
      userRankNum = rankedIdx + 1;
      rankDisplay = `#${userRankNum} / ${rankedUsers.length}`;
      rankSub = rankedIdx < 3 ? "🏆 Thuộc Top 3 vinh danh" : "Đã làm đủ tuần thi";
    } else {
      const pendingIdx = pendingUsers.findIndex(u => u.username.toLowerCase() === account.username.toLowerCase());
      if (pendingIdx !== -1 && completedWeeksCount > 0) {
        userRankNum = pendingIdx + 1;
        rankDisplay = `Chờ (#${userRankNum})`;
        rankSub = `Cần hoàn thành ${Math.max(0, totalUnlocked - completedWeeksCount)} tuần`;
      }
    }
  }

  // Render 4-Grid
  const statsGrid = document.getElementById("profile-stats-grid");
  if (statsGrid) {
    statsGrid.innerHTML = `
      <div class="profile-stat-box">
        <div class="profile-stat-top">
          <span class="profile-stat-label">Tiến Độ Tuần Thi</span>
          <div class="profile-stat-icon blue">🎯</div>
        </div>
        <div class="profile-stat-val">${completedWeeksCount} / ${totalConfiguredWeeks}</div>
        <div class="profile-stat-sub">${completionRate}% Lộ trình 15 tuần</div>
      </div>

      <div class="profile-stat-box">
        <div class="profile-stat-top">
          <span class="profile-stat-label">Điểm Trung Bình (GPA)</span>
          <div class="profile-stat-icon emerald">⭐</div>
        </div>
        <div class="profile-stat-val">${avgScore} <small style="font-size:0.9rem;font-weight:600;color:#64748b;">đ</small></div>
        <div class="profile-stat-sub">Tổng tích lũy: ${totalScore} điểm</div>
      </div>

      <div class="profile-stat-box">
        <div class="profile-stat-top">
          <span class="profile-stat-label">Tỷ Lệ Chính Xác</span>
          <div class="profile-stat-icon amber">📊</div>
        </div>
        <div class="profile-stat-val">${accuracyPercent}</div>
        <div class="profile-stat-sub">Đúng ${totalCorrectQ}/${totalAllQ} câu hỏi</div>
      </div>

      <div class="profile-stat-box">
        <div class="profile-stat-top">
          <span class="profile-stat-label">Thứ Hạng Hệ Thống</span>
          <div class="profile-stat-icon purple">🏆</div>
        </div>
        <div class="profile-stat-val">${rankDisplay}</div>
        <div class="profile-stat-sub">${rankSub}</div>
      </div>
    `;
  }

  // 4. Tab 1 Panel: Lịch sử làm bài 15 tuần (#profile-weeks-history-list)
  const historyList = document.getElementById("profile-weeks-history-list");
  if (historyList) {
    historyList.innerHTML = weeks.map(w => {
      const att = attempts[w.id];
      const unlocked = isWeekUnlocked(w);

      if (att && typeof att.score === "number") {
        return `
          <div class="profile-week-row completed">
            <div class="profile-week-left">
              <div class="profile-week-num-badge">✓</div>
              <div>
                <div class="profile-week-title">Tuần ${w.id}: ${escapeHtml(w.title || w.name)}</div>
                <div class="profile-week-desc">
                  Hoàn thành lúc: <strong>${att.firstRecordedAt || 'Đã ghi nhận'}</strong> | 
                  Thời gian: <strong>${att.durationText || '15:00'}</strong> | 
                  Đúng: <strong>${att.correct !== undefined ? `${att.correct}/${att.total || 0} câu (${att.percent || '100%'})` : `${att.score} điểm`}</strong>
                </div>
              </div>
            </div>
            <div class="profile-week-right">
              <div class="profile-week-score-box">
                <div class="profile-week-score-number">${att.score} đ</div>
                <div class="profile-week-score-meta">Điểm chính thức</div>
              </div>
              <span class="profile-week-status-pill pass">Đã hoàn thành</span>
            </div>
          </div>
        `;
      } else if (unlocked) {
        return `
          <div class="profile-week-row pending-week">
            <div class="profile-week-left">
              <div class="profile-week-num-badge">${w.id}</div>
              <div>
                <div class="profile-week-title">Tuần ${w.id}: ${escapeHtml(w.title || w.name)}</div>
                <div class="profile-week-desc">Tuần học đã mở | Bạn chưa làm bài kiểm tra chính thức</div>
              </div>
            </div>
            <div class="profile-week-right">
              <div class="profile-week-score-box">
                <div class="profile-week-score-number" style="color: #94a3b8;">--</div>
                <div class="profile-week-score-meta">Chưa có điểm</div>
              </div>
              <span class="profile-week-status-pill ready">Sẵn sàng thi</span>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="profile-week-row locked-week">
            <div class="profile-week-left">
              <div class="profile-week-num-badge">🔒</div>
              <div>
                <div class="profile-week-title">Tuần ${w.id}: ${escapeHtml(w.title || w.name)}</div>
                <div class="profile-week-desc">Chưa mở khoá theo lộ trình đào tạo</div>
              </div>
            </div>
            <div class="profile-week-right">
              <div class="profile-week-score-box">
                <div class="profile-week-score-number" style="color: #cbd5e1;">--</div>
                <div class="profile-week-score-meta">Chưa mở</div>
              </div>
              <span class="profile-week-status-pill lock">Đang khóa</span>
            </div>
          </div>
        `;
      }
    }).join("");
  }

  // 5. Tab 2 Panel: Huy Hiệu & Danh Hiệu Thành Tích (#profile-badges-grid)
  const badgesGrid = document.getElementById("profile-badges-grid");
  if (badgesGrid) {
    const hasPerfectScore = Object.values(attempts).some(a => a && a.score === 100);
    const isTop3 = !isAdmin && userRankNum > 0 && userRankNum <= 3 && rankedUsers.some(u => u.username.toLowerCase() === account.username.toLowerCase());
    const isAllUnlockedDone = totalUnlocked > 0 && completedWeeksCount === totalUnlocked;

    const badges = [
      {
        icon: "🎖️",
        name: "Tân Binh Gia Nhập",
        desc: "Đăng ký tài khoản thành công và tham gia vào hệ thống đào tạo.",
        unlocked: true
      },
      {
        icon: "🚀",
        name: "Khởi Động Xuất Sắc",
        desc: "Hoàn thành bài kiểm tra chính thức Tuần 1 đầu tiên.",
        unlocked: Boolean(attempts[1] && typeof attempts[1].score === "number")
      },
      {
        icon: "📚",
        name: "Kiên Trì Học Tập",
        desc: "Hoàn thành bài kiểm tra chính thức từ 3 tuần thi trở lên.",
        unlocked: completedWeeksCount >= 3
      },
      {
        icon: "🎯",
        name: "Bách Phát Bách Trúng",
        desc: "Đạt điểm số tuyệt đối (100 điểm) ở một tuần thi bất kỳ.",
        unlocked: hasPerfectScore
      },
      {
        icon: "🏅",
        name: "Cao Thủ Top 3",
        desc: "Xuất sắc nằm trong Top 3 học viên dẫn đầu Bảng Vinh Danh.",
        unlocked: isTop3
      },
      {
        icon: "👑",
        name: "Chiến Binh Toàn Năng",
        desc: "Hoàn thành toàn bộ tất cả các tuần thi đã được mở khóa.",
        unlocked: isAllUnlockedDone
      }
    ];

    badgesGrid.innerHTML = badges.map(b => `
      <div class="profile-badge-card ${b.unlocked ? 'unlocked' : 'locked'}">
        <div class="profile-badge-icon">${b.icon}</div>
        <div>
          <div class="profile-badge-name">${b.name}</div>
          <div class="profile-badge-desc">${b.desc}</div>
          <div style="margin-top: 6px; font-size: 0.76rem; font-weight: 700; color: ${b.unlocked ? '#059669' : '#94a3b8'};">
            ${b.unlocked ? '✓ ĐÃ ĐẠT ĐƯỢC' : '🔒 CHƯA MỞ KHÓA'}
          </div>
        </div>
      </div>
    `).join("");
  }

  // 6. Tab 3 Panel: Form Cài Đặt Hồ Sơ
  const inputFullName = document.getElementById("profile-input-fullname");
  const inputClass = document.getElementById("profile-input-class");
  const inputOldPass = document.getElementById("profile-input-oldpass");
  const inputNewPass = document.getElementById("profile-input-newpass");

  if (inputFullName) inputFullName.value = account.fullName || "";
  if (inputClass) inputClass.value = account.className || "";
  if (inputOldPass) inputOldPass.value = "";
  if (inputNewPass) inputNewPass.value = "";
}

/**
 * Xử lý cập nhật thông tin cá nhân & đổi mật khẩu
 */
async function handleProfileSave() {
  const currentUser = AuthState.currentUser;
  if (!currentUser) return;

  const inputFullName = document.getElementById("profile-input-fullname");
  const inputClass = document.getElementById("profile-input-class");
  const inputOldPass = document.getElementById("profile-input-oldpass");
  const inputNewPass = document.getElementById("profile-input-newpass");

  const newFullName = inputFullName ? inputFullName.value.trim() : "";
  const newClassName = inputClass ? inputClass.value.trim() : "";
  const oldPass = inputOldPass ? inputOldPass.value : "";
  const newPass = inputNewPass ? inputNewPass.value : "";

  if (!newFullName || newFullName.length < 2) {
    await showAppAlert({
      title: "LỖI NHẬP LIỆU",
      message: "Họ và tên phải có tối thiểu 2 ký tự!",
      type: "warning"
    });
    return;
  }

  if (!newClassName) {
    await showAppAlert({
      title: "LỖI NHẬP LIỆU",
      message: "Vui lòng nhập thông tin Lớp hoặc Mã sinh viên!",
      type: "warning"
    });
    return;
  }

  const accounts = getLocalAccounts();
  const account = accounts.find(a => a.username.toLowerCase() === currentUser.username.toLowerCase());
  if (!account) return;

  let passwordChanged = false;
  if (oldPass || newPass) {
    if (account.password && account.password !== oldPass) {
      await showAppAlert({
        title: "SAI MẬT KHẨU",
        message: "Mật khẩu hiện tại không chính xác! Vui lòng kiểm tra lại.",
        type: "danger"
      });
      return;
    }
    if (!newPass || newPass.length < 4) {
      await showAppAlert({
        title: "MẬT KHẨU KHÔNG HỢP LỆ",
        message: "Mật khẩu mới phải có tối thiểu 4 ký tự!",
        type: "warning"
      });
      return;
    }
    passwordChanged = true;
  }

  const confirmed = await showAppConfirm({
    title: "XÁC NHẬN CẬP NHẬT",
    message: `Bạn có chắc chắn muốn lưu thông tin mới cho tài khoản <strong>@${account.username}</strong> không?`,
    confirmText: "Lưu Cập Nhật",
    cancelText: "Hủy Bỏ",
    type: "info"
  });

  if (!confirmed) return;

  // Cập nhật thông tin tài khoản
  account.fullName = newFullName;
  account.className = newClassName;
  if (passwordChanged) {
    account.password = newPass;
  }
  saveLocalAccounts(accounts);

  // Cập nhật AuthState.currentUser
  currentUser.fullName = newFullName;
  currentUser.className = newClassName;
  localStorage.setItem(AuthState.storageKeyUser, JSON.stringify(currentUser));

  // Cập nhật giao diện toàn diện
  updateAuthUI();
  renderHomeRankingWidget();
  renderRankingModal();
  renderProfileModal();

  await showAppAlert({
    title: "CẬP NHẬT THÀNH CÔNG",
    message: `Thông tin cá nhân của bạn đã được cập nhật thành công!${passwordChanged ? '<br>Mật khẩu mới đã được lưu an toàn.' : ''}`,
    type: "success"
  });
}

/**
 * Khởi tạo toàn bộ sự kiện cho Phân Hệ Hồ Sơ Cá Nhân
 */
function initProfileFeature() {
  // 1. Mở từ Sidebar
  const tabProfile = document.getElementById("sidebar-tab-profile");
  if (tabProfile) {
    tabProfile.addEventListener("click", () => {
      openProfileModal();
      const sidebar = document.getElementById("app-sidebar");
      const backdrop = document.getElementById("sidebar-backdrop");
      if (sidebar) sidebar.classList.remove("is-hovered");
      if (backdrop) {
        backdrop.classList.remove("active");
        setTimeout(() => { backdrop.style.display = "none"; }, 200);
      }
    });
  }

  // 2. Mở từ User Profile Chip trên Top Nav (trang trắc nghiệm & lộ trình)
  const userChip = document.getElementById("user-profile-chip");
  if (userChip) {
    userChip.addEventListener("click", (e) => {
      if (e.target.closest(".btn-logout-small")) return; // Bỏ qua nếu nhấn nút đăng xuất nhỏ
      openProfileModal();
    });
  }

  const roadmapUserChip = document.getElementById("roadmap-user-profile-chip");
  if (roadmapUserChip) {
    roadmapUserChip.addEventListener("click", (e) => {
      if (e.target.closest(".btn-logout-small")) return;
      openProfileModal();
    });
  }

  // 3. Đóng Modal
  const btnClose = document.getElementById("btn-close-profile-modal");
  const btnCloseFooter = document.getElementById("btn-profile-close");
  const backdrop = document.getElementById("profile-modal-backdrop");

  if (btnClose) btnClose.addEventListener("click", closeProfileModal);
  if (btnCloseFooter) btnCloseFooter.addEventListener("click", closeProfileModal);
  if (backdrop) backdrop.addEventListener("click", closeProfileModal);

  // 4. Đăng xuất từ Modal Hồ Sơ
  const btnLogout = document.getElementById("btn-profile-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      closeProfileModal();
      if (typeof handleLogout === "function") {
        handleLogout();
      }
    });
  }

  // 5. Chuyển đổi Tab trong Profile
  const tabHistory = document.getElementById("tab-profile-history");
  const tabBadges = document.getElementById("tab-profile-badges");
  const tabSettings = document.getElementById("tab-profile-settings");

  if (tabHistory) tabHistory.addEventListener("click", () => switchProfileTab("history"));
  if (tabBadges) tabBadges.addEventListener("click", () => switchProfileTab("badges"));
  if (tabSettings) tabSettings.addEventListener("click", () => switchProfileTab("settings"));

  // 6. Lưu form chỉnh sửa hồ sơ
  const btnSave = document.getElementById("btn-save-profile");
  if (btnSave) {
    btnSave.addEventListener("click", handleProfileSave);
  }
}



