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
      title: "Nền Tảng Mạng & Mô Hình OSI / TCP-IP",
      file: "questions_tuan1.json",
      durationMinutes: 20,
      totalQuestions: 50,
      isUnlocked: true,
      description: "50 câu trắc nghiệm (Mô hình OSI 7 tầng, TCP/IP, Encapsulation & Thiết bị mạng)"
    },
    {
      id: 2,
      name: "Tuần 2",
      title: "Tầng Data Link (Ethernet) & Địa Chỉ IPv4 / Subnetting",
      file: "questions_tuan2.json",
      durationMinutes: 30,
      totalQuestions: 70,
      isUnlocked: true,
      description: "70 câu trắc nghiệm (Khung Ethernet II, Địa chỉ MAC, Bảng CAM, Chia mạng con IPv4, CIDR & VLSM)"
    },
    {
      id: 3,
      name: "Tuần 3",
      title: "Địa Chỉ IPv6 & Tầng Giao Vận (TCP/UDP)",
      file: "questions_tuan3.json",
      durationMinutes: 30,
      totalQuestions: 70,
      isUnlocked: true,
      description: "70 câu trắc nghiệm (Cấu trúc IPv6, SLAAC, TCP 3-Way Handshake, Flow Control & Cổng dịch vụ UDP)"
    },
    {
      id: 4,
      name: "Tuần 4",
      title: "Chuyển Mạch Switch (VLAN, Trunking & STP/EtherChannel)",
      file: "questions_tuan4.json",
      durationMinutes: 35,
      totalQuestions: 80,
      isUnlocked: true,
      description: "80 câu trắc nghiệm (Cấu hình Switch, 802.1Q VLAN Trunking, Spanning Tree Protocol & LACP EtherChannel)"
    },
    {
      id: 5,
      name: "Tuần 5",
      title: "Dự Phòng Gateway (FHRP/Wireless) & Định Tuyến Tĩnh",
      file: "questions_tuan5.json",
      durationMinutes: 40,
      totalQuestions: 90,
      isUnlocked: true,
      description: "90 câu trắc nghiệm (HSRP/VRRP, Chuẩn Wi-Fi 802.11, Bộ điều khiển WLC, Định tuyến tĩnh & Default Route)"
    },
    {
      id: 6,
      name: "Tuần 6",
      title: "Định Tuyến Động OSPF & Dịch Vụ Mạng (DHCP / NAT)",
      file: "questions_tuan6.json",
      durationMinutes: 45,
      totalQuestions: 100,
      isUnlocked: true,
      description: "100 câu trắc nghiệm (Giao thức OSPF đơn vùng, LSA, Bầu chọn DR/BDR, DHCP DORA, NAT & PAT)"
    },
    {
      id: 7,
      name: "Tuần 7",
      title: "Bảo Mật Mạng (ACL) & Quản Trị Hệ Thống (IP Services)",
      file: "questions_tuan7.json",
      durationMinutes: 45,
      totalQuestions: 110,
      isUnlocked: false,
      description: "110 câu trắc nghiệm (Bảo mật ACL, Port Security, DHCP Snooping, NTP, DNS, SNMP & Syslog)"
    },
    {
      id: 8,
      name: "Tuần 8",
      title: "Tự Động Hóa Mạng (Automation & APIs) & Ôn Tập Capstone",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung (Kiến trúc SDN, REST APIs, JSON/YAML, Ansible & Dự án Lab CCNA tổng hợp)"
    },
    {
      id: 9,
      name: "Tuần 9",
      title: "Toán Nền Tảng Cho AI & Tiền Xử Lý Dữ Liệu",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung (Đại số tuyến tính, Xác suất thống kê, Giải tích, Pipeline ML & Làm sạch dữ liệu)"
    },
    {
      id: 10,
      name: "Tuần 10",
      title: "Các Thuật Toán Machine Learning Cốt Lõi",
      file: "",
      durationMinutes: 35,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung (Hồi quy Linear/Logistic, Decision Tree, Random Forest, SVM, K-Means & Đánh giá mô hình)"
    },
    {
      id: 11,
      name: "Tuần 11",
      title: "Nền Tảng Deep Learning (Neural Networks & CNN)",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung (Kiến trúc mạng nơ-ron đa tầng MLP, Backpropagation, Optimizer & Mạng tích chập CNN)"
    },
    {
      id: 12,
      name: "Tuần 12",
      title: "Xử Lý Chuỗi (RNN/LSTM), NLP Cơ Bản & Autoencoder / GAN",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung (Mạng hồi quy RNN, LSTM, Xử lý ngôn ngữ tự nhiên, Autoencoder phát hiện bất thường & GAN)"
    },
    {
      id: 13,
      name: "Tuần 13",
      title: "Mô Hình Transformers, LLM & Kỹ Nghệ Prompt (RAG)",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung (Cơ chế Self-Attention, Mô hình ngôn ngữ lớn LLM, RAG & Kỹ nghệ Prompt trong An toàn thông tin)"
    },
    {
      id: 14,
      name: "Tuần 14",
      title: "Trí Tuệ Nhân Tạo Trong An Ninh Mạng (AI & NIDS)",
      file: "",
      durationMinutes: 30,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung (Ứng dụng AI/ML phát hiện xâm nhập mạng NIDS, Phân tích mã độc & Phòng thủ đối kháng)"
    },
    {
      id: 15,
      name: "Tuần 15",
      title: "Dự Án Tốt Nghiệp Capstone: AI Phòng Thủ Mạng Toàn Diện",
      file: "",
      durationMinutes: 60,
      totalQuestions: 0,
      isUnlocked: false,
      description: "Chưa mở khóa - Đang cập nhật nội dung (Hạ tầng mạng phân tầng kết hợp mô hình AI giám sát, phát hiện tấn công và tự động phản ứng sự cố)"
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
