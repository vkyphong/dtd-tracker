# DTD: GAME — Stats Tracker (GitHub Pages + Firebase)

Hệ thống gồm 2 phần:
1. **`../dtd_stats_sender.luau`**: Script chạy trong Roblox (gửi toàn bộ thông số game lên Firebase mỗi 30 giây).
2. **Thư mục `dtd-tracker/`**: Website Dashboard tĩnh (`index.html`, `style.css`, `app.js`, `config.js`) để deploy lên **GitHub Pages**.

---

## Bước 1: Tạo Firebase Realtime Database (Miễn phí ~2 phút)
1. Vào [Firebase Console](https://console.firebase.google.com/) → **Create a project** (tắt Google Analytics cho nhanh).
2. Ở menu trái chọn **Build → Realtime Database → Create Database**.
3. Chọn server gần Việt Nam nhất (ví dụ **Singapore `asia-southeast1`**).
4. Chọn **Start in test mode** (cho phép đọc/ghi trong 30 ngày; hoặc vào tab **Rules** chỉnh lại theo ý bạn).
5. Copy đường dẫn Database URL có dạng:
   `https://ten-project-default-rtdb.asia-southeast1.firebasedatabase.app`

---

## Bước 2: Gắn URL Firebase vào Code
1. Mở [config.js](./config.js) và dán URL vào `FIREBASE_URL`.
2. Mở [../dtd_stats_sender.luau](../dtd_stats_sender.luau) và dán URL đó vào dòng `local FIREBASE_URL = "..."`.

---

## Bước 3: Deploy Website lên GitHub Pages
1. Tạo 1 repository mới trên GitHub (ví dụ `dtd-tracker`, để Public).
2. Upload toàn bộ các file trong thư mục `dtd-tracker/` (`index.html`, `style.css`, `app.js`, `config.js`) lên nhánh `main` của repo đó.
3. Vào **Settings → Pages** → ở mục **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **`main`** / **`(root)`** → bấm **Save**.
4. Chờ ~30–60 giây, GitHub sẽ cấp link dạng `https://<ten-github>.github.io/dtd-tracker/`.

---

## Bước 4: Chạy trong Game
- Copy file `dtd_stats_sender.luau` vào thư mục `autoexec` của executor (hoặc chạy trực tiếp).
- Mở link GitHub Pages để xem Vàng (Coins), tốc độ farm (`/giờ`), biểu đồ và toàn bộ thông số của tất cả acc đang treo!
