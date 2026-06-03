
+# SBVFAQ - Chat bot AI tra cứu Google Sheet FAQ
+
+Ứng dụng mẫu kết hợp:
+
+- **GitHub Pages**: giao diện chat tĩnh cho người dùng.
+- **Google Apps Script**: backend trung gian đọc Google Sheet, gọi AI API và ghi log.
+- **Google Sheet**: dữ liệu FAQ tại sheet `FAQ`, lịch sử hỏi đáp tại sheet `Log`.
+- **AI API**: tổng hợp câu trả lời dựa trên các dòng FAQ liên quan.

+## Cách hoạt động
+
+1. Người dùng nhập câu hỏi trên GitHub Pages.
+2. Giao diện gọi Apps Script bằng JSONP để tránh vấn đề CORS thường gặp với Apps Script Web App.
+3. Apps Script đọc sheet `FAQ`, lọc các dòng hiệu lực và xếp hạng theo từ khóa.
+4. Apps Script gửi các mục FAQ liên quan nhất tới AI API để tạo câu trả lời có kiểm soát theo dữ liệu.
+5. Apps Script ghi thời gian, câu hỏi và câu trả lời vào sheet `Log`.
+6. Giao diện hiển thị câu trả lời cho người dùng.
