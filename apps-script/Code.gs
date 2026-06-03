/**
 * IMPORTANT: In Apps Script, paste only the contents of this file.
 * Do not paste a git diff, shell command, or PR patch text.
 *
 * Apps Script backend for GitHub Pages chat UI.
 *
 * Required Script Properties:
 * - OPENAI_API_KEY: API key for an OpenAI-compatible chat/completions endpoint.
 *
 * Optional Script Properties:
 * - SPREADSHEET_ID: defaults to the sheet in this project brief.
 * - AI_MODEL: defaults to gpt-4o-mini.
 * - OPENAI_BASE_URL: defaults to https://api.openai.com/v1/chat/completions.
 */
const DEFAULT_SPREADSHEET_ID = '1FInDbuWzXhh6vJ-EqaYxA5aIxZ19pVrrG_lS0imOhY4';
const FAQ_SHEET_NAME = 'FAQ';
const LOG_SHEET_NAME = 'Log';
const ACTIVE_STATUS = 'hieu luc';
const MAX_CONTEXT_ITEMS = 8;

function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};
  const callback = sanitizeCallback_(params.callback || 'callback');
  const question = String(params.question || '').trim();
  const output = question ? answerQuestion_(question) : { ok: false, error: 'Thiếu tham số question.' };

  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(output)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function answerQuestion_(question) {
  try {
    const faqRows = getFaqRows_();
    const matches = rankFaqRows_(question, faqRows).slice(0, MAX_CONTEXT_ITEMS);
    const answer = matches.length
      ? generateAiAnswer_(question, matches)
      : 'Tôi chưa tìm thấy nội dung phù hợp trong sheet FAQ. Vui lòng bổ sung dữ liệu hoặc hỏi cụ thể hơn.';

    appendLog_(question, answer);
    return { ok: true, answer, matches: matches.map(toClientMatch_) };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    safeAppendLog_(question, `LỖI: ${message}`);
    return { ok: false, error: message };
  }
}

function getSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
  return SpreadsheetApp.openById(spreadsheetId);
}

function getFaqRows_() {
  const sheet = getSpreadsheet_().getSheetByName(FAQ_SHEET_NAME);
  if (!sheet) throw new Error(`Không tìm thấy sheet ${FAQ_SHEET_NAME}.`);

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader_);
  return values.slice(1)
    .map((row) => ({
      id: getCell_(row, headers, 'id'),
      group: getCell_(row, headers, 'group'),
      question: getCell_(row, headers, 'question'),
      answer: getCell_(row, headers, 'answer'),
      source: getCell_(row, headers, 'source'),
      keywords: getCell_(row, headers, 'keywords'),
      status: getCell_(row, headers, 'status'),
    }))
    .filter((row) => row.question || row.answer)
    .filter((row) => !row.status || normalizeText_(row.status).includes(ACTIVE_STATUS));
}

function rankFaqRows_(question, rows) {
  const query = normalizeText_(question);
  const queryTokens = tokenize_(query);

  return rows
    .map((row) => {
      const searchable = normalizeText_([
        row.group,
        row.question,
        row.answer,
        row.source,
        row.keywords,
      ].join(' '));
      const tokenScore = queryTokens.reduce((score, token) => score + (searchable.includes(token) ? 1 : 0), 0);
      const phraseBonus = searchable.includes(query) ? 5 : 0;
      const keywordBonus = normalizeText_(row.keywords).split(/[;,]/).some((keyword) => keyword.trim() && query.includes(keyword.trim())) ? 2 : 0;
      return { ...row, score: tokenScore + phraseBonus + keywordBonus };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

function generateAiAnswer_(question, matches) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) return buildExtractiveAnswer_(matches);

  const properties = PropertiesService.getScriptProperties();
  const model = properties.getProperty('AI_MODEL') || 'gpt-4o-mini';
  const url = properties.getProperty('OPENAI_BASE_URL') || 'https://api.openai.com/v1/chat/completions';
  const context = matches.map((row, index) => [
    `FAQ ${index + 1}`,
    `Nhóm: ${row.group || 'Không có'}`,
    `Câu hỏi: ${row.question}`,
    `Câu trả lời: ${row.answer}`,
    `Nguồn: ${row.source || 'Không có'}`,
    `Từ khóa: ${row.keywords || 'Không có'}`,
  ].join('\n')).join('\n\n');

  const payload = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'Bạn là trợ lý tra cứu FAQ. Chỉ trả lời dựa trên NGỮ CẢNH được cung cấp. Nếu dữ liệu chưa đủ, nói rõ chưa có dữ liệu. Trả lời tiếng Việt, ngắn gọn, có nêu nguồn nếu có.',
      },
      {
        role: 'user',
        content: `CÂU HỎI:\n${question}\n\nNGỮ CẢNH FAQ:\n${context}`,
      },
    ],
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error(`AI API lỗi HTTP ${status}: ${body.slice(0, 500)}`);
  }

  const json = JSON.parse(body);
  return json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content.trim()
    : buildExtractiveAnswer_(matches);
}

function buildExtractiveAnswer_(matches) {
  const top = matches[0];
  const source = top.source ? `\n\nNguồn: ${top.source}` : '';
  return `${top.answer || top.question}${source}`;
}

function safeAppendLog_(question, answer) {
  try {
    appendLog_(question, answer);
  } catch (error) {
    console.error(error);
  }
}

function appendLog_(question, answer) {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME) || spreadsheet.insertSheet(LOG_SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.appendRow(['NGÀY GIỜ', 'CÂU HỎI', 'CÂU TRẢ LỜI']);
  sheet.appendRow([new Date(), question, answer]);
}

function toClientMatch_(row) {
  return {
    id: row.id,
    group: row.group,
    question: row.question,
    source: row.source,
    score: row.score,
  };
}

function getCell_(row, headers, name) {
  const index = headers.indexOf(name);
  return index >= 0 ? String(row[index] || '').trim() : '';
}

function normalizeHeader_(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize_(text) {
  const stopWords = new Set(['la', 'co', 'duoc', 'khong', 've', 'cho', 'hoi', 'dap', 'toi', 'can', 'biet']);
  return normalizeText_(text)
    .split(' ')
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function sanitizeCallback_(value) {
  const callback = String(value || '').replace(/[^a-zA-Z0-9_$\.]/g, '');
  return callback || 'callback';
}
