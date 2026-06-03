 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
new file mode 100644
index 0000000000000000000000000000000000000000..ad9b4b0e82cc5c00251e82bed236c6a9e12068b6
--- /dev/null
+++ b/README.md
@@ -0,0 +1,79 @@
+# SBVFAQ - Chat bot AI tra cứu Google Sheet FAQ
+
+Ứng dụng mẫu kết hợp:
+
+- **GitHub Pages**: giao diện chat tĩnh cho người dùng.
+- **Google Apps Script**: backend trung gian đọc Google Sheet, gọi AI API và ghi log.
+- **Google Sheet**: dữ liệu FAQ tại sheet `FAQ`, lịch sử hỏi đáp tại sheet `Log`.
+- **AI API**: tổng hợp câu trả lời dựa trên các dòng FAQ liên quan.
+
+Google Sheet mặc định: <https://docs.google.com/spreadsheets/d/1FInDbuWzXhh6vJ-EqaYxA5aIxZ19pVrrG_lS0imOhY4/edit?usp=drive_link>
+
+## Cấu trúc sheet
+
+### Sheet `FAQ`
+
+Hàng tiêu đề cần có các cột:
+
+| ID | GROUP | QUESTION | ANSWER | SOURCE | KEYWORDS | STATUS |
+| --- | --- | --- | --- | --- | --- | --- |
+
+Ứng dụng chỉ ưu tiên các dòng có `STATUS` trống hoặc chứa `Hiệu lực`.
+
+### Sheet `Log`
+
+Apps Script tự tạo sheet `Log` nếu chưa có và ghi các cột:
+
+| NGÀY GIỜ | CÂU HỎI | CÂU TRẢ LỜI |
+| --- | --- | --- |
+
+## Cài đặt Apps Script
+
+1. Mở Google Sheet, chọn **Extensions > Apps Script**.
+2. Tạo file `Code.gs` và dán nội dung từ [`apps-script/Code.gs`](apps-script/Code.gs).
+3. Vào **Project Settings > Script properties**, thêm:
+   - `OPENAI_API_KEY`: khóa API cho endpoint AI tương thích OpenAI.
+   - `AI_MODEL` (tùy chọn): model muốn dùng. Mặc định là `gpt-4o-mini`.
+   - `OPENAI_BASE_URL` (tùy chọn): mặc định `https://api.openai.com/v1/chat/completions`.
+   - `SPREADSHEET_ID` (tùy chọn): mặc định dùng sheet trong đề bài.
+4. Chọn **Deploy > New deployment > Web app**.
+5. Thiết lập:
+   - **Execute as**: `Me`.
+   - **Who has access**: `Anyone` hoặc phạm vi phù hợp với người dùng.
+6. Sao chép URL Web App kết thúc bằng `/exec`.
+
+> Lưu ý: GitHub Pages không nên giữ API key AI. API key chỉ lưu trong Script Properties của Apps Script.
+
+## Cấu hình GitHub Pages
+
+1. Mở [`config.js`](config.js).
+2. Dán URL Apps Script Web App vào `APPS_SCRIPT_WEB_APP_URL`.
+3. Commit và bật GitHub Pages cho branch hiện tại trong phần **Settings > Pages** của repository.
+
+Ví dụ:
+
+```js
+window.SBVFAQ_CONFIG = {
+  APPS_SCRIPT_WEB_APP_URL: "https://script.google.com/macros/s/AKfycb.../exec",
+  REQUEST_TIMEOUT_MS: 45000,
+};
+```
+
+## Cách hoạt động
+
+1. Người dùng nhập câu hỏi trên GitHub Pages.
+2. Giao diện gọi Apps Script bằng JSONP để tránh vấn đề CORS thường gặp với Apps Script Web App.
+3. Apps Script đọc sheet `FAQ`, lọc các dòng hiệu lực và xếp hạng theo từ khóa.
+4. Apps Script gửi các mục FAQ liên quan nhất tới AI API để tạo câu trả lời có kiểm soát theo dữ liệu.
+5. Apps Script ghi thời gian, câu hỏi và câu trả lời vào sheet `Log`.
+6. Giao diện hiển thị câu trả lời cho người dùng.
+
+## Chạy thử cục bộ
+
+Do đây là site tĩnh, có thể mở trực tiếp `index.html` hoặc chạy server tĩnh:
+
+```bash
+python3 -m http.server 8000
+```
+
+Sau đó truy cập <http://localhost:8000>.
 
EOF
)
