/**
 * ==============================================================================
 * TỆP CẤU HÌNH HỆ THỐNG KIỂM TRA TRẮC NGHIỆM (QUIZ APP)
 * ==============================================================================
 * Hỗ trợ chọn 15 tuần làm bài thi, mở khóa Tuần 1 & Tuần 2 theo tiến độ học tập.
 */

const CONFIG = {
  // ---------------------------------------------------------------------------
  // 1. CẤU HÌNH GOOGLE SHEETS VÀ ĐỒNG BỘ ĐÁM MÂY (CLOUD SYNC)
  // ---------------------------------------------------------------------------
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwbB2ajI_obZt98hsLRVdQE-6yki1_2ZcNcuU-DL5Mnq-hJGlGppmvtB0sWxdeLKPxK8w/exec",
  CLOUD_WEEKS_STATUS_URL: "https://extendsclass.com/api/json-storage/bin/ceacfec",
  DIRECT_CLOUD_STORE_URL: "https://api.restful-api.dev/objects/ff808181a067127101a08c02980c68c1",

  // ---------------------------------------------------------------------------
  // 2. DANH SÁCH 15 TUẦN HỌC (CHỈ MỞ KHÓA TUẦN 1 VÀ TUẦN 2)
  // ---------------------------------------------------------------------------
  WEEKS: [
    {
      id: 1,
      name: "Tuần 1",
      title: "Mạng Máy Tính - Tổng Quan & Mô Hình OSI",
      file: "questions_tuan1.json",
      durationMinutes: 20,
      totalQuestions: 50,
      isUnlocked: true,
      description: "50 câu trắc nghiệm (Layer 1 - Layer 7, Encapsulation, Thiết bị mạng)"
    },
    {
      id: 2,
      name: "Tuần 2",
      title: "Mô Hình TCP/IP & Giao Thức Mạng Nâng Cao",
      file: "questions_tuan2.json",
      durationMinutes: 30,
      totalQuestions: 70,
      isUnlocked: true,
      description: "70 câu trắc nghiệm (TCP/UDP, Cáp mạng, Bảng MAC, Giao thức Internet)"
    },
    {
      id: 3,
      name: "Tuần 3",
      title: "Tầng Ứng Dụng (HTTP, DNS, DHCP, FTP, ICMP)",
      file: "questions_tuan3.json",
      durationMinutes: 30,
      totalQuestions: 70,
      isUnlocked: true,
      description: "70 câu trắc nghiệm (FTP, ICMP, TCP 3-Way Handshake, Tầng Ứng dụng & Transport)"
    },
    {
      id: 4,
      name: "Tuần 4",
      title: "Tầng Giao Vận & Mạng (Flow Control, Subnetting, IPv6)",
      file: "questions_tuan4.json",
      durationMinutes: 35,
      totalQuestions: 80,
      isUnlocked: true,
      description: "80 câu trắc nghiệm (TCP Flow Control, Ethernet Frame, Chia mạng con Subnetting, IPv6 SLAAC)"
    },
    {
      id: 5,
      name: "Tuần 5",
      title: "Tầng Mạng & Cấu Trúc Địa Chỉ IPv4",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    },
    {
      id: 6,
      name: "Tuần 6",
      title: "Chia Mạng Con (Subnetting & VLSM)",
      file: "",
      durationMinutes: 35,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    },
    {
      id: 7,
      name: "Tuần 7",
      title: "Định Tuyến Tĩnh & Động (Static & Dynamic Routing)",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    },
    {
      id: 8,
      name: "Tuần 8",
      title: "Giao Thức Định Tuyến OSPF Đơn Vùng",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    },
    {
      id: 9,
      name: "Tuần 9",
      title: "Tầng Liên Kết Dữ Liệu & Chuyển Mạch Switch",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    },
    {
      id: 10,
      name: "Tuần 10",
      title: "Cấu Hình VLAN & Định Tuyến Inter-VLAN",
      file: "",
      durationMinutes: 35,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    },
    {
      id: 11,
      name: "Tuần 11",
      title: "Giao Thức Spanning Tree (STP & RSTP)",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    },
    {
      id: 12,
      name: "Tuần 12",
      title: "Biên Dịch Địa Chỉ Mạng (NAT / PAT)",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    },
    {
      id: 13,
      name: "Tuần 13",
      title: "Bảo Mật Mạng Cơ Bản & Danh Sách Điều Khiển (ACL)",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    },
    {
      id: 14,
      name: "Tuần 14",
      title: "Mạng Cục Bộ Không Dây (WLAN / Wi-Fi)",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    },
    {
      id: 15,
      name: "Tuần 15",
      title: "Ôn Tập Tổng Hợp & Thi Kết Thúc Học Phần",
      file: "",
      durationMinutes: 60,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung"
    }
  ],

  // ---------------------------------------------------------------------------
  // 3. CẤU HÌNH CHUNG BÀI THI & GIAO DIỆN
  // ---------------------------------------------------------------------------
  QUIZ: {
    title: "HỆ THỐNG KIỂM TRA TRẮC NGHIỆM THEO TUẦN",
    subject: "Mạng Máy Tính (Networking Fundamentals)",

    // Tự động xáo trộn thứ tự câu hỏi mỗi lần học sinh mở bài hoặc làm lại bài (true / false)
    shuffleQuestions: true,

    // Tự động đảo ngẫu nhiên các phương án A, B, C, D trong từng câu hỏi (true / false)
    shuffleOptions: true,

    // Thời gian dừng lại (mili-giây) sau khi bấm chọn đáp án để xem đúng/sai
    autoAdvanceDelayMs: 1100,

    // Bật âm thanh hiệu ứng (Web Audio API)
    enableSound: true,

    // Thang điểm tối đa chuẩn hóa
    targetScale: 100,

    // Điểm tối thiểu đạt (thang 100 - Yêu cầu 95 điểm mới qua môn)
    passingScore: 95
  },

  // ---------------------------------------------------------------------------
  // 4. CẤU HÌNH CHỐNG GIAN LẬN (GIÁM SÁT CHUYỂN TAB & THOÁT TRÌNH DUYỆT)
  // ---------------------------------------------------------------------------
  ANTI_CHEAT: {
    // Bật/tắt tính năng giám sát chống gian lận
    enabled: true,

    // Số lần vi phạm tối đa (rời màn hình / chuyển tab) trước khi tự động nộp bài
    maxViolations: 3,

    // Tự động thu bài và nộp bài ngay khi vượt quá số lần vi phạm
    autoSubmitOnExceed: true,

    // Phát âm thanh còi cảnh báo khi học sinh vi phạm
    enableSoundAlert: true
  },

  // ---------------------------------------------------------------------------
  // 5. CẤU HÌNH TÀI KHOẢN QUẢN TRỊ VIÊN (ADMINISTRATOR)
  // ---------------------------------------------------------------------------
  ADMIN: {
    username: "rappergaming",
    displayName: "Quản Trị Viên",
    role: "admin",
    // Mã băm SHA-256 của mật khẩu '123@Ngocanh' (bảo mật tuyệt đối, chống xem trộm F12)
    passwordHash: "c337fbed9cf219942cd5b874f33e7ebd7ad35c27f87e45db3d168e554be444c1",
    // Cho phép Admin xem trước toàn bộ 15 tuần làm bài
    unlockAllWeeks: true,
    // Miễn trừ cảnh báo chuyển tab khi Admin kiểm tra đề thi
    bypassAntiCheat: true
  }
};

// Đóng băng cấu hình
Object.freeze(CONFIG);
Object.freeze(CONFIG.QUIZ);
Object.freeze(CONFIG.ANTI_CHEAT);
Object.freeze(CONFIG.ADMIN);
