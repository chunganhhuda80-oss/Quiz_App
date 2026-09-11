// Vercel Serverless Function: Đồng bộ trạng thái mở/khóa tuần thi thời gian thực
// Endpoint: /api/weeks

const EXTENDS_CLASS_URL = "https://extendsclass.com/api/json-storage/bin/ceacfec";
const RESTFUL_API_URL = "https://api.restful-api.dev/objects/ff808181a067127101a08c02980c68c1";

module.exports = async (req, res) => {
  // Cấu hình CORS mở toàn bộ
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: Lấy trạng thái mới nhất
  if (req.method === 'GET') {
    try {
      // Thử đọc từ restful-api.dev
      const r1 = await fetch(RESTFUL_API_URL + "?v=" + Date.now());
      if (r1.ok) {
        const d1 = await r1.json();
        if (d1 && d1.data && d1.data.weeks) {
          return res.status(200).json(d1.data);
        }
      }
    } catch (e) {
      console.warn("Lỗi đọc restful-api.dev:", e);
    }

    try {
      // Fallback đọc từ extendsclass
      const r2 = await fetch(EXTENDS_CLASS_URL + "?v=" + Date.now());
      if (r2.ok) {
        const d2 = await r2.json();
        const weeks = d2.weeks || d2;
        const timestamp = d2.timestamp || 0;
        return res.status(200).json({ timestamp, weeks });
      }
    } catch (e) {
      console.warn("Lỗi đọc extendsclass:", e);
    }

    return res.status(200).json({ timestamp: 0, weeks: { "1": true, "2": true, "3": false, "4": false, "5": true, "6": true } });
  }

  // POST hoặc PUT: Lưu trạng thái mới từ Admin
  if (req.method === 'POST' || req.method === 'PUT') {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        // Giữ nguyên payload
      }
    }

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: "Dữ liệu payload không hợp lệ" });
    }

    const timestamp = payload.timestamp || Date.now();
    const weeks = payload.weeks || payload;
    const finalData = { timestamp, weeks };

    // Đồng bộ đồng thời lên cả 2 đám mây lưu trữ
    const syncPromises = [];

    // 1. Đồng bộ lên restful-api.dev
    syncPromises.push(
      fetch(RESTFUL_API_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Quiz_App_Weeks_Status",
          data: finalData
        })
      }).catch(err => console.warn("Lỗi PUT restful-api.dev:", err))
    );

    // 2. Đồng bộ lên extendsclass (Node.js fetch không bị lỗi CORS OPTIONS 500)
    syncPromises.push(
      fetch(EXTENDS_CLASS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalData)
      }).catch(err => console.warn("Lỗi PUT extendsclass:", err))
    );

    await Promise.allSettled(syncPromises);

    return res.status(200).json({
      success: true,
      timestamp,
      weeks
    });
  }

  return res.status(405).json({ error: "Phương thức không được hỗ trợ" });
};
