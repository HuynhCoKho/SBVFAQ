var SPREADSHEET_ID = '1FInDbuWzXhh6vJ-EqaYxA5aIxZ19pVrrG_lS0imOhY4';
var FAQ_SHEET_NAME = 'FAQ';
var VANBAN_SHEET_NAME = 'VANBAN';
var LOG_SHEET_NAME = 'LOG';

function doGet(e) {
  var params = (e && e.parameter) || {};
  var question = String(params.question || '').trim();
  var callback = String(params.callback || '').trim();

  if (!question) {
    if (!callback) return renderChatUi_();

    return output_(callback, {
      ok: false,
      error: 'Thiếu tham số question. Giao diện GitHub Pages sẽ gửi lên dạng ?question=...&callback=...'
    });
  }

  try {
    var data = loadKnowledge_();
    var answer = askAi_(question, data);

    appendLog_(question, answer, {
      asker: 'API/GitHub Pages',
      source: callback ? 'JSONP' : 'Direct API'
    });

    return output_(callback, {
      ok: true,
      question: question,
      answer: answer
    });
  } catch (err) {
    var message = err && err.message ? err.message : String(err);

    appendLog_(question, 'ERROR: ' + message, {
      asker: 'API/GitHub Pages',
      source: callback ? 'JSONP' : 'Direct API'
    });

    return output_(callback, {
      ok: false,
      error: message
    });
  }
}

function askFromUi(question, clientInfo) {
  question = String(question || '').trim();
  clientInfo = clientInfo || {};

  if (!question) {
    return {
      ok: false,
      error: 'Vui lòng nhập câu hỏi.'
    };
  }

  try {
    var data = loadKnowledge_();
    var answer = askAi_(question, data);

    appendLog_(question, answer, {
      asker: clientInfo.asker || 'Ẩn danh',
      source: 'Apps Script Web App',
      userAgent: clientInfo.userAgent || ''
    });

    return {
      ok: true,
      question: question,
      answer: answer
    };
  } catch (err) {
    var message = err && err.message ? err.message : String(err);

    appendLog_(question, 'ERROR: ' + message, {
      asker: clientInfo.asker || 'Ẩn danh',
      source: 'Apps Script Web App',
      userAgent: clientInfo.userAgent || ''
    });

    return {
      ok: false,
      error: message
    };
  }
}

function loadKnowledge_() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var faqRows = readSheetObjects_(spreadsheet, FAQ_SHEET_NAME);
  var vanbanRows = readSheetObjects_(spreadsheet, VANBAN_SHEET_NAME);

  return {
    faq: faqRows.filter(function (row) {
      return isActive_(row.STATUS || row['HIỆU LỰC'] || row['HIEU LUC']);
    }),
    vanban: vanbanRows.filter(function (row) {
      return isActive_(row['HIỆU LỰC'] || row['HIEU LUC'] || row.STATUS);
    })
  };
}

function readSheetObjects_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet ' + sheetName);

  var values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (header) {
    return String(header || '').trim();
  });

  return values.slice(1)
    .filter(function (row) {
      return row.some(function (cell) {
        return String(cell || '').trim();
      });
    })
    .map(function (row) {
      var item = {};
      headers.forEach(function (header, index) {
        if (header) item[header] = String(row[index] || '').trim();
      });
      return item;
    });
}

function isActive_(value) {
  var text = String(value || '').trim().toLowerCase();
  return !text || text === 'hiệu lực' || text === 'hieu luc' || text === 'active';
}

function askAi_(question, data) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('Chưa cấu hình OPENAI_API_KEY trong Apps Script > Project Settings > Script properties.');
  }

  var model = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-4o-mini';
  var context = buildContext_(data);
  var prompt =
    'Bạn là chatbot tra cứu quy định NHNN. Chỉ trả lời dựa trên dữ liệu FAQ và VANBAN được cung cấp. ' +
    'Nếu dữ liệu chưa đủ để kết luận, hãy nói rõ là chưa đủ thông tin trong bảng dữ liệu. ' +
    'Trả lời bằng tiếng Việt có dấu, ngắn gọn, có căn cứ nguồn nếu có. ' +
    'Cuối câu trả lời luôn có dòng "Nguồn: ...". ' +
    'Nếu mục dữ liệu có "NGUỒN TRÍCH DẪN" thì dùng đúng nội dung đó làm nguồn, không dùng mã FAQ #... thay cho nguồn. ' +
    'Nếu có nhiều nguồn phù hợp, ngăn cách bằng dấu chấm phẩy.\n\n' +
    'DỮ LIỆU FAQ/VANBAN:\n' + context + '\n\n' +
    'CÂU HỎI NGƯỜI DÙNG:\n' + question;

  var response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model: model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'Bạn trả lời như một trợ lý pháp lý nội bộ, không suy diễn ngoài dữ liệu.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  var status = response.getResponseCode();
  var body = response.getContentText();
  var json = JSON.parse(body);

  if (status < 200 || status >= 300) {
    throw new Error((json.error && json.error.message) || ('OpenAI API lỗi HTTP ' + status));
  }

  return json.choices[0].message.content.trim();
}

function buildContext_(data) {
  var faqText = data.faq.slice(0, 80).map(function (row, index) {
    var source = pick_(row, ['SOURCE', 'NGUỒN', 'NGUON']);

    return [
      'MÃ THAM CHIẾU: FAQ #' + (index + 1),
      'GROUP: ' + pick_(row, ['GROUP']),
      'QUESTION: ' + pick_(row, ['QUESTION']),
      'ANSWER: ' + pick_(row, ['ANSWER']),
      'NGUỒN TRÍCH DẪN: ' + source,
      'KEYWORDS: ' + pick_(row, ['KEYWORDS'])
    ].join('\n');
  }).join('\n---\n');

  var vanbanText = data.vanban.slice(0, 120).map(function (row, index) {
    var soVanBan = pick_(row, ['SỐ VĂN BẢN', 'SO VAN BAN']);
    var tenVanBan = pick_(row, ['TÊN VĂN BẢN', 'TEN VAN BAN']);
    var diemKhoanDieu = [
      formatPart_('Điểm', pick_(row, ['ĐIỂM', 'DIEM'])),
      formatPart_('Khoản', pick_(row, ['KHOẢN', 'KHOAN'])),
      formatPart_('Điều', pick_(row, ['ĐIỀU', 'DIEU']))
    ].filter(Boolean).join(', ');
    var citation = [diemKhoanDieu, soVanBan, tenVanBan].filter(Boolean).join(' - ');

    return [
      'MÃ THAM CHIẾU: VANBAN #' + (index + 1),
      'SO VAN BAN: ' + soVanBan,
      'TEN VAN BAN: ' + tenVanBan,
      'DIEM/KHOAN/DIEU: ' + diemKhoanDieu,
      'NGUỒN TRÍCH DẪN: ' + citation,
      'NOI DUNG: ' + pick_(row, ['NỘI DUNG', 'NOI DUNG'])
    ].join('\n');
  }).join('\n---\n');

  return 'FAQ:\n' + faqText + '\n\nVANBAN:\n' + vanbanText;
}

function pick_(row, keys) {
  for (var i = 0; i < keys.length; i += 1) {
    if (row[keys[i]]) return row[keys[i]];
  }
  return '';
}

function formatPart_(label, value) {
  value = String(value || '').trim();
  return value ? label + ' ' + value : '';
}

function appendLog_(question, answer, meta) {
  try {
    meta = meta || {};
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME) || spreadsheet.insertSheet(LOG_SHEET_NAME);

    ensureLogHeader_(sheet);

    sheet.appendRow([
      new Date(),
      meta.asker || 'Ẩn danh',
      question,
      answer,
      meta.source || '',
      meta.userAgent || ''
    ]);
  } catch (err) {
    // Không chặn câu trả lời nếu bước ghi log gặp lỗi.
  }
}

function ensureLogHeader_(sheet) {
  var headers = ['NGÀY GIỜ', 'NGƯỜI HỎI', 'CÂU HỎI', 'CÂU TRẢ LỜI', 'NGUỒN', 'TRÌNH DUYỆT'];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }

  var currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  var needsHeader = headers.some(function (header, index) {
    return currentHeaders[index] !== header;
  });

  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function setupAuthorization() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var logSheet = spreadsheet.getSheetByName(LOG_SHEET_NAME) || spreadsheet.insertSheet(LOG_SHEET_NAME);
  ensureLogHeader_(logSheet);

  return 'Đã cấp quyền và kết nối được Google Sheet.';
}

function renderChatUi_() {
  var html = '<!doctype html>' +
    '<html lang="vi"><head><base target="_top"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Hỏi đáp quy định NHNN</title>' +
    '<style>body{margin:0;background:#f4f7f6;color:#17202a;font-family:Arial,Helvetica,sans-serif}' +
    '.shell{width:min(920px,calc(100% - 24px));min-height:100vh;margin:0 auto;padding:18px 0}' +
    '.chat{display:grid;grid-template-rows:auto 1fr auto;min-height:calc(100vh - 36px);background:#fff;border:1px solid #d9e2e7;border-radius:8px;overflow:hidden}' +
    'header{display:flex;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #d9e2e7}.eyebrow{margin:0 0 4px;color:#0f766e;font-size:13px;font-weight:700;text-transform:uppercase}' +
    'h1{margin:0;font-size:24px}.status{padding:7px 10px;border:1px solid #9bd6cf;border-radius:999px;color:#115e59;font-size:13px;font-weight:700}.status.error{border-color:#f2a9a1;color:#b42318}' +
    '.messages{display:flex;flex-direction:column;gap:14px;overflow-y:auto;padding:20px}.message{display:flex;gap:10px;max-width:86%}.message.user{align-self:flex-end;flex-direction:row-reverse}' +
    '.avatar{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:50%;background:#e6f4f1;color:#115e59;font-size:12px;font-weight:700}.message.user .avatar{background:#eef2f6;color:#344054}' +
    '.bubble{padding:12px 14px;border:1px solid #d9e2e7;border-radius:8px;background:#fff;line-height:1.55;white-space:pre-wrap}.message.user .bubble{border-color:#c9e4dd;background:#edf8f5}.bubble a{color:#115e59;font-weight:700;text-decoration:underline;word-break:break-word}' +
    'form{display:grid;gap:12px;padding:16px;border-top:1px solid #d9e2e7;background:#fbfcfd}textarea{width:100%;min-height:72px;resize:vertical;border:1px solid #d9e2e7;border-radius:8px;padding:12px;font:inherit;box-sizing:border-box}' +
    'button{width:100%;min-height:44px;border:0;border-radius:8px;background:#0f766e;color:#fff;cursor:pointer;font:inherit;font-weight:700}@media(max-width:720px){.message{max-width:100%}}</style></head>' +
    '<body><main class="shell"><section class="chat"><header><div><p class="eyebrow">Chatbot AI tra cứu</p><h1>Hỏi đáp quy định NHNN</h1></div><span id="status" class="status">Sẵn sàng</span></header>' +
    '<div id="messages" class="messages"><article class="message bot"><div class="avatar">AI</div><div class="bubble">Bạn nhập câu hỏi, hệ thống sẽ đọc dữ liệu FAQ/VANBAN trong Google Sheet và trả lời bằng AI.</div></article></div>' +
    '<form id="form"><textarea id="question" rows="3" placeholder="Ví dụ: Cá nhân cư trú được cho vay ra nước ngoài không?" required></textarea><button id="send" type="submit">Gửi câu hỏi</button></form></section></main>' +
    '<script>var form=document.getElementById("form"),input=document.getElementById("question"),send=document.getElementById("send"),messages=document.getElementById("messages"),statusEl=document.getElementById("status");' +
    'function setStatus(t,e){statusEl.textContent=t;statusEl.className=e?"status error":"status"}' +
    'function addLinkedText(c,t){var p=/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)|(https?:\\/\\/[^\\s<]+)/g,l=0,m;while((m=p.exec(t))!==null){if(m.index>l)c.appendChild(document.createTextNode(t.slice(l,m.index)));var label=m[1]||m[3],url=m[2]||m[3],clean=url.replace(/[).,;]+$/,"");var a=document.createElement("a");a.href=clean;a.textContent=label;a.target="_blank";a.rel="noopener noreferrer";c.appendChild(a);if(url.slice(clean.length))c.appendChild(document.createTextNode(url.slice(clean.length)));l=p.lastIndex}if(l<t.length)c.appendChild(document.createTextNode(t.slice(l)))}' +
    'function addMessage(r,t){var a=document.createElement("article");a.className="message "+r;var v=document.createElement("div");v.className="avatar";v.textContent=r==="user"?"Bạn":"AI";var b=document.createElement("div");b.className="bubble";if(r==="bot")addLinkedText(b,t);else b.textContent=t;a.appendChild(v);a.appendChild(b);messages.appendChild(a);messages.scrollTop=messages.scrollHeight}' +
    'function busy(x){input.disabled=x;send.disabled=x;send.textContent=x?"Đang hỏi...":"Gửi câu hỏi"}' +
    'form.addEventListener("submit",function(e){e.preventDefault();var q=input.value.trim();if(!q)return;addMessage("user",q);input.value="";busy(true);setStatus("Đang xử lý",false);google.script.run.withSuccessHandler(function(p){if(p&&p.ok){addMessage("bot",p.answer||"Không có câu trả lời.");setStatus("Sẵn sàng",false)}else{addMessage("bot",p&&p.error||"Có lỗi khi xử lý câu hỏi.");setStatus("Cần kiểm tra",true)}busy(false);input.focus()}).withFailureHandler(function(err){addMessage("bot",err.message||String(err));setStatus("Cần kiểm tra",true);busy(false);input.focus()}).askFromUi(q,{asker:"Ẩn danh",userAgent:navigator.userAgent})});' +
    'input.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});</script></body></html>';

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('Hỏi đáp quy định NHNN')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function output_(callback, payload) {
  if (callback) {
    var safeCallback = callback.replace(/[^\w.$]/g, '');
    return ContentService
      .createTextOutput(safeCallback + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
