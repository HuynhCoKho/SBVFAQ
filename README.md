# SBVFAQ - Chat bot AI tra cứu Google Sheet FAQ

Ứng dụng mẫu kết hợp:

- **GitHub Pages**: giao diện chat tĩnh cho người dùng.
- **Google Apps Script**: backend trung gian đọc Google Sheet, gọi AI API và ghi log.
- **Google Sheet**: dữ liệu FAQ tại sheet `FAQ`, lịch sử hỏi đáp tại sheet `Log`.
- **AI API**: tổng hợp câu trả lời dựa trên các dòng FAQ liên quan.



## Cấu trúc sheet

### Sheet `FAQ`

Hàng tiêu đề cần có các cột:

| ID | GROUP | QUESTION | ANSWER | SOURCE | KEYWORDS | STATUS |
| --- | --- | --- | --- | --- | --- | --- |

Ứng dụng chỉ ưu tiên các dòng có `STATUS` trống hoặc chứa `Hiệu lực`.

### Sheet `Log`

Apps Script tự tạo sheet `Log` nếu chưa có và ghi các cột:

| NGÀY GIỜ | CÂU HỎI | CÂU TRẢ LỜI |
| --- | --- | --- |

