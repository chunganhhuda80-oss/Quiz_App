# ỨNG DỤNG KIỂM TRA TRẮC NGHIỆM TRỰC TUYẾN (QUIZ APP)

Hệ thống web thi trắc nghiệm hiện đại dành cho học sinh, xây dựng hoàn toàn bằng **HTML + CSS + JavaScript thuần**, tự động lưu kết quả trực tiếp vào **Google Sheets (qua Google Apps Script)**.

---

## 🌟 CÁC TÍNH NĂNG NỔI BẬT

1. **Hệ thống 15 Tuần học chuyên nghiệp**:
   - Giao diện lưới hiển thị trực quan **15 tuần học**:
     - **Tuần 1**: Mạng Máy Tính - Mô hình OSI (50 câu - **20 phút** - **Đang mở**).
     - **Tuần 2**: Mô Hình TCP/IP & Giao Thức Mạng Nâng Cao (70 câu - **30 phút** - **Đang mở**).
     - **Tuần 3 -> 15**: Trạng thái **Khóa** 🔒 (hiển thị biểu tượng ổ khóa, thông báo nhắc nhở khi bấm vào).
   - Điểm chuẩn qua môn yêu cầu cao: **≥ 95 điểm** mới được xếp loại **ĐẠT (XUẤT SẮC)**, dưới 95 điểm hiển thị **CHƯA ĐẠT**.
   - Tự động nạp bộ câu hỏi, thời gian và số điểm tương ứng của tuần được chọn từ file JSON riêng biệt (`questions_tuan1.json`, `questions_tuan2.json`).
   - Tự động đính kèm tên Tuần vào kết quả lưu trên Google Sheets để giáo viên dễ dàng phân loại.

2. **Quy trình làm bài chuẩn mực**:
   - Màn hình nhập **Họ và Tên** + **Lớp / Mã sinh viên** trước khi vào thi.
   - Tự động **xáo trộn thứ tự câu hỏi** mỗi lần mở bài thi (Fisher-Yates Shuffle).
   - Hiển thị từng câu một, **khóa không cho quay lại sửa câu trước**.
   - Điểm số linh hoạt theo từng câu (lấy từ trường `points` trong `questions.json`).
   - Màn hình kết quả tổng kết: Điểm số thang 100 với vòng tròn tiến trình động, số câu đúng/tổng câu, tỷ lệ chính xác %, thời gian hoàn thành.
   - Danh sách xem lại chi tiết từng câu (hỗ trợ lọc: Tất cả / Câu đúng / Câu sai).
   - Dòng thông báo nổi bật: **"✓ Kết quả đã được gửi cho giáo viên"** giúp học sinh an tâm sau khi hoàn thành.

---

## 📁 CẤU TRÚC THƯ MỤC

```
d:/Quiz_App/
├── index.html                   # Giao diện chính (Single Page Application 3 màn hình)
├── style.css                    # CSS hiện đại, hiệu ứng animation & responsive di động
├── app.js                       # Logic xử lý câu hỏi, âm thanh, tính điểm, nộp bài
├── config.js                    # Tệp cấu hình tập trung (URL Google Sheets, thời gian)
├── questions.json               # Dữ liệu câu hỏi (50 câu trắc nghiệm mạng máy tính)
├── convert_excel_to_json.py     # Script Python chuyển đổi file Excel sang questions.json
├── google_apps_script.js        # Mã nguồn Apps Script để dán vào Google Sheets
└── README.md                    # Hướng dẫn chi tiết
```

---

## 🚀 HƯỚNG DẪN KHỞI CHẠY NHANH

Do trình duyệt bảo mật chặn lệnh `fetch()` khi mở trực tiếp file qua giao thức `file://`, bạn nên khởi chạy ứng dụng qua một Web Server cục bộ đơn giản (chỉ cần 1 câu lệnh):

### Cách 1: Sử dụng Python (Đã có sẵn trên máy)
Mở terminal tại thư mục `d:/Quiz_App` và chạy:
```bash
python -m http.server 8000
```
Sau đó mở trình duyệt truy cập: **`http://localhost:8000`**

### Cách 2: Sử dụng Node.js / npx
```bash
npx serve .
```

### Cách 3: Sử dụng Extension "Live Server" trong VS Code
Chỉ cần nhấp chuột phải vào file `index.html` -> Chọn **"Open with Live Server"**.

---

## 📊 HƯỚNG DẪN TÍCH HỢP GOOGLE SHEETS (CHỈ MẤT 2 PHÚT)

Để bài thi tự động ghi điểm về Google Sheets của giáo viên:

1. Mở một trang Google Sheets mới: [https://sheets.new](https://sheets.new)
2. Đặt tên bảng tính (ví dụ: *Kết Quả Trắc Nghiệm Mạng Máy Tính*).
3. Trên thanh menu, chọn: **Tiện ích mở rộng** (Extensions) -> **Apps Script**.
4. Xóa toàn bộ nội dung trong tệp `Code.gs`, sau đó mở tệp [`google_apps_script.js`](file:///d:/Quiz_App/google_apps_script.js), copy toàn bộ nội dung và dán vào.
5. Bấm nút **Lưu** (biểu tượng đĩa mềm hoặc `Ctrl + S`).
6. Bấm nút màu xanh **Triển khai** (Deploy) ở góc trên bên phải -> Chọn **Tùy chọn triển khai mới** (New deployment).
7. Bấm biểu tượng bánh răng ⚙️ (Cài đặt) -> Chọn **Ứng dụng web** (Web app).
8. Điền thông tin:
   - **Mô tả**: `Quiz Result Webhook`
   - **Thực thi dưới dạng** (Execute as): `Tôi` (Me - email của bạn)
   - **Ai có quyền truy cập** (Who has access): Chọn **`Bất kỳ ai`** (Anyone) *(Bắt buộc chọn Anyone để học sinh nộp bài không bị chặn xác thực)*.
9. Bấm **Triển khai** (Deploy) -> Chọn tài khoản Google của bạn -> "Nâng cao" -> "Đi tới... (không an toàn)" -> Bấm **Cho phép** (Allow).
10. Copy **URL ứng dụng web** (chuỗi liên kết kết thúc bằng `/exec`).
11. Mở tệp [`config.js`](file:///d:/Quiz_App/config.js) và dán link vào biến:
   ```javascript
   GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycb.../exec",
   ```
*(Bảng tính sẽ tự động kẻ bảng tiêu đề màu tím than chuyên nghiệp và tự động thêm dòng mới ghi nhận họ tên, lớp, điểm số thang 100, số câu đúng và thời gian làm bài của từng học sinh ngay khi nộp bài!)*

---

## 📝 HƯỚNG DẪN CHUYỂN ĐỔI FILE EXCEL SANG CÂU HỎI MỚI

Nếu bạn có một đề thi khác (ví dụ: `quiz_tuan2_full_70cau.xlsx`):
1. Chạy lệnh:
   ```bash
   python convert_excel_to_json.py quiz_tuan2_full_70cau.xlsx questions.json
   ```
2. Tải lại trang web (F5) là toàn bộ 70 câu hỏi mới sẽ lập tức được áp dụng!
