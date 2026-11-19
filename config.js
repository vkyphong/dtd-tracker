// Cấu hình Firebase Realtime Database của bạn
// Ví dụ: "https://dtd-tracker-default-rtdb.asia-southeast1.firebasedatabase.app"
window.TRACKER_CONFIG = {
    FIREBASE_URL: "https://dtd-dashboard-default-rtdb.asia-southeast1.firebasedatabase.app/",
    // Tùy chọn: nếu bạn khóa rules Firebase, dán Database Secret hoặc Auth token vào đây (không bắt buộc nếu để rules test)
    FIREBASE_AUTH: "",
    // Khoảng thời gian web tự động làm mới dữ liệu (giây)
    REFRESH_INTERVAL_SEC: 15,
    // Sau bao nhiêu giây không nhận được dữ liệu mới từ game thì đánh dấu là Offline
    OFFLINE_THRESHOLD_SEC: 90
};
