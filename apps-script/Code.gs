var SPREADSHEET_ID = '1FInDbuWzXhh6vJ-EqaYxA5aIxZ19pVrrG_lS0imOhY4';
var FAQ_SHEET_NAME = 'FAQ';
var VANBAN_SHEET_NAME = 'VANBAN';
var LOG_SHEET_NAME = 'LOG';
var LINKS_SHEET_NAME = 'LINKS';
var CACHE_TTL_SECONDS = 300;

function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = String(params.action || '').trim().toLowerCase();
  var question = String(params.question || '').trim();
  var callback = String(params.callback || '').trim();

  if (action === 'links') {
    try {
      return output_(callback, { ok: true, links: loadLinks_() });
    } catch (err) {
      return output_(callback, { ok: false, error: errorMessage_(err) });
    }
  }

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

    return output_(callback, { ok: true, question: question, answer: answer });
  } catch (err) {
    var message = errorMessage_(err);
    appendLog_(question, 'ERROR: ' + message, {
      asker: 'API/GitHub Pages',
      source: callback ? 'JSONP' : 'Direct API'
    });

    return output_(callback, { ok: false, error: message });
  }
}

function askFromUi(question, clientInfo) {
  question = String(question || '').trim();
  clientInfo = clientInfo || {};

  if (!question) return { ok: false, error: 'Vui lòng nhập câu hỏi.' };

  try {
    var data = loadKnowledge_();
    var answer = askAi_(question, data);

    appendLog_(question, answer, {
      asker: clientInfo.asker || 'Ẩn danh',
      source: 'Apps Script Web App',
      userAgent: clientInfo.userAgent || ''
    });

    return { ok: true, question: question, answer: answer };
  } catch (err) {
    var message = errorMessage_(err);
    appendLog_(question, 'ERROR: ' + message, {
      asker: clientInfo.asker || 'Ẩn danh',
      source: 'Apps Script Web App',
      userAgent: clientInfo.userAgent || ''
    });

    return { ok: false, error: message };
  }
}

function loadKnowledge_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('knowledge-v4');
  if (cached) return JSON.parse(cached);

  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var faqRows = readSheetObjects_(spreadsheet, FAQ_SHEET_NAME);
  var vanbanRows = readSheetObjects_(spreadsheet, VANBAN_SHEET_NAME);
  var data = {
    faq: faqRows.filter(function (row) {
      return isActive_(row.STATUS || row['HIỆU LỰC'] || row['HIEU LUC']);
    }),
    vanban: vanbanRows.filter(function (row) {
      return isActive_(row['HIỆU LỰC'] || row['HIEU LUC'] || row.STATUS);
    })
  };

  safeCachePut_(cache, 'knowledge-v4', data);
  return data;
}

function loadLinks_() {
  var fallback = { topics: [], tools: [] };
  var cache = CacheService.getScriptCache();
  var cached = cache.get('links-v1');
  if (cached) return JSON.parse(cached);

  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(LINKS_SHEET_NAME);
  if (!sheet) return fallback;

  var rows = readSheetObjects_(spreadsheet, LINKS_SHEET_NAME);
  var links = rows
    .filter(function (row) {
      return isActive_(pick_(row, ['STATUS', 'HIỆU LỰC', 'HIEU LUC']));
    })
    .map(function (row) {
      return {
        type: normalizeText_(pick_(row, ['TYPE', 'LOẠI', 'LOAI'])),
        title: pick_(row, ['TITLE', 'TÊN', 'TEN', 'CHỦ ĐỀ', 'CHU DE']),
        url: pick_(row, ['URL', 'LINK'])
      };
    })
    .filter(function (item) {
      return item.title && /^https?:\/\//i.test(item.url);
    });

  var result = {
    topics: links.filter(function (item) {
      return item.type === 'topic' || item.type === 'chu de' || item.type === 'notebook';
    }).map(publicLink_),
    tools: links.filter(function (item) {
      return item.type === 'tool' || item.type === 'cong cu';
    }).map(publicLink_)
  };

  safeCachePut_(cache, 'links-v1', result);
  return result;
}

function readSheetObjects_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet ' + sheetName);

  var range = sheet.getDataRange();
  var values = range.getDisplayValues();
  var richTextValues = range.getRichTextValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (header) {
    return String(header || '').trim();
  });

  return values
    .map(function (row, rowIndex) {
      return { row: row, richTextRow: richTextValues[rowIndex] };
    })
    .slice(1)
    .filter(function (entry) {
      return entry.row.some(function (cell) { return String(cell || '').trim(); });
    })
    .map(function (entry) {
      var item = {};
      headers.forEach(function (header, index) {
        if (header) item[header] = formatCellValue_(entry.row[index], entry.richTextRow[index]);
      });
      return item;
    });
}

function askAi_(question, data) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('Chưa cấu hình OPENAI_API_KEY trong Apps Script > Project Settings > Script properties.');

  var model = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-4o-mini';
  var relevantData = selectRelevantData_(question, data);
  var context = buildContext_(relevantData);
  var prompt =
    'Bạn là chatbot tra cứu quy định NHNN. Chỉ trả lời dựa trên dữ liệu FAQ và VANBAN được cung cấp. ' +
    'Ưu tiên dữ liệu FAQ trước. Nếu FAQ đã có câu trả lời phù hợp, trả lời chủ yếu theo FAQ và chỉ dùng VANBAN để bổ sung căn cứ khi cần. ' +
    'Chỉ dùng VANBAN làm nguồn chính khi FAQ không có thông tin đủ phù hợp. ' +
    'Nếu dữ liệu chưa đủ để kết luận, hãy nói rõ là chưa đủ thông tin trong bảng dữ liệu. ' +
    'Trả lời bằng tiếng Việt có dấu, ngắn gọn, có căn cứ nguồn nếu có. ' +
    'Nếu câu trả lời trong dữ liệu có link dạng [tên link](URL) hoặc URL thì phải giữ nguyên link đó trong câu trả lời. ' +
    'Không được chỉ nói chung chung là "truy cập đường link" khi dữ liệu đã có URL cụ thể. ' +
    'Cuối câu trả lời luôn có dòng "Nguồn: ...". ' +
    'Nếu mục dữ liệu có "NGUỒN TRÍCH DẪN" thì dùng đúng nội dung đó làm nguồn, không dùng mã FAQ #... thay cho nguồn. ' +
    'Nếu có nhiều nguồn phù hợp, ngăn cách bằng dấu chấm phẩy.\n\n' +
    'DỮ LIỆU FAQ/VANBAN:\n' + context + '\n\n' +
    'CÂU HỎI NGƯỜI DÙNG:\n' + question;

  var response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model: model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Bạn trả lời như một trợ lý pháp lý nội bộ, không suy diễn ngoài dữ liệu.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  var status = response.getResponseCode();
  var body = response.getContentText();
  var json = JSON.parse(body);
  if (status < 200 || status >= 300) throw new Error((json.error && json.error.message) || ('OpenAI API lỗi HTTP ' + status));

  return json.choices[0].message.content.trim();
}

function selectRelevantData_(question, data) {
  var faqRanked = rankRows_(question, data.faq, ['QUESTION', 'ANSWER', 'KEYWORDS', 'GROUP', 'SOURCE']);
  var vanbanRanked = rankRows_(question, data.vanban, ['NỘI DUNG', 'NOI DUNG', 'TÊN VĂN BẢN', 'TEN VAN BAN', 'SỐ VĂN BẢN', 'SO VAN BAN']);
  var faqMatches = faqRanked.filter(function (item) { return item.score > 0; });
  var vanbanMatches = vanbanRanked.filter(function (item) { return item.score > 0; });

  return {
    faq: (faqMatches.length ? faqMatches : faqRanked).slice(0, 8).map(function (item) { return item.row; }),
    vanban: (vanbanMatches.length ? vanbanMatches : vanbanRanked).slice(0, 12).map(function (item) { return item.row; })
  };
}

function rankRows_(question, rows, keys) {
  var normalizedQuestion = normalizeText_(question);
  var tokens = normalizedQuestion.split(' ').filter(function (token) { return token.length >= 2; });

  return rows.map(function (row, index) {
    var haystack = normalizeText_(keys.map(function (key) { return row[key] || ''; }).join(' '));
    var score = normalizedQuestion && haystack.indexOf(normalizedQuestion) >= 0 ? 30 : 0;
    tokens.forEach(function (token) {
      if (haystack.indexOf(token) >= 0) score += token.length > 3 ? 2 : 1;
    });
    return { row: row, score: score, index: index };
  }).sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
}

function buildContext_(data) {
  var faqText = data.faq.map(function (row, index) {
    return [
      'MÃ THAM CHIẾU: FAQ #' + (index + 1),
      'GROUP: ' + pick_(row, ['GROUP']),
      'QUESTION: ' + pick_(row, ['QUESTION']),
      'ANSWER: ' + pick_(row, ['ANSWER']),
      'NGUỒN TRÍCH DẪN: ' + pick_(row, ['SOURCE', 'NGUỒN', 'NGUON']),
      'KEYWORDS: ' + pick_(row, ['KEYWORDS'])
    ].join('\n');
  }).join('\n---\n');

  var vanbanText = data.vanban.map(function (row, index) {
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

function appendLog_(question, answer, meta) {
  try {
    meta = meta || {};
    var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME) || spreadsheet.insertSheet(LOG_SHEET_NAME);
    ensureLogHeader_(sheet);
    sheet.appendRow([new Date(), meta.asker || 'Ẩn danh', question, answer, meta.source || '', meta.userAgent || '']);
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
  var needsHeader = headers.some(function (header, index) { return currentHeaders[index] !== header; });
  if (needsHeader) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function ensureLinksHeader_(sheet) {
  var headers = ['TYPE', 'TITLE', 'URL', 'STATUS'];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return;
  }

  var currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  var needsHeader = headers.some(function (header, index) { return currentHeaders[index] !== header; });
  if (needsHeader) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function setupAuthorization() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var logSheet = spreadsheet.getSheetByName(LOG_SHEET_NAME) || spreadsheet.insertSheet(LOG_SHEET_NAME);
  var linksSheet = spreadsheet.getSheetByName(LINKS_SHEET_NAME) || spreadsheet.insertSheet(LINKS_SHEET_NAME);
  ensureLogHeader_(logSheet);
  ensureLinksHeader_(linksSheet);
  loadKnowledge_();
  loadLinks_();
  return 'Đã cấp quyền và kết nối được Google Sheet.';
}

function renderChatUi_() {
  var html = '<!doctype html><html lang="vi"><head><base target="_top"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hỏi đáp quy định NHNN</title></head><body style="font-family:Arial,sans-serif;margin:24px;max-width:760px"><h1>Hỏi đáp quy định NHNN</h1><p>Giao diện chính đang public tại GitHub Pages. Trang Apps Script này vẫn có thể test nhanh backend.</p><form id="form"><textarea id="question" rows="4" style="width:100%;box-sizing:border-box" placeholder="Nhập câu hỏi"></textarea><button type="submit" style="margin-top:12px">Gửi câu hỏi</button></form><pre id="answer" style="white-space:pre-wrap;line-height:1.5"></pre><script>document.getElementById("form").addEventListener("submit",function(e){e.preventDefault();var q=document.getElementById("question").value.trim();var a=document.getElementById("answer");if(!q)return;a.textContent="Đang xử lý...";google.script.run.withSuccessHandler(function(p){a.textContent=p&&p.ok?p.answer:(p&&p.error)||"Có lỗi."}).withFailureHandler(function(err){a.textContent=err.message||String(err)}).askFromUi(q,{asker:"Ẩn danh",userAgent:navigator.userAgent})});</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Hỏi đáp quy định NHNN').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function output_(callback, payload) {
  if (callback) {
    var safeCallback = callback.replace(/[^\w.$]/g, '');
    return ContentService.createTextOutput(safeCallback + '(' + JSON.stringify(payload) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function isActive_(value) {
  var text = String(value || '').trim().toLowerCase();
  return !text || text === 'hiệu lực' || text === 'hieu luc' || text === 'active';
}

function pick_(row, keys) {
  for (var i = 0; i < keys.length; i += 1) {
    if (row[keys[i]]) return row[keys[i]];
  }
  return '';
}

function publicLink_(item) {
  return { title: item.title, url: item.url };
}

function safeCachePut_(cache, key, value) {
  try {
    cache.put(key, JSON.stringify(value), CACHE_TTL_SECONDS);
  } catch (err) {
    // Dữ liệu lớn vẫn dùng được, chỉ bỏ qua cache.
  }
}

function normalizeText_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatCellValue_(displayValue, richTextValue) {
  var text = String(displayValue || '').trim();
  if (!richTextValue) return text;

  var cellUrl = richTextValue.getLinkUrl && richTextValue.getLinkUrl();
  if (cellUrl && text && text.indexOf(cellUrl) === -1) return '[' + text + '](' + cellUrl + ')';

  var runs = richTextValue.getRuns ? richTextValue.getRuns() : [];
  if (!runs || !runs.length) return text;

  var linkedParts = [];
  runs.forEach(function (run) {
    var runText = String(run.getText() || '').trim();
    var url = run.getLinkUrl && run.getLinkUrl();
    if (runText && url && text.indexOf(url) === -1) linkedParts.push('[' + runText + '](' + url + ')');
  });

  if (!linkedParts.length) return text;

  var result = text;
  linkedParts.forEach(function (linkedPart) {
    if (result.indexOf(linkedPart) === -1) result += ' ' + linkedPart;
  });
  return result.trim();
}

function formatPart_(label, value) {
  value = String(value || '').trim();
  return value ? label + ' ' + value : '';
}

function errorMessage_(err) {
  return err && err.message ? err.message : String(err);
}
