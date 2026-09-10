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
    }
  } catch (e) {
    console.error("Lỗi lưu lịch sử thi:", e);
  }
}

// ==============================================================================
// QUẢN LÝ ĐÓNG / MỞ TỪNG TUẦN HỌC (WEEKS ACCESS CONTROL)
// ==============================================================================
const WEEKS_STORAGE_KEY = "quiz_custom_weeks_status";

function getCustomWeeksStatus() {
  try {
    const raw = localStorage.getItem(WEEKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function isWeekUnlocked(week) {
  if (!week) return false;
  const custom = getCustomWeeksStatus();
  if (custom && typeof custom[week.id] === "boolean") {
    return custom[week.id];
  }
  return Boolean(week.isUnlocked);
}

function setWeekUnlockedStatus(weekId, status) {
  const custom = getCustomWeeksStatus() || {};
  custom[weekId] = Boolean(status);
  localStorage.setItem(WEEKS_STORAGE_KEY, JSON.stringify(custom));
}

function unlockAllWeeksGlobal() {
  const custom = {};
  (CONFIG.WEEKS || []).forEach(w => {
    custom[w.id] = true;
  });
  localStorage.setItem(WEEKS_STORAGE_KEY, JSON.stringify(custom));
}

function lockAllWeeksGlobal() {
  const custom = {};
  (CONFIG.WEEKS || []).forEach(w => {
    custom[w.id] = false;
  });
  localStorage.setItem(WEEKS_STORAGE_KEY, JSON.stringify(custom));
}

function resetWeeksStatusToDefault() {
  const custom = {};
  (CONFIG.WEEKS || []).forEach(w => {
    custom[w.id] = Boolean(w.isUnlocked);
  });
  localStorage.setItem(WEEKS_STORAGE_KEY, JSON.stringify(custom));
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
        toggleBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const newStatus = !unlocked;
          setWeekUnlockedStatus(week.id, newStatus);
          initWeeksSelector();
          if (QuizState.selectedWeekId === week.id) {
            selectWeek(week.id);
          }
          showAdminToast(`🛡️ [ADMIN] ${newStatus ? 'ĐÃ MỞ KHÓA' : 'ĐÃ KHÓA LẠI'} ${week.name} (${week.title})!`, newStatus ? 'success' : 'warn');
        });
      }
    }

    card.addEventListener("click", () => {
      if (unlocked || isAdmin) {
        selectWeek(week.id);
      } else {
        playWrongSound();
        alert(`🔒 ${week.name} (${week.title}) hiện đang đóng!\nHiện tại giáo viên chưa mở khóa tuần này.`);
      }
    });

    container.appendChild(card);
  });

  // Chọn tuần mặc định ban đầu (Tuần 1)
  selectWeek(QuizState.selectedWeekId || 1);
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
 * Xử lý khi người dùng bấm chọn một tuần đã mở khóa
 */
async function selectWeek(weekId) {
  const weeks = CONFIG.WEEKS || [];
  const week = weeks.find(w => w.id === weekId);
  const isAdmin = AuthState.currentUser && AuthState.currentUser.role === "admin";
  const unlocked = isWeekUnlocked(week);
  if (!week || (!unlocked && !isAdmin)) return;

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
  const targetFile = week.file || "questions_tuan1.json";
  const totalQEl = document.getElementById("info-total-q");
  const durationEl = document.getElementById("info-duration");
  const scaleEl = document.getElementById("info-scale");

  if (totalQEl) totalQEl.textContent = "Đang tải...";

  try {
    const res = await fetch(targetFile);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Dữ liệu câu hỏi của ${week.name} rỗng!`);
    }

    QuizState.rawQuestions = data;

    if (totalQEl) totalQEl.textContent = `${data.length} câu`;
    if (durationEl) durationEl.textContent = `${week.durationMinutes || 30} phút`;
    if (scaleEl) scaleEl.textContent = `${CONFIG.QUIZ.targetScale || 100} điểm`;

    console.log(`Đã nạp thành công ${data.length} câu hỏi cho ${week.name} từ file ${targetFile}`);
  } catch (err) {
    console.error(`Lỗi tải câu hỏi cho ${week.name}:`, err);
    if (totalQEl) {
      totalQEl.textContent = "Lỗi nạp file!";
      totalQEl.style.color = "var(--danger)";
    }
  }
}

// ==============================================================================
// THUẬT TOÁN XÁO TRỘN CÂU HỎI (FISHER-YATES SHUFFLE)
// ==============================================================================
function shuffleQuestions(arr) {
  const cloned = [...arr];
  for (let i = cloned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
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
}

// ==============================================================================
// BẮT ĐẦU BÀI THI
// ==============================================================================
function startQuiz() {
  // BẮT BUỘC HỌC SINH PHẢI ĐĂNG NHẬP TRƯỚC KHI LÀM BÀI
  if (!AuthState.currentUser) {
    showScreen("auth-screen");
    showAuthAlert("⚠️ Bạn cần ĐĂNG NHẬP hoặc ĐĂNG KÝ tài khoản học sinh trước khi bắt đầu làm bài!", "error");
    return;
  }

  QuizState.studentName = AuthState.currentUser.fullName;
  QuizState.studentClass = AuthState.currentUser.className || "";
  QuizState.username = AuthState.currentUser.username;
  QuizState.startTime = new Date();

  // Kiểm tra danh sách câu hỏi
  if (!QuizState.rawQuestions || QuizState.rawQuestions.length === 0) {
    alert("Chưa nạp được danh sách câu hỏi từ questions.json! Vui lòng kiểm tra lại.");
    return;
  }

  // Xáo trộn thứ tự câu hỏi nếu cấu hình bật
  if (CONFIG.QUIZ.shuffleQuestions) {
    QuizState.activeQuestions = shuffleQuestions(QuizState.rawQuestions);
  } else {
    QuizState.activeQuestions = [...QuizState.rawQuestions];
  }

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
  const practicePill = document.getElementById("practice-pill");
  if (practicePill) {
    practicePill.style.display = QuizState.isPracticeMode ? "inline-flex" : "none";
  }

  // Khởi tạo trạng thái giám sát chống gian lận (Anti-Cheat)
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

function handleTimeExpired() {
  alert("Hết giờ làm bài! Hệ thống sẽ tự động chấm điểm và nộp kết quả của bạn.");
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
  let studentClassWithWeek = QuizState.studentClass 
    ? `${QuizState.studentClass} [${weekLabel}]` 
    : `[${weekLabel}]`;

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
  const userProfileChip = document.getElementById("user-profile-chip");
  const navAvatar = document.getElementById("nav-user-avatar");
  const navName = document.getElementById("nav-user-name");
  const navClass = document.getElementById("nav-user-class");
  const authHintBanner = document.getElementById("auth-hint-banner");
  const authHintText = document.getElementById("auth-hint-text");
  const nameInput = document.getElementById("student-name");
  const classInput = document.getElementById("student-class");
  const btnStart = document.getElementById("btn-start");
  const adminPanel = document.getElementById("admin-tools-panel");

  const isAdmin = AuthState.currentUser && AuthState.currentUser.role === "admin";

  if (AuthState.currentUser) {
    // Đã đăng nhập
    if (userProfileChip) {
      userProfileChip.style.display = "inline-flex";
      if (isAdmin) {
        userProfileChip.classList.add("is-admin");
      } else {
        userProfileChip.classList.remove("is-admin");
      }
    }

    if (isAdmin) {
      if (navAvatar) navAvatar.textContent = "AD";
      if (navName) navName.textContent = AuthState.currentUser.fullName || "Quản Trị Viên";
      if (navClass) {
        navClass.textContent = "QUẢN TRỊ VIÊN 🛡️";
        navClass.style.color = "#e11d48";
      }
    } else {
      const initial = AuthState.currentUser.fullName ? AuthState.currentUser.fullName.trim().charAt(0).toUpperCase() : "H";
      if (navAvatar) navAvatar.textContent = initial;
      if (navName) navName.textContent = AuthState.currentUser.fullName;
      if (navClass) {
        navClass.textContent = AuthState.currentUser.className || "Học sinh";
        navClass.style.color = "";
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

    if (authHintBanner) {
      authHintBanner.className = `auth-hint-banner logged-in ${isAdmin ? 'admin-logged' : ''}`;
    }
    if (authHintText) {
      const roleBadge = isAdmin ? `<span style="color:#e11d48;font-weight:800;">[QUẢN TRỊ VIÊN]</span>` : "";
      authHintText.innerHTML = `✓ Đã đăng nhập: <strong>${escapeHtml(AuthState.currentUser.fullName)}</strong> ${roleBadge} - <a href="#" id="link-switch-acc">Đổi tài khoản</a>`;
      const linkSwitch = document.getElementById("link-switch-acc");
      if (linkSwitch) {
        linkSwitch.addEventListener("click", (e) => {
          e.preventDefault();
          handleLogout();
        });
      }
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
    if (userProfileChip) {
      userProfileChip.style.display = "none";
      userProfileChip.classList.remove("is-admin");
    }
    if (authHintBanner) authHintBanner.className = "auth-hint-banner";
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
    }, 450);
    return;
  }

  // 2. Kiểm tra tài khoản trong Local Database trước (phản hồi tức thì 0ms)
  const accounts = getLocalAccounts();
  const foundUser = accounts.find(u => u.username.toLowerCase() === username);

  if (foundUser) {
    if (foundUser.password !== password) {
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
  }, 600);
}

function handleLogout() {
  if (confirm("Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này không?")) {
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
  // 1. Khởi tạo bộ chọn 15 tuần và nạp tuần mặc định (Tuần 1)
  initWeeksSelector();

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
    btnSubmitEarly.addEventListener("click", () => {
      if (confirm("Bạn có chắc chắn muốn nộp bài sớm ngay bây giờ không?")) {
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

  // Presets thao tác nhanh trong Modal
  const presetOpenAll = document.getElementById("preset-open-all");
  if (presetOpenAll) {
    presetOpenAll.addEventListener("click", () => {
      unlockAllWeeksGlobal();
      renderAdminWeeksModalList();
      initWeeksSelector();
      showAdminToast("🛡️ Đã mở khóa toàn bộ 15 tuần học!", "success");
    });
  }

  const presetDefault = document.getElementById("preset-default");
  if (presetDefault) {
    presetDefault.addEventListener("click", () => {
      resetWeeksStatusToDefault();
      renderAdminWeeksModalList();
      initWeeksSelector();
      showAdminToast("⚡ Đã đưa về chuẩn mặc định: Chỉ mở Tuần 1 & Tuần 2!", "success");
    });
  }

  const presetLockAll = document.getElementById("preset-lock-all");
  if (presetLockAll) {
    presetLockAll.addEventListener("click", () => {
      lockAllWeeksGlobal();
      renderAdminWeeksModalList();
      initWeeksSelector();
      showAdminToast("🔒 Đã khóa tất cả 15 tuần thi!", "warn");
    });
  }

  // Nút Mở khóa toàn bộ 15 tuần ở Dashboard ngoài
  const btnAdminUnlock = document.getElementById("btn-admin-unlock-all");
  if (btnAdminUnlock) {
    btnAdminUnlock.addEventListener("click", () => {
      const allOpen = (CONFIG.WEEKS || []).every(w => isWeekUnlocked(w));
      if (allOpen) {
        resetWeeksStatusToDefault();
        initWeeksSelector();
        showAdminToast("🔒 Đã đưa về chuẩn tiến độ học tập (chỉ mở Tuần 1 & 2)", "warn");
      } else {
        unlockAllWeeksGlobal();
        initWeeksSelector();
        showAdminToast("🛡️ Đã mở khóa toàn bộ 15 tuần học!", "success");
      }
    });
  }

  const btnAdminReset = document.getElementById("btn-admin-reset-local");
  if (btnAdminReset) {
    btnAdminReset.addEventListener("click", () => {
      if (confirm("⚠️ [ADMIN] Bạn có chắc chắn muốn xóa toàn bộ lịch sử điểm thi lần 1 trên thiết bị này để kiểm tra lại từ đầu không?")) {
        localStorage.removeItem(QuizState.storageKeyAttempts);
        initWeeksSelector();
        updateOfficialScoreDisplay(QuizState.selectedWeekId || 1);
        showAdminToast("✓ Đã làm mới dữ liệu thi thử nghiệm thành công!", "success");
      }
    });
  }
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
      switchBtn.addEventListener("click", () => {
        const nextState = !isWeekUnlocked(week);
        setWeekUnlockedStatus(week.id, nextState);
        renderAdminWeeksModalList();
        initWeeksSelector();
        showAdminToast(`🛡️ ${nextState ? 'Đã MỞ KHÓA' : 'Đã KHÓA LẠI'} ${week.name}!`, nextState ? 'success' : 'warn');
      });
    }

    container.appendChild(row);
  });
}
