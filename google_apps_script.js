/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT - HỆ THỐNG QUẢN LÝ BÀI THI & TÀI KHOẢN SINH VIÊN TỰ ĐỘNG
 * ==============================================================================
 * HƯỚNG DẪN CÀI ĐẶT / CẬP NHẬT NHANH:
 * 1. Mở trang Google Sheets của bạn.
 * 2. Bấm menu: Tiện ích mở rộng (Extensions) -> Apps Script.
 * 3. Xóa toàn bộ mã cũ trong tệp Code.gs, COPY TOÀN BỘ NỘI DUNG FILE NÀY dán vào.
 * 4. Bấm "Lưu" (Ctrl + S).
 * 5. Bấm nút màu xanh "Triển khai" (Deploy) ở góc trên bên phải -> "Quản lý tùy chọn triển khai" (Manage deployments)
 *    -> Bấm biểu tượng cây bút (Chỉnh sửa / Edit) -> Tại mục "Phiên bản" chọn "Phiên bản mới" (New version) -> Bấm "Triển khai" (Deploy).
 *
 * TÍNH NĂNG TỰ ĐỘNG:
 * - Tab 1: "KetQuaThi" - Tự động ghi kết quả bài thi, câu đúng, điểm số, thời gian và tài khoản sinh viên.
 * - Tab 2: "TaiKhoan" - Tự động ghi danh sách sinh viên đăng ký (Username, Mật khẩu, Họ tên, Lớp).
 *   Giáo viên có thể trực tiếp xem, sửa mật khẩu hoặc xóa sinh viên ngay trên trang tính Google Sheet!
 * ==============================================================================
 */

const SHEET_NAME_RESULTS = "KetQuaThi";
const SHEET_NAME_ACCOUNTS = "TaiKhoan";

// Tiêu đề các cột trong tab KetQuaThi (Chuẩn 10 cột khớp chính xác 100% với Google Sheet của giáo viên)
const HEADERS_RESULTS = [
  "Thời gian nộp",
  "Họ và tên",
  "Lớp / MSSV",
  "Điểm số (Thang 100)",
  "Điểm số thực tế",
  "Số câu đúng",
  "Tổng số câu",
  "Tỷ lệ đúng (%)",
  "Thời gian làm bài",
  "Chi tiết bài làm"
];

// Tiêu đề các cột trong tab TaiKhoan
const HEADERS_ACCOUNTS = [
  "Thời gian đăng ký",
  "Tên đăng nhập (Username)",
  "Mật khẩu",
  "Họ và tên sinh viên",
  "Lớp / MSSV",
  "Lần đăng nhập cuối"
];

/**
 * Xử lý khi nhận dữ liệu POST từ website
 */
function doPost(e) {
  let lock;
  try {
    let data;
    
    // Đọc dữ liệu JSON hoặc PostData
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    } else {
      throw new Error("Không nhận được dữ liệu hợp lệ");
    }

    // 0. BẢO VỆ CHỐNG SPAM & DDOS (RATE LIMITING BẰNG CACHESERVICE)
    const cache = CacheService.getScriptCache();
    const clientKey = "rate_" + (data.username || "guest").toLowerCase().replace(/[^a-z0-9_]/g, "");
    const cachedCount = Number(cache.get(clientKey) || 0);

    if (cachedCount > 20) {
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "rate_limited",
          message: "Bạn đang gửi yêu cầu quá nhanh! Vui lòng chờ 30 giây để hệ thống xử lý an toàn."
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    cache.put(clientKey, String(cachedCount + 1), 30);

    // KHÓA ĐỒNG THỜI (LOCKSERVICE) - Chống nghẽn dữ liệu khi hàng chục sinh viên cùng nộp bài 1 lúc
    lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000); // Chờ tối đa 15 giây để xếp hàng ghi an toàn
    } catch (lockErr) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: "busy", message: "Hệ thống đang ghi dữ liệu bài thi khác, vui lòng thử lại sau 3 giây!" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ==========================================================================
    // 1. XỬ LÝ ĐĂNG KÝ TÀI KHOẢN (action === "register")
    // ==========================================================================
    if (data.action === "register") {
      let accSheet = ss.getSheetByName(SHEET_NAME_ACCOUNTS);
      if (!accSheet) {
        accSheet = ss.insertSheet(SHEET_NAME_ACCOUNTS);
      }

      // Tạo tiêu đề đẹp mắt nếu sheet mới tạo
      if (accSheet.getLastRow() === 0) {
        accSheet.appendRow(HEADERS_ACCOUNTS);
        const headerRange = accSheet.getRange(1, 1, 1, HEADERS_ACCOUNTS.length);
        headerRange.setFontWeight("bold");
        headerRange.setBackground("#059669"); // Xanh lá sang trọng
        headerRange.setFontColor("#ffffff");
        headerRange.setHorizontalAlignment("center");
        headerRange.setVerticalAlignment("middle");
        accSheet.setRowHeight(1, 35);
        accSheet.setFrozenRows(1);
      }

      const timestamp = data.timestamp || Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      const username = (data.username || "").toString().trim().toLowerCase();
      const password = (data.password || "").toString();
      const fullName = (data.fullName || "").toString().trim();
      const className = (data.className || "").toString().trim();

      // Kiểm tra xem tên đăng nhập đã tồn tại trong Sheet chưa
      const lastRow = accSheet.getLastRow();
      if (lastRow > 1) {
        const existingUsers = accSheet.getRange(2, 2, lastRow - 1, 1).getValues();
        for (let i = 0; i < existingUsers.length; i++) {
          if (existingUsers[i][0].toString().trim().toLowerCase() === username) {
            return ContentService.createTextOutput(
              JSON.stringify({ status: "error", message: "Tên đăng nhập này đã được sử dụng! Vui lòng chọn tên khác." })
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }

      // Thêm dòng tài khoản mới
      accSheet.appendRow([timestamp, username, password, fullName, className, timestamp]);
      accSheet.getRange(accSheet.getLastRow(), 1, 1, HEADERS_ACCOUNTS.length).setVerticalAlignment("middle");

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Đăng ký tài khoản thành công!",
          user: { username: username, fullName: fullName, className: className }
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================================================
    // 2. XỬ LÝ ĐĂNG NHẬP TÀI KHOẢN (action === "login")
    // ==========================================================================
    if (data.action === "login") {
      const accSheet = ss.getSheetByName(SHEET_NAME_ACCOUNTS);
      const username = (data.username || "").toString().trim().toLowerCase();
      const password = (data.password || "").toString();

      if (!accSheet || accSheet.getLastRow() <= 1) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: "error", message: "Chưa có tài khoản nào được tạo trên hệ thống!" })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      const lastRow = accSheet.getLastRow();
      const usersData = accSheet.getRange(2, 1, lastRow - 1, HEADERS_ACCOUNTS.length).getValues();

      for (let i = 0; i < usersData.length; i++) {
        const u = usersData[i][1].toString().trim().toLowerCase();
        const p = usersData[i][2].toString();
        if (u === username && p === password) {
          // Cập nhật lại thời gian lần đăng nhập cuối
          const timeNow = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
          accSheet.getRange(i + 2, 6).setValue(timeNow);

          return ContentService.createTextOutput(
            JSON.stringify({
              status: "success",
              message: "Đăng nhập thành công!",
              user: {
                username: u,
                fullName: usersData[i][3],
                className: usersData[i][4]
              }
            })
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }

      return ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: "Tên đăng nhập hoặc mật khẩu không chính xác!" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================================================
    // 3. XỬ LÝ CẬP NHẬT THÔNG TIN SINH VIÊN (action === "update_profile")
    // ==========================================================================
    if (data.action === "update_profile") {
      const accSheet = ss.getSheetByName(SHEET_NAME_ACCOUNTS);
      const username = (data.username || "").toString().trim().toLowerCase();
      const newFullName = (data.fullName || data.studentName || "").toString().trim();
      const newClassName = (data.className || data.studentClass || "").toString().trim();
      const newPass = data.password ? data.password.toString() : "";

      // A. Cập nhật trong tab TaiKhoan
      if (accSheet) {
        let foundInAcc = false;
        const lastRow = accSheet.getLastRow();
        if (lastRow > 1) {
          const usersData = accSheet.getRange(2, 1, lastRow - 1, HEADERS_ACCOUNTS.length).getValues();

          for (let i = 0; i < usersData.length; i++) {
            const u = usersData[i][1].toString().trim().toLowerCase();
            if (u === username) {
              const rowIndex = i + 2;
              if (newFullName) accSheet.getRange(rowIndex, 4).setValue(newFullName);
              if (newClassName) accSheet.getRange(rowIndex, 5).setValue(newClassName);
              if (newPass) accSheet.getRange(rowIndex, 3).setValue(newPass);
              accSheet.getRange(rowIndex, 6).setValue(Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss"));
              foundInAcc = true;
              break;
            }
          }
        }

        // Nếu tài khoản chưa có trong TaiKhoan, bổ sung luôn
        if (!foundInAcc && username && newFullName) {
          const nowStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
          accSheet.appendRow([nowStr, username, newPass || "123", newFullName, newClassName, nowStr]);
        }
      }

      // B. Cập nhật Họ tên mới trong KetQuaThi và dọn dẹp các dòng rác 'Không tên' 0 điểm
      const resSheet = ss.getSheetByName(SHEET_NAME_RESULTS);
      if (resSheet && resSheet.getLastRow() > 1) {
        const rLast = resSheet.getLastRow();
        const rData = resSheet.getRange(2, 1, rLast - 1, HEADERS_RESULTS.length).getValues();
        for (let j = rData.length - 1; j >= 0; j--) {
          const rowClass = (rData[j][2] || "").toString().toLowerCase();
          const rowName = (rData[j][1] || "").toString().trim();
          const rowScore = Number(rData[j][3]) || 0;
          const rowTotal = Number(rData[j][6]) || 0;

          if (rowClass.includes(`@${username}`) || rowClass.includes(`(${username})`) || rowName.toLowerCase() === username) {
            const actualRow = j + 2;
            // Dòng rác 'Không tên' hoặc 0 câu hỏi -> Xóa triệt để khỏi Sheet
            if ((!rowName || rowName === "Không tên") && rowScore === 0 && rowTotal === 0) {
              resSheet.deleteRow(actualRow);
            } else if (newFullName) {
              resSheet.getRange(actualRow, 2).setValue(newFullName);
              if (newClassName) {
                let currentCls = (rData[j][2] || "").toString();
                let weekSuffix = "";
                const matchWeek = currentCls.match(/\[Tuần\s*\d+\]/i);
                if (matchWeek) weekSuffix = ` ${matchWeek[0]}`;
                resSheet.getRange(actualRow, 3).setValue(`${newClassName} (@${username})${weekSuffix}`);
              }
            }
          }
        }
      }

      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", message: "Cập nhật thông tin sinh viên thành công!" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================================================
    // 4. XỬ LÝ LẤY BẢNG XẾP HẠNG (action === "get_leaderboard" hoặc "get_results")
    // ==========================================================================
    if (data.action === "get_leaderboard" || data.action === "get_results") {
      const resultSheet = ss.getSheetByName(SHEET_NAME_RESULTS);
      if (!resultSheet || resultSheet.getLastRow() <= 1) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: "success", count: 0, results: [] })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      const rows = resultSheet.getDataRange().getValues();
      const headerRow = rows.length > 0 ? rows[0] : [];
      const dataRows = rows.slice(1);
      const results = extractFirstAttemptsFromRows(dataRows, headerRow);

      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", count: results.length, results: results })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================================================
    // 5. XỬ LÝ NỘP KẾT QUẢ BÀI THI (action === "submit_quiz" hoặc có mảng data.details)
    // ==========================================================================
    if (data.action === "submit_quiz" || (!data.action && data.details && Array.isArray(data.details))) {
      let resultSheet = ss.getSheetByName(SHEET_NAME_RESULTS);
      if (!resultSheet) {
        resultSheet = ss.getActiveSheet();
        if (resultSheet.getName() === SHEET_NAME_ACCOUNTS) {
          resultSheet = ss.insertSheet(SHEET_NAME_RESULTS);
        } else {
          resultSheet.setName(SHEET_NAME_RESULTS);
        }
      }

      // Tạo tiêu đề bài thi nếu chưa có
      if (resultSheet.getLastRow() === 0) {
        resultSheet.appendRow(HEADERS_RESULTS);
        const headerRange = resultSheet.getRange(1, 1, 1, HEADERS_RESULTS.length);
        headerRange.setFontWeight("bold");
        headerRange.setBackground("#4f46e5"); // Màu chàm
        headerRange.setFontColor("#ffffff");
        headerRange.setHorizontalAlignment("center");
        headerRange.setVerticalAlignment("middle");
        resultSheet.setRowHeight(1, 35);
        resultSheet.setFrozenRows(1);
      }

      const timestamp = data.timestamp || Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
      const studentName = data.studentName || data.fullName || "Không tên";
      const username = data.username || "Khách (chưa đăng nhập)";
      const studentClass = data.studentClass || data.className || "";
      const scaledScore = data.scaledScore !== undefined ? Number(data.scaledScore) : 0;
      const rawScore = `${data.pointsEarned || 0} / ${data.totalPossiblePoints || 0}`;
      const correctCount = data.correctCount !== undefined ? Number(data.correctCount) : 0;
      const totalQuestions = data.totalQuestions !== undefined ? Number(data.totalQuestions) : 0;
      const accuracy = totalQuestions > 0 ? `${Math.round((correctCount / totalQuestions) * 100)}%` : "0%";
      const timeSpent = data.timeSpent || "";

      // Tóm tắt chi tiết các câu đã làm
      let detailsSummary = "";
      if (Array.isArray(data.details)) {
        detailsSummary = data.details.map((item, i) => {
          const status = item.isCorrect ? "ĐÚNG" : "SAI";
          return `Câu ${i + 1}: ${status} [Chọn: ${item.selectedOption || "Bỏ qua"} | Đ/Á: ${item.correctAnswer}] (+${item.pointsEarned || 0}đ)`;
        }).join("\n");
      } else if (typeof data.details === "string") {
        detailsSummary = data.details;
      }

      // Kiểm tra cấu trúc tiêu đề hiện tại của Sheet để ghi đúng vị trí cột
      let hasUsernameHeader = false;
      if (resultSheet.getLastRow() > 0 && resultSheet.getLastColumn() > 0) {
        const existingHeaders = resultSheet.getRange(1, 1, 1, resultSheet.getLastColumn()).getValues()[0];
        hasUsernameHeader = existingHeaders.some(h => {
          const s = (h || "").toString().toLowerCase();
          return s.includes("tài khoản") || s.includes("username");
        });
      }

      let newRow;
      let scoreColIndex = 4; // Cột 4: Điểm số (Thang 100) theo chuẩn 10 cột
      let statsStartColIndex = 6; // Cột 6, 7, 8: Số câu đúng, Tổng số câu, Tỷ lệ đúng (%)

      if (hasUsernameHeader) {
        newRow = [
          timestamp,
          studentName,
          username,
          studentClass,
          scaledScore,
          rawScore,
          correctCount,
          totalQuestions,
          accuracy,
          timeSpent,
          detailsSummary
        ];
        scoreColIndex = 5;
        statsStartColIndex = 7;
      } else {
        let classCombined = studentClass;
        if (username && !username.includes("khách") && !classCombined.toLowerCase().includes(username.toLowerCase())) {
          classCombined = `${studentClass} (@${username})`;
        }

        newRow = [
          timestamp,       // Cột 1: Thời gian nộp
          studentName,     // Cột 2: Họ và tên
          classCombined,   // Cột 3: Lớp / MSSV
          scaledScore,     // Cột 4: Điểm số (Thang 100)
          rawScore,        // Cột 5: Điểm số thực tế
          correctCount,    // Cột 6: Số câu đúng
          totalQuestions,  // Cột 7: Tổng số câu
          accuracy,        // Cột 8: Tỷ lệ đúng (%) -> Chuỗi '58%', KHÔNG BỊ HIỆN 5000%
          timeSpent,       // Cột 9: Thời gian làm bài
          detailsSummary   // Cột 10: Chi tiết bài làm (ĐÚNG trong Cột J, không bị đẩy sang Cột K!)
        ];
      }

      // Ghi dòng mới vào sheet
      resultSheet.appendRow(newRow);

      // Căn chỉnh dòng vừa thêm
      const lastRow = resultSheet.getLastRow();
      const rowRange = resultSheet.getRange(lastRow, 1, 1, newRow.length);
      rowRange.setVerticalAlignment("middle");
      resultSheet.getRange(lastRow, scoreColIndex).setHorizontalAlignment("center").setFontWeight("bold");
      resultSheet.getRange(lastRow, statsStartColIndex, 1, 3).setHorizontalAlignment("center");

      // Đổi màu cho sinh viên đạt hoặc chưa đạt
      if (data.isCheatingAutoSubmit) {
        resultSheet.getRange(lastRow, 1, 1, newRow.length).setBackground("#fee2e2");
        resultSheet.getRange(lastRow, scoreColIndex).setFontColor("#b91c1c");
      } else if (scaledScore >= 95) {
        resultSheet.getRange(lastRow, scoreColIndex).setFontColor("#059669");
      } else {
        resultSheet.getRange(lastRow, scoreColIndex).setFontColor("#dc2626");
      }

      // Xóa cache Bảng Xếp Hạng để cập nhật ngay lập tức kết quả mới
      try {
        CacheService.getScriptCache().remove("cached_leaderboard");
      } catch (_) {}

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Kết quả đã được lưu thành công vào Google Sheet!",
          studentName: studentName,
          score: scaledScore
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================================================
    // 6. PHẢN HỒI MẶC ĐỊNH CHO HÀNH ĐỘNG KHÔNG XÁC ĐỊNH (TUYỆT ĐỐI KHÔNG GHI ĐÈ SHEET)
    // ==========================================================================
    return ContentService.createTextOutput(
      JSON.stringify({ status: "ignored", message: "Hành động không xác định hoặc không được hỗ trợ" })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: error.toString()
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

/**
 * Hàm hỗ trợ: Lọc CHỈ LẤY LẦN THI ĐẦU TIÊN của mỗi sinh viên theo từng tuần
 * Bất kỳ lần thi sau nào (thi lại / nộp đè) sẽ được tự động bỏ qua để đảm bảo tính công bằng.
 * Hỗ trợ linh hoạt cả chuẩn 10 cột, 11 cột và các dòng cũ đã nộp.
 */
function extractFirstAttemptsFromRows(dataRows, headerRow) {
  const results = [];
  const seenStudentWeek = {};

  let hasUserColInHeader = false;
  if (Array.isArray(headerRow) && headerRow.length > 0) {
    hasUserColInHeader = headerRow.some(h => {
      const s = (h || "").toString().toLowerCase();
      return s.includes("tài khoản") || s.includes("username");
    });
  }

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    if (!r || r.length === 0 || !r[0]) continue;

    const col0 = r[0]; // Thời gian nộp
    const col1 = (r[1] || "").toString().trim(); // Họ và tên
    let username = "";
    let studentClass = "";
    let scaledScore = 0;
    let rawScore = "";
    let correctCount = 0;
    let totalQuestions = 0;
    let accuracy = "";
    let timeSpent = "";

    // Phân tích tự động từng dòng:
    // Dạng 1: Dòng 11 cột (hoặc dòng cũ bị dịch): r[2] là username ("hieung"), r[3] chứa "[Tuần", r[4] là số điểm (58)
    const col3Str = (r[3] || "").toString();
    const col4Num = Number(r[4]);
    const isShiftedOr11Col = hasUserColInHeader || (col3Str.match(/Tuần\s*\d+/i) && !isNaN(col4Num));

    if (isShiftedOr11Col) {
      username = (r[2] || "").toString().toLowerCase().trim();
      studentClass = col3Str;
      scaledScore = !isNaN(col4Num) ? col4Num : (Number(r[3]) || 0);
      rawScore = r[5] || "";
      correctCount = Number(r[6]) || 0;
      totalQuestions = Number(r[7]) || 0;
      accuracy = r[8];
      timeSpent = r[9];
    } else {
      // Dạng 2: Chuẩn 10 cột
      // r[2]: Lớp / MSSV (kèm @username nếu có)
      // r[3]: Điểm số (Thang 100)
      // r[4]: Điểm số thực tế
      // r[5]: Số câu đúng
      // r[6]: Tổng số câu
      // r[7]: Tỷ lệ đúng (%)
      // r[8]: Thời gian làm bài
      studentClass = (r[2] || "").toString();
      const userMatch = studentClass.match(/@([a-zA-Z0-9_\.\-]+)/);
      if (userMatch) {
        username = userMatch[1].toLowerCase().trim();
      } else {
        username = studentClass.split("[")[0].trim().toLowerCase();
      }
      scaledScore = Number(r[3]) || 0;
      rawScore = r[4] || "";
      correctCount = Number(r[5]) || 0;
      totalQuestions = Number(r[6]) || 0;
      accuracy = r[7];
      timeSpent = r[8];
    }

    if (!username || username.includes("khách")) continue;

    // Bỏ qua hàng rác / lỗi ("Không tên" hoặc điểm 0 và 0 câu hỏi)
    const isGhostRow = (col1 === "Không tên" || !col1) && (totalQuestions === 0 || scaledScore === 0);
    if (isGhostRow) continue;

    // Chuẩn hóa định dạng tỷ lệ đúng (VD: 0.58 -> "58%")
    if (typeof accuracy === "number") {
      accuracy = `${Math.round(accuracy * 100)}%`;
    }

    const match = studentClass.match(/Tuần\s*(\d+)/i);
    const weekId = match ? match[1] : "1";
    const uniqueKey = username + "_w" + weekId;

    // QUY TẮC BẤT DI BẤT DỊCH: Chỉ lấy hàng đầu tiên xuất hiện trên Google Sheet cho tuần đó
    if (!seenStudentWeek[uniqueKey]) {
      seenStudentWeek[uniqueKey] = true;
      results.push({
        timestamp: col0,
        studentName: col1,
        username: username,
        studentClass: studentClass,
        scaledScore: scaledScore,
        rawScore: rawScore,
        correctCount: correctCount,
        totalQuestions: totalQuestions,
        accuracy: accuracy,
        timeSpent: timeSpent,
        isOfficialFirstAttempt: true
      });
    }
  }

  return results;
}

/**
 * Xử lý GET request: Trả về Bảng Xếp Hạng, Danh sách tài khoản hoặc Dọn dẹp rác
 */
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : "";
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. API Lấy toàn bộ kết quả bài thi từ sheet KetQuaThi (Đã lọc chỉ lần thi đầu tiên)
    if (action === "get_leaderboard" || action === "get_results") {
      const cache = CacheService.getScriptCache();
      const cached = cache.get("cached_leaderboard");
      if (cached) {
        return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
      }

      const resultSheet = ss.getSheetByName(SHEET_NAME_RESULTS);
      if (!resultSheet || resultSheet.getLastRow() <= 1) {
        const emptyOutput = JSON.stringify({ status: "success", count: 0, results: [] });
        try { cache.put("cached_leaderboard", emptyOutput, 10); } catch (_) {}
        return ContentService.createTextOutput(emptyOutput).setMimeType(ContentService.MimeType.JSON);
      }

      const rows = resultSheet.getDataRange().getValues();
      const headerRow = rows.length > 0 ? rows[0] : [];
      const dataRows = rows.slice(1);
      const results = extractFirstAttemptsFromRows(dataRows, headerRow);

      const output = JSON.stringify({ status: "success", count: results.length, results: results });
      try { cache.put("cached_leaderboard", output, 10); } catch (_) {} // Lưu cache 10 giây
      return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. API Lấy danh sách tài khoản sinh viên đã đăng ký từ tab TaiKhoan (cho phép đồng bộ đa thiết bị/tab)
    if (action === "get_accounts") {
      const accSheet = ss.getSheetByName(SHEET_NAME_ACCOUNTS);
      if (!accSheet || accSheet.getLastRow() <= 1) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: "success", count: 0, accounts: [] })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      const rows = accSheet.getDataRange().getValues();
      const accounts = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const u = (row[1] || "").toString().trim().toLowerCase();
        if (u) {
          accounts.push({
            username: u,
            password: (row[2] || "").toString(),
            fullName: (row[3] || "").toString().trim() || u,
            className: (row[4] || "").toString().trim() || "Chưa phân lớp",
            createdAt: row[0] || "",
            lastLogin: row[5] || ""
          });
        }
      }

      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", count: accounts.length, accounts: accounts })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 3. API Dọn dẹp dòng rác 'Không tên' trong KetQuaThi (tiện ích kích hoạt qua URL)
    if (action === "clean_ghost_rows") {
      const resSheet = ss.getSheetByName(SHEET_NAME_RESULTS);
      let deletedCount = 0;
      if (resSheet && resSheet.getLastRow() > 1) {
        const rData = resSheet.getDataRange().getValues();
        for (let j = rData.length - 1; j >= 1; j--) {
          const rowName = (rData[j][1] || "").toString().trim();
          const rowScore = Number(rData[j][3]) || 0;
          const rowTotal = Number(rData[j][6]) || 0;
          if ((!rowName || rowName === "Không tên") && rowScore === 0 && rowTotal === 0) {
            resSheet.deleteRow(j + 1);
            deletedCount++;
          }
        }
      }
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", message: `Đã dọn dẹp ${deletedCount} dòng rác 'Không tên' trong KetQuaThi!`, deletedCount: deletedCount })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 4. Mặc định: Phản hồi trạng thái Webhook sẵn sàng
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "ready",
        message: "Quiz Webhook & Quản Lý Bảng Xếp Hạng Google Sheet đang hoạt động tốt!"
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
