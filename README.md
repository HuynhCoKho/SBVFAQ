# Chatbot AI tra cứu quy định quản lý ngoại hối

Mô hình hiện tại:

- GitHub Pages: giao diện public cho người dùng nhập câu hỏi.
- Apps Script Web App: backend trung gian, đọc Google Sheet, gọi OpenAI API, ghi log.
- Google Sheet: sheet `FAQ`, `VANBAN`, `LOG`, tùy chọn thêm `LINKS`.
- OpenAI API: hiểu câu hỏi, chọn dữ liệu phù hợp và soạn câu trả lời có nguồn.

## 1. Luồng hoạt động

1. Người dùng hỏi trên GitHub Pages.
2. `script.js` gửi câu hỏi sang Apps Script bằng JSONP.
3. Apps Script đọc dữ liệu từ `FAQ` và `VANBAN`.
4. Backend lọc các dòng liên quan nhất trước khi gửi cho OpenAI.
5. OpenAI trả lời bằng tiếng Việt, ưu tiên FAQ, có trích nguồn.
6. Apps Script ghi câu hỏi/câu trả lời vào sheet `LOG`.

## 2. Cấu hình Apps Script

1. Mở Apps Script gắn với Google Sheet.
2. Dán nội dung file `apps-script/Code.gs`.
3. Vào `Project Settings > Script properties`, thêm:
   - `OPENAI_API_KEY`: API key OpenAI.
   - `OPENAI_MODEL`: tùy chọn, mặc định là `gpt-4o-mini`.
4. Bấm `Save`.
5. Vào `Deploy > Manage deployments > Edit > New version > Deploy`.
6. Web App nên đặt:
   - `Execute as`: `Me`.
   - `Who has access`: `Anyone`.

Lưu ý: mỗi lần sửa `Code.gs`, nếu chỉ bấm `Save` thì URL `/exec` có thể vẫn chạy code cũ. Phải deploy `New version`.

## 3. Cấu hình GitHub Pages

File `config.js` chứa URL Apps Script:

```js
APPS_SCRIPT_WEB_APP_URL: 'https://script.google.com/macros/s/.../exec'
```

Nếu sheet `LINKS` chưa có, panel trái dùng danh sách cố định trong `config.js`.

Nếu sheet `LINKS` có dữ liệu, giao diện sẽ tự lấy danh sách chủ đề/tool từ Apps Script và ghi đè danh sách cố định.

## 4. Cấu trúc Google Sheet

Sheet `FAQ`:

- `ID`
- `GROUP`
- `QUESTION`
- `ANSWER`
- `SOURCE`
- `KEYWORDS`
- `STATUS`

Sheet `VANBAN`:

- `SỐ VĂN BẢN`
- `TÊN VĂN BẢN`
- `ĐIỂM`
- `KHOẢN`
- `ĐIỀU`
- `NỘI DUNG`
- `HIỆU LỰC`

Sheet `LOG`:

- `NGÀY GIỜ`
- `NGƯỜI HỎI`
- `CÂU HỎI`
- `CÂU TRẢ LỜI`
- `NGUỒN`
- `TRÌNH DUYỆT`

Sheet `LINKS` là tùy chọn, để chủ động thêm link panel trái từ Google Sheet:

- `TYPE`: nhập `topic` cho chủ đề hoặc `tool` cho công cụ.
- `TITLE`: tên hiển thị.
- `URL`: đường link.
- `STATUS`: để trống hoặc nhập `Hiệu lực`.

Ví dụ:

| TYPE | TITLE | URL | STATUS |
| --- | --- | --- | --- |
| topic | Vay trả nợ nước ngoài | https://notebooklm.google.com/notebook/... | Hiệu lực |
| tool | Từ điển cá nhân | https://huynhcokho.github.io/Tudiencanhan/ | Hiệu lực |

## 5. Các nâng cấp đã có

- Ưu tiên FAQ trước, chỉ dùng VANBAN khi cần bổ sung hoặc FAQ chưa đủ.
- Lọc dữ liệu liên quan trước khi gửi OpenAI để câu trả lời tập trung hơn.
- Cache dữ liệu Sheet trong vài phút để phản hồi nhanh hơn.
- Giữ hyperlink ẩn trong Google Sheet và trả về dạng link bấm được.
- Trích nguồn theo cột `SOURCE` hoặc nguồn ghép từ `VANBAN`.
- Panel trái và vùng chat có thanh cuộn riêng trong một màn hình.
- Có thể quản lý link chủ đề/tool bằng sheet `LINKS` thay vì sửa code.

## 6. Test nhanh

Mở GitHub Pages:

```text
https://huynhcokho.github.io/SBVFAQ/
```

Test Apps Script trực tiếp:

```text
https://script.google.com/macros/s/.../exec?question=Cá nhân cư trú được cho vay ra nước ngoài không?
```

Nếu Apps Script trả lỗi quyền `SpreadsheetApp.openById`, hãy chạy hàm `setupAuthorization()` trong Apps Script editor rồi deploy lại.
