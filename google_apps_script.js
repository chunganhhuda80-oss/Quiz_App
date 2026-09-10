/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT - HỆ THỐNG QUẢN LÝ BÀI THI & TÀI KHOẢN HỌC SINH TỰ ĐỘNG
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
 * - Tab 1: "KetQuaThi" - Tự động ghi kết quả bài thi, câu đúng, điểm số, thời gian và tài khoản học sinh.
 * - Tab 2: "TaiKhoan" - Tự động ghi danh sách học sinh đăng ký (Username, Mật khẩu, Họ tên, Lớp).
 *   Giáo viên có thể trực tiếp xem, sửa mật khẩu hoặc xóa học sinh ngay trên trang tính Google Sheet!
 * ==============================================================================
 */

const SHEET_NAME_RESULTS = "KetQuaThi";
const SHEET_NAME_ACCOUNTS = "TaiKhoan";

// Tiêu đề các cột trong tab KetQuaThi
const HEADERS_RESULTS = [
  "Thời gian nộp",
  "Họ và tên",
  "Tài khoản (Username)",
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
  "Họ và tên học sinh",
  "Lớp / MSSV",
  "Lần đăng nhập cuối"
];

/**
 * Xử lý khi nhận dữ liệu POST từ website
 */
function doPost(e) {
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
    // 3. XỬ LÝ NỘP KẾT QUẢ BÀI THI (action === "submit_quiz" hoặc mặc định)
    // ==========================================================================
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
    const studentName = data.studentName || "Không tên";
    const username = data.username || "Khách (chưa đăng nhập)";
    const studentClass = data.studentClass || "";
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

    const newRow = [
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

    // Ghi dòng mới vào sheet
    resultSheet.appendRow(newRow);

    // Căn chỉnh dòng vừa thêm
    const lastRow = resultSheet.getLastRow();
    const rowRange = resultSheet.getRange(lastRow, 1, 1, HEADERS_RESULTS.length);
    rowRange.setVerticalAlignment("middle");
    resultSheet.getRange(lastRow, 5).setHorizontalAlignment("center").setFontWeight("bold"); // Cột điểm 100
    resultSheet.getRange(lastRow, 7, 1, 3).setHorizontalAlignment("center"); // Các cột số liệu

    // Đổi màu cho học sinh đạt hoặc chưa đạt (Yêu cầu >= 95 điểm mới qua môn)
    if (data.isCheatingAutoSubmit) {
      resultSheet.getRange(lastRow, 1, 1, HEADERS_RESULTS.length).setBackground("#fee2e2"); // Đỏ nhạt cảnh báo vi phạm
      resultSheet.getRange(lastRow, 5).setFontColor("#b91c1c");
    } else if (scaledScore >= 95) {
      resultSheet.getRange(lastRow, 5).setFontColor("#059669"); // Xanh lá (Đạt)
    } else {
      resultSheet.getRange(lastRow, 5).setFontColor("#dc2626"); // Đỏ (Chưa đạt)
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        status: "success",
        message: "Kết quả đã được lưu thành công vào Google Sheet!",
        studentName: studentName,
        score: scaledScore
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: "error",
        message: error.toString()
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Kiểm tra trạng thái hoạt động của Webhook
 */
function doGet(e) {
  return ContentService.createTextOutput(
    "Quiz Webhook & Quản Lý Tài Khoản đang hoạt động tốt! Hệ thống đã sẵn sàng nhận kết quả trắc nghiệm và thông tin đăng nhập/đăng ký."
  ).setMimeType(ContentService.MimeType.TEXT);
}
