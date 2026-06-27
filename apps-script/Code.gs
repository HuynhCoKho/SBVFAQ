var SPREADSHEET_ID = '1FInDbuWzXhh6vJ-EqaYxA5aIxZ19pVrrG_lS0imOhY4';
var FAQ_SHEET_NAME = 'FAQ';
var VANBAN_SHEET_NAME = 'VANBAN';
var LOG_SHEET_NAME = 'LOG';
var LINKS_SHEET_NAME = 'LINKS';
var CACHE_TTL_SECONDS = 300;
var KNOWLEDGE_CACHE_KEY = 'knowledge-v11';
var DIRECT_FAQ_MIN_SCORE = 36;
var DIRECT_FAQ_STRONG_SCORE = 48;
var MIN_AI_CONTEXT_SCORE = 28;
var NO_DATA_ANSWER = 'Mình chưa tìm thấy dữ liệu đủ tin cậy trong FAQ/VANBAN hiện có để trả lời câu hỏi này. Bạn có thể tra cứu văn bản quy định theo chủ đề tại panel bên trái.';

function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = String(params.action || '').trim().toLowerCase();
  var question = String(params.question || '').trim();
  var callback = String(params.callback || '').trim();
  var history = parseHistory_(params.history);

  if (action === 'links') {
    try {
      return output_(callback, { ok: true, links: loadLinks_() });
    } catch (err) {
      return output_(callback, { ok: false, error: errorMessage_(err) });
    }
  }

  if (!question) {
    if (!callback) return renderChatUi_();
    return output_(callback, { ok: false, error: 'Thiếu tham số question. Giao diện GitHub Pages sẽ gửi lên dạng ?question=...&callback=...' });
  }

  try {
    var data = loadKnowledge_();
    var answer = askAi_(question, data, history);
    appendLog_(question, answer, { asker: 'API/GitHub Pages', source: callback ? 'JSONP' : 'Direct API' });
    return output_(callback, { ok: true, question: question, answer: answer });
  } catch (err) {
    var message = errorMessage_(err);
    appendLog_(question, 'ERROR: ' + message, { asker: 'API/GitHub Pages', source: callback ? 'JSONP' : 'Direct API' });
    return output_(callback, { ok: false, error: message });
  }
}

function askFromUi(question, clientInfo) {
  question = String(question || '').trim();
  clientInfo = clientInfo || {};
  if (!question) return { ok: false, error: 'Vui lòng nhập câu hỏi.' };
  try {
    var data = loadKnowledge_();
    var answer = askAi_(question, data, parseHistory_(clientInfo.history));
    appendLog_(question, answer, { asker: clientInfo.asker || 'Ẩn danh', source: 'Apps Script Web App', userAgent: clientInfo.userAgent || '' });
    return { ok: true, question: question, answer: answer };
  } catch (err) {
    var message = errorMessage_(err);
    appendLog_(question, 'ERROR: ' + message, { asker: clientInfo.asker || 'Ẩn danh', source: 'Apps Script Web App', userAgent: clientInfo.userAgent || '' });
    return { ok: false, error: message };
  }
}

function loadKnowledge_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(KNOWLEDGE_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var data = {
    faq: readSheetObjects_(spreadsheet, FAQ_SHEET_NAME).filter(function (row) { return isActive_(row.STATUS || row['HIỆU LỰC'] || row['HIEU LUC']); }),
    vanban: readSheetObjects_(spreadsheet, VANBAN_SHEET_NAME).filter(function (row) { return isActive_(row['HIỆU LỰC'] || row['HIEU LUC'] || row.STATUS); })
  };
  safeCachePut_(cache, KNOWLEDGE_CACHE_KEY, data);
  return data;
}

function loadLinks_() {
  var fallback = { topics: [], tools: [] };
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(LINKS_SHEET_NAME);
  if (!sheet) return fallback;
  var rows = readSheetObjects_(spreadsheet, LINKS_SHEET_NAME);
  var links = rows.map(function (row) {
    return {
      type: normalizeText_(pick_(row, ['TYPE', 'LOẠI', 'LOAI'])),
      title: pick_(row, ['TITLE', 'TÊN', 'TEN', 'CHỦ ĐỀ', 'CHU DE']),
      url: pick_(row, ['URL', 'LINK']),
      status: pick_(row, ['STATUS', 'HIỆU LỰC', 'HIEU LUC'])
    };
  }).filter(function (item) {
    return isActive_(item.status) && item.title && /^https?:\/\//i.test(item.url);
  });
  return {
    topics: links.filter(function (item) { return item.type === 'topic' || item.type === 'chu de' || item.type === 'notebook'; }).map(publicLink_),
    tools: links.filter(function (item) { return item.type === 'tool' || item.type === 'cong cu'; }).map(publicLink_)
  };
}

function parseHistory_(value) {
  if (!value) return [];
  try {
    var parsed = Array.isArray(value) ? value : JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-5).map(function (turn) {
      return {
        question: compactText_(turn && turn.question, 260),
        answer: compactText_(turn && turn.answer, 520)
      };
    }).filter(function (turn) {
      return turn.question || turn.answer;
    });
  } catch (err) {
    return [];
  }
}

function buildLookupQuestion_(question, history) {
  question = String(question || '').trim();
  history = history || [];
  if (!history.length || !shouldUseHistoryForLookup_(question)) return question;
  var recent = history.slice(-3).map(function (turn) {
    return [turn.question, turn.answer].filter(Boolean).join(' ');
  }).join(' ');
  return (recent + ' ' + question).trim();
}

function shouldUseHistoryForLookup_(question) {
  var normalized = normalizeText_(question);
  if (!normalized) return false;
  var tokens = normalized.split(' ').filter(function (token) { return token.length >= 2; });
  var hasStrongTopic = /(vay tra no|vay nuoc ngoai|dai ly doi ngoai te|chi tra ngoai te|bao cao|dang ky khoan vay|dang ky thay doi|mo tai khoan|phat hanh trai phieu|dau tu truc tiep|dau tu gian tiep)/.test(normalized);
  var looksFollowUp = tokens.length <= 8 || /(truong hop nay|noi tren|vay thi|the thi|con|van de nay|thu tuc nay|ho so nay|thoi han|muc phat|che tai|can nop gi|gom nhung gi|nhu the nao|co phai khong|co can khong)/.test(normalized);
  return looksFollowUp && !hasStrongTopic;
}

function buildHistoryText_(history) {
  history = history || [];
  if (!history.length) return '(Không có lịch sử trước đó)';
  return history.slice(-5).map(function (turn, index) {
    return 'Lượt ' + (index + 1) + '\nNgười dùng: ' + (turn.question || '') + '\nAI: ' + (turn.answer || '');
  }).join('\n---\n');
}

function readSheetObjects_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet ' + sheetName);
  var range = sheet.getDataRange();
  var values = range.getDisplayValues();
  var richTextValues = range.getRichTextValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (header) { return String(header || '').trim(); });
  return values.slice(1).map(function (row, offset) {
    return { row: row, richTextRow: richTextValues[offset + 1] };
  }).filter(function (entry) {
    return entry.row.some(function (cell) { return String(cell || '').trim(); });
  }).map(function (entry) {
    var item = {};
    headers.forEach(function (header, index) {
      if (header) item[header] = formatCellValue_(entry.row[index], entry.richTextRow[index]);
    });
    return item;
  });
}

function askAi_(question, data, history) {
  var lookupQuestion = buildLookupQuestion_(question, history);
  var directAnswer = answerDirectlyFromFaq_(lookupQuestion, data.faq);
  if (directAnswer) return finalizeAnswer_(question, directAnswer);
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('Chưa cấu hình OPENAI_API_KEY trong Apps Script > Project Settings > Script properties.');
  var model = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-4o-mini';
  var relevantData = selectRelevantData_(lookupQuestion, data);
  if (!hasRelevantContext_(relevantData)) return NO_DATA_ANSWER;
  var context = buildContext_(relevantData);
  var historyText = buildHistoryText_(history);
  var prompt = 'Bạn là chatbot tra cứu quy định NHNN. Chỉ trả lời dựa trên dữ liệu FAQ và VANBAN được cung cấp. Ưu tiên FAQ trước. Nếu câu hỏi hiện tại là câu hỏi nối tiếp, hãy hiểu nó theo lịch sử cuộc trò chuyện; nếu câu hỏi hiện tại có chủ đề riêng rõ ràng thì ưu tiên câu hỏi hiện tại. Không được tự lấy kiến thức ngoài dữ liệu để bù vào chỗ thiếu. Phải phân biệt đăng ký khoản vay với đăng ký thay đổi khoản vay. Phải phân biệt nghĩa vụ báo cáo với thủ tục đăng ký/hồ sơ đăng ký khoản vay; nếu người dùng hỏi về báo cáo, nộp báo cáo, báo cáo quá hạn hoặc báo cáo trễ hạn thì không dùng nội dung về nộp hồ sơ đăng ký khoản vay làm câu trả lời chính, trừ khi dữ liệu đó cũng nói rõ về báo cáo. Riêng thông báo báo cáo bị ghi quá hạn do chuyển đổi dữ liệu sang Trang điện tử chỉ là ngoại lệ theo đúng kỳ/thời điểm được thông báo; không khái quát thành mọi báo cáo nộp trễ đều không sao. Nếu dữ liệu có link dạng [tên link](URL) hoặc URL thì giữ nguyên link. Cuối câu trả lời luôn có dòng Nguồn: ...\n\nLỊCH SỬ CUỘC TRÒ CHUYỆN GẦN ĐÂY:\n' + historyText + '\n\nDỮ LIỆU FAQ/VANBAN:\n' + context + '\n\nCÂU HỎI NGƯỜI DÙNG:\n' + question;
  var response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    muteHttpExceptions: true,
    payload: JSON.stringify({ model: model, temperature: 0.1, max_tokens: 700, messages: [{ role: 'system', content: 'Bạn trả lời như một trợ lý pháp lý nội bộ, không suy diễn ngoài dữ liệu.' }, { role: 'user', content: prompt }] })
  });
  var status = response.getResponseCode();
  var json = JSON.parse(response.getContentText());
  if (status < 200 || status >= 300) throw new Error((json.error && json.error.message) || ('OpenAI API lỗi HTTP ' + status));
  return finalizeAnswer_(question, json.choices[0].message.content.trim());
}

function answerDirectlyFromFaq_(question, faqRows) {
  var ranked = rankRows_(question, faqRows || [], ['QUESTION', 'ANSWER', 'KEYWORDS', 'GROUP', 'SOURCE']);
  if (!ranked.length || ranked[0].score < DIRECT_FAQ_MIN_SCORE) return '';
  var top = ranked[0];
  var second = ranked[1];
  var normalizedQuestion = normalizeText_(question);
  var normalizedTopQuestion = normalizeText_(pick_(top.row, ['QUESTION']));
  var topHaystack = normalizeText_([pick_(top.row, ['QUESTION']), pick_(top.row, ['KEYWORDS']), pick_(top.row, ['GROUP']), pick_(top.row, ['SOURCE'])].join(' '));
  var exactish = normalizedTopQuestion && (normalizedTopQuestion.indexOf(normalizedQuestion) >= 0 || normalizedQuestion.indexOf(normalizedTopQuestion) >= 0);
  var strongPhraseMatch = hasImportantPhraseMatch_(normalizedQuestion, topHaystack);
  var clearlyAhead = !second || top.score - second.score >= 8;
  if (!exactish && !strongPhraseMatch && !clearlyAhead && top.score < DIRECT_FAQ_STRONG_SCORE) return '';
  var answer = pick_(top.row, ['ANSWER', 'CÂU TRẢ LỜI', 'CAU TRA LOI']);
  if (!answer) return '';
  var source = pick_(top.row, ['SOURCE', 'NGUỒN', 'NGUON']) || (pick_(top.row, ['ID']) ? 'FAQ #' + pick_(top.row, ['ID']) : 'FAQ');
  if (/nguồn\s*:/i.test(answer)) return answer;
  return answer + '\n\nNguồn: ' + source;
}

function hasImportantPhraseMatch_(normalizedQuestion, haystack) {
  var phrases = buildImportantPhrases_(normalizedQuestion);
  return !!phrases.length && phrases.some(function (phrase) { return haystack.indexOf(phrase) >= 0; });
}

function selectRelevantData_(question, data) {
  var faqRanked = rankRows_(question, data.faq, ['QUESTION', 'ANSWER', 'KEYWORDS', 'GROUP', 'SOURCE'])
    .filter(function (item) { return item.score >= MIN_AI_CONTEXT_SCORE; });
  if (faqRanked.length) {
    return {
      faq: faqRanked.slice(0, 5).map(function (item) { return item.row; }),
      vanban: []
    };
  }
  var vanbanRanked = rankRows_(question, data.vanban, ['NỘI DUNG', 'NOI DUNG', 'TÊN VĂN BẢN', 'TEN VAN BAN', 'SỐ VĂN BẢN', 'SO VAN BAN'])
    .filter(function (item) { return item.score >= MIN_AI_CONTEXT_SCORE; });
  return {
    faq: faqRanked.slice(0, 5).map(function (item) { return item.row; }),
    vanban: vanbanRanked.slice(0, 5).map(function (item) { return item.row; })
  };
}

function hasRelevantContext_(data) {
  return !!((data.faq && data.faq.length) || (data.vanban && data.vanban.length));
}

function rankRows_(question, rows, keys) {
  var normalizedQuestion = normalizeText_(question);
  var tokens = normalizedQuestion.split(' ').filter(function (token) { return token.length >= 2; });
  var meaningfulTokens = tokens.filter(isMeaningfulToken_);
  var importantPhrases = buildImportantPhrases_(normalizedQuestion);
  var questionHasChangeIntent = /\b(thay doi|dieu chinh)\b/.test(normalizedQuestion);
  var questionHasReportIntent = /\bbao cao\b/.test(normalizedQuestion);
  var questionHasRegistrationIntent = /\b(dang ky|ho so dang ky|xac nhan dang ky)\b/.test(normalizedQuestion);
  return rows.map(function (row, index) {
    var haystack = normalizeText_(keys.map(function (key) { return row[key] || ''; }).join(' '));
    if (!passesMandatoryIntent_(normalizedQuestion, haystack)) return { row: row, score: -999, index: index };
    var score = normalizedQuestion && haystack.indexOf(normalizedQuestion) >= 0 ? 80 : 0;
    var rowHasReportIntent = /\bbao cao\b/.test(haystack);
    var rowHasRegistrationIntent = /\b(dang ky|ho so dang ky|xac nhan dang ky)\b/.test(haystack);
    tokens.forEach(function (token) { if (hasToken_(haystack, token)) score += token.length > 3 ? 4 : 2; });
    var matchedMeaningfulTokens = meaningfulTokens.filter(function (token) { return hasToken_(haystack, token); });
    if (meaningfulTokens.length >= 3) {
      var coverage = matchedMeaningfulTokens.length / meaningfulTokens.length;
      if (coverage >= 0.8) score += 38;
      else if (coverage >= 0.6) score += 18;
    }
    importantPhrases.forEach(function (phrase) { if (haystack.indexOf(phrase) >= 0) score += phrase.split(' ').length * 12; });
    if (importantPhrases.length && !importantPhrases.some(function (phrase) { return haystack.indexOf(phrase) >= 0; })) score -= 45;
    if (!questionHasChangeIntent && /\b(thay doi|dieu chinh)\b/.test(haystack)) score -= 35;
    if (questionHasReportIntent && !rowHasReportIntent) score -= 90;
    if (questionHasReportIntent && rowHasRegistrationIntent && !rowHasReportIntent) score -= 60;
    if (!questionHasRegistrationIntent && rowHasRegistrationIntent && !rowHasReportIntent) score -= 15;
    return { row: row, score: score, index: index };
  }).sort(function (a, b) { if (b.score !== a.score) return b.score - a.score; return a.index - b.index; });
}

function hasToken_(haystack, token) {
  return new RegExp('(^| )' + escapeRegex_(token) + '( |$)').test(haystack);
}

function isMeaningfulToken_(token) {
  if (!token || token.length < 3) return false;
  var stopwords = {
    'nay': true, 'kia': true, 'thi': true, 'the': true, 'nao': true, 'sao': true,
    'khong': true, 'co': true, 'can': true, 'phai': true, 'duoc': true, 'cho': true,
    'voi': true, 'cua': true, 'trong': true, 'theo': true, 'neu': true, 've': true
  };
  return !stopwords[token];
}

function escapeRegex_(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function passesMandatoryIntent_(normalizedQuestion, haystack) {
  if (normalizedQuestion.indexOf('chi tra ngoai te') >= 0 && haystack.indexOf('chi tra ngoai te') < 0) return false;
  if (normalizedQuestion.indexOf('giay chung nhan chi tra') >= 0 && haystack.indexOf('giay chung nhan chi tra') < 0) return false;
  if ((normalizedQuestion.indexOf('thanh phan ho so') >= 0 || normalizedQuestion.indexOf('ho so de nghi') >= 0) && haystack.indexOf('ho so') < 0 && haystack.indexOf('thanh phan') < 0) return false;
  return true;
}

function buildImportantPhrases_(normalizedQuestion) {
  var phrases = [
    'dang ky khoan vay',
    'thoi han dang ky',
    'dang ky vay nuoc ngoai',
    'ho so dang ky',
    'ho so thay doi',
    'thay doi khoan vay',
    'dang ky thay doi',
    'dang ky thay doi khoan vay',
    'ho so dang ky thay doi',
    'bao cao vay',
    'nop bao cao',
    'cham nop bao cao',
    'bao cao qua han',
    'bao cao tre han',
    'nop bao cao tre han',
    'chi tra ngoai te',
    'giay chung nhan chi tra',
    'thanh phan ho so',
    'ho so de nghi'
  ];
  return phrases.filter(function (phrase) { return normalizedQuestion.indexOf(phrase) >= 0; });
}

function buildContext_(data) {
  var faqText = data.faq.slice(0, 5).map(function (row, index) { return ['MÃ THAM CHIẾU: FAQ #' + (index + 1), 'GROUP: ' + pick_(row, ['GROUP']), 'QUESTION: ' + pick_(row, ['QUESTION']), 'ANSWER: ' + compactText_(pick_(row, ['ANSWER']), 1600), 'NGUỒN TRÍCH DẪN: ' + pick_(row, ['SOURCE', 'NGUỒN', 'NGUON']), 'KEYWORDS: ' + pick_(row, ['KEYWORDS'])].join('\n'); }).join('\n---\n');
  var vanbanText = data.vanban.slice(0, 5).map(function (row, index) {
    var soVanBan = pick_(row, ['SỐ VĂN BẢN', 'SO VAN BAN']);
    var tenVanBan = pick_(row, ['TÊN VĂN BẢN', 'TEN VAN BAN']);
    var diemKhoanDieu = [formatPart_('Điểm', pick_(row, ['ĐIỂM', 'DIEM'])), formatPart_('Khoản', pick_(row, ['KHOẢN', 'KHOAN'])), formatPart_('Điều', pick_(row, ['ĐIỀU', 'DIEU']))].filter(Boolean).join(', ');
    var citation = [diemKhoanDieu, soVanBan, tenVanBan].filter(Boolean).join(' - ');
    return ['MÃ THAM CHIẾU: VANBAN #' + (index + 1), 'SO VAN BAN: ' + soVanBan, 'TEN VAN BAN: ' + tenVanBan, 'DIEM/KHOAN/DIEU: ' + diemKhoanDieu, 'NGUỒN TRÍCH DẪN: ' + citation, 'NOI DUNG: ' + compactText_(pick_(row, ['NỘI DUNG', 'NOI DUNG']), 1800)].join('\n');
  }).join('\n---\n');
  return 'FAQ:\n' + faqText + '\n\nVANBAN:\n' + vanbanText;
}

function compactText_(value, maxLength) { var text = String(value || '').trim(); return text.length <= maxLength ? text : text.slice(0, maxLength).trim() + '...'; }
function finalizeAnswer_(question, answer) { return addLateReportScopeWarning_(question, answer); }
function addLateReportScopeWarning_(question, answer) {
  var q = normalizeText_(question), a = normalizeText_(answer);
  var asksLateReport = q.indexOf('bao cao') >= 0 && (q.indexOf('qua han') >= 0 || q.indexOf('nop tre') >= 0 || q.indexOf('cham nop') >= 0 || q.indexOf('tre han') >= 0);
  var oneOff = (a.indexOf('chuyen doi du lieu') >= 0 || a.indexOf('trang dien tu') >= 0 || a.indexOf('thong bao tai trang chu') >= 0) && (a.indexOf('khong sao') >= 0 || a.indexOf('yen tam') >= 0 || a.indexOf('khong anh huong') >= 0);
  var scoped = q.indexOf('thang 4 2026') >= 0 || q.indexOf('04 2026') >= 0 || q.indexOf('4 2026') >= 0;
  if (!asksLateReport || !oneOff || scoped) return answer;
  return answer + '\n\nLưu ý phạm vi: nội dung trên chỉ nên hiểu cho trường hợp báo cáo kỳ tháng 4/2026 bị ghi quá hạn do chuyển đổi dữ liệu sang Trang điện tử theo thông báo nguồn. Với các kỳ báo cáo khác, việc nộp trễ/quá hạn vẫn có thể bị xem xét chế tài xử phạt theo quy định áp dụng.';
}

function appendLog_(question, answer, meta) { try { meta = meta || {}; var ss = SpreadsheetApp.openById(SPREADSHEET_ID); var sheet = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME); ensureLogHeader_(sheet); sheet.appendRow([new Date(), meta.asker || 'Ẩn danh', question, answer, meta.source || '', meta.userAgent || '']); } catch (err) {} }
function ensureLogHeader_(sheet) { var headers = ['NGÀY GIỜ', 'NGƯỜI HỎI', 'CÂU HỎI', 'CÂU TRẢ LỜI', 'NGUỒN', 'TRÌNH DUYỆT']; if (sheet.getLastRow() === 0) { sheet.appendRow(headers); return; } var current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0]; if (headers.some(function (h, i) { return current[i] !== h; })) sheet.getRange(1, 1, 1, headers.length).setValues([headers]); }
function ensureLinksHeader_(sheet) { var headers = ['TYPE', 'TITLE', 'URL', 'STATUS']; if (sheet.getLastRow() === 0) { sheet.appendRow(headers); return; } var current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0]; if (headers.some(function (h, i) { return current[i] !== h; })) sheet.getRange(1, 1, 1, headers.length).setValues([headers]); }
function setupAuthorization() { var ss = SpreadsheetApp.openById(SPREADSHEET_ID); ensureLogHeader_(ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME)); ensureLinksHeader_(ss.getSheetByName(LINKS_SHEET_NAME) || ss.insertSheet(LINKS_SHEET_NAME)); loadKnowledge_(); loadLinks_(); return 'Đã cấp quyền và kết nối được Google Sheet.'; }
function renderChatUi_() { var html = '<!doctype html><html lang="vi"><head><base target="_top"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hỏi đáp quy định NHNN</title><style>body{font-family:Arial,sans-serif;margin:24px;max-width:760px;color:#17202a}textarea{width:100%;box-sizing:border-box;padding:10px;line-height:1.45}button{margin-top:12px;padding:10px 14px;background:#0f766e;color:white;border:0;border-radius:8px;font-weight:700}.disclaimer{margin:16px 0;padding:12px;border:1px solid #f0caca;border-radius:8px;color:#b30000;background:#fffafa;font-size:13px;font-style:italic;line-height:1.5}pre{white-space:pre-wrap;line-height:1.5}</style></head><body><h1>Hỏi đáp quy định NHNN</h1><p>Bạn hãy nhập câu hỏi, tôi sẽ cố gắng trả lời dựa trên dữ liệu hiện có. Nếu cần tra cứu chuyên sâu hơn theo từng nhóm quy định, bạn có thể mở các link tra cứu nhanh theo chủ đề ở trang GitHub Pages.</p><p class="disclaimer">Dự án miễn phí có sử dụng AI, chỉ mang tính chất tham khảo. Vui lòng đối chiếu với quy định hiện hành trước khi áp dụng.</p><form id="form"><textarea id="question" rows="4" placeholder="Nhập câu hỏi"></textarea><button type="submit">Gửi câu hỏi</button></form><pre id="answer"></pre><script>document.getElementById("form").addEventListener("submit",function(e){e.preventDefault();var q=document.getElementById("question").value.trim();var a=document.getElementById("answer");if(!q)return;a.textContent="Đang xử lý...";google.script.run.withSuccessHandler(function(p){a.textContent=p&&p.ok?p.answer:(p&&p.error)||"Có lỗi."}).withFailureHandler(function(err){a.textContent=err.message||String(err)}).askFromUi(q,{asker:"Ẩn danh",userAgent:navigator.userAgent})});</script></body></html>'; return HtmlService.createHtmlOutput(html).setTitle('Hỏi đáp quy định NHNN').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); }
function output_(callback, payload) { if (callback) { var safeCallback = callback.replace(/[^\w.$]/g, ''); return ContentService.createTextOutput(safeCallback + '(' + JSON.stringify(payload) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT); } return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
function isActive_(value) { var text = String(value || '').trim().toLowerCase(); return !text || text === 'hiệu lực' || text === 'hieu luc' || text === 'active'; }
function pick_(row, keys) { for (var i = 0; i < keys.length; i += 1) if (row[keys[i]]) return row[keys[i]]; return ''; }
function publicLink_(item) { return { title: item.title, url: item.url }; }
function safeCachePut_(cache, key, value) { try { cache.put(key, JSON.stringify(value), CACHE_TTL_SECONDS); } catch (err) {} }
function normalizeText_(value) { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim(); }
function formatCellValue_(displayValue, richTextValue) { var text = String(displayValue || '').trim(); if (!richTextValue) return text; var cellUrl = richTextValue.getLinkUrl && richTextValue.getLinkUrl(); if (cellUrl && text && text.indexOf(cellUrl) === -1) return '[' + text + '](' + cellUrl + ')'; var runs = richTextValue.getRuns ? richTextValue.getRuns() : []; if (!runs || !runs.length) return text; var linkedParts = []; runs.forEach(function (run) { var runText = String(run.getText() || '').trim(); var url = run.getLinkUrl && run.getLinkUrl(); if (runText && url && text.indexOf(url) === -1) linkedParts.push('[' + runText + '](' + url + ')'); }); if (!linkedParts.length) return text; var result = text; linkedParts.forEach(function (linkedPart) { if (result.indexOf(linkedPart) === -1) result += ' ' + linkedPart; }); return result.trim(); }
function formatPart_(label, value) { value = String(value || '').trim(); return value ? label + ' ' + value : ''; }
function errorMessage_(err) { return err && err.message ? err.message : String(err); }

