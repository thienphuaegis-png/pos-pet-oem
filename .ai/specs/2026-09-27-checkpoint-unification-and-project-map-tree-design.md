# ĐẶC TẢ THIẾT KẾ: QUY CHUẨN LƯU/ĐỌC CHECKPOINT & NÂNG CẤP PROJECT_MAP.HTML

**Ngày:** 2026-09-27  
**Mục tiêu:** Thống nhất Single Source of Truth cho việc lưu/đọc checkpoint giữa AI và người dùng, tích hợp Cây Thư Mục tương tác vào `PROJECT_MAP.html`, loại bỏ file dư thừa `PROJECT_TRACKING.md`, và cập nhật bộ chuẩn `coding-standards`.

---

## 1. THỰC TRẠNG & VẤN ĐỀ
- Tiến độ và checkpoint bị phân mảnh ở 3 nơi: `PROJECT_STATE.md`, `PROJECT_TRACKING.md`, và `PROJECT_MAP.html`.
- `PROJECT_STATE.md` bị tích lũy log qua nhiều ngày (23, 24, 26, 27/9) vượt quá 11.000 tokens, gây lãng phí bộ nhớ ngữ cảnh nghiêm trọng.
- `PROJECT_TRACKING.md` duy trì cây thư mục và danh sách tính năng cũ kỹ, gây bảo trì kép.
- `PROJECT_MAP.html` rất trực quan nhưng thiếu Cây Thư Mục (Project Tree) và dữ liệu `localStorage` dễ bị lệch pha khi code thay đổi trên đĩa.
- Các skill chưa có quy ước rõ ràng file nào là file đọc/ghi checkpoint chính thức.

---

## 2. KIẾN TRÚC GIẢI PHÁP (SINGLE SOURCE OF TRUTH)

```
                            ┌──────────────────────────────────────────────┐
                            │           AI ENGINE (Hermes / Dev)           │
                            └──────────────────────┬───────────────────────┘
                                                   │
                   Đọc đầu phiên & Lưu cuối phiên   │ (1 Source of Truth duy nhất)
                                                   ▼
                            ┌──────────────────────────────────────────────┐
                            │              PROJECT_STATE.md                │
                            │      - Giới hạn nghiêm ngặt < 100 dòng       │
                            │      - Dung lượng: < 800 tokens             │
                            │      - Chỉ chứa phiên gần nhất + Việc kế tiếp│
                            └──────────────────────┬───────────────────────┘
                                                   │
                                   Đồng bộ dữ liệu  │ (AI cập nhật đồng thời)
                                                   ▼
                            ┌──────────────────────────────────────────────┐
                            │              PROJECT_MAP.html                │
                            │  - Hub giao diện trực quan cho người dùng     │
                            │  - Tab 1: 📋 Bảng Tiến Độ (Tasks tương tác)   │
                            │  - Tab 2: 📂 Cây Thư Mục Tương Tác (Tree)    │
                            │  - Auto-invalidate cache qua ROADMAP_VERSION │
                            └──────────────────────────────────────────────┘
```

---

## 3. QUY CHUẨN CHI TIẾT

### A. Quy chuẩn `PROJECT_STATE.md` (< 100 dòng / < 800 tokens)
Chỉ chứa 4 phần:
1. **Header Metadata**: Checkpoint ngày, URL, DB, branch.
2. **Phiên Hiện Tại (Session Work)**: Tóm tắt 3–5 bullet points ngắn gọn.
3. **Bằng Chứng Kiểm Thử (Verification)**: Số test PASS (Pytest, Node JS, DOM).
4. **Việc Kế Tiếp (Next Priority Tasks)**: 3–5 task có ID (`bill-4`, `sys-1`,...).
*Log cũ được lưu trữ vào `docs/archive/STATE_YYYY_MM.md`.*

### B. Quy chuẩn `PROJECT_MAP.html`
1. Thêm bộ chuyển Tab trên header:
   * **[📋 Bảng Tiến Độ]**: Bảng task hiện tại có checkbox, bộ lọc, tìm kiếm, xuất Markdown.
   * **[📂 Cây Thư Mục]**: Khung xem cấu trúc thư mục dạng Tree View (phân loại `routers/`, `templates/`, `static/`, `data/`, `tests/`), bấm vào từng mục hiện vai trò.
2. Quản lý phiên bản tự động:
   * `ROADMAP_VERSION` tự bump khi có task mới (VD: `v2.8-2026-09-27`).
   * Tự động ghi đè `localStorage` nếu phiên bản trong code mới hơn.

### C. Nâng cấp Skill `coding-standards`
Bổ sung mục **4. QUY TRÌNH & AN TOÀN**:
- Quy định `PROJECT_STATE.md` là file duy nhất để lưu và đọc checkpoint.
- Quy định quy trình kết thúc phiên: Chạy test -> Ghi `PROJECT_STATE.md` -> Sync `PROJECT_MAP.html` -> Git commit.
- Nghiêm cấm duy trì file trùng lặp `PROJECT_TRACKING.md`.

### D. Dọn dẹp `PROJECT_TRACKING.md`
- Chuyển nội dung lịch sử cũ sang `docs/archive/LEGACY_TRACKING.md`.
- Xóa hẳn `PROJECT_TRACKING.md` khỏi thư mục gốc.
