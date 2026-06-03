(function () {
  var config = window.SBV_FAQ_CONFIG || {};
  var endpoint = (config.APPS_SCRIPT_WEB_APP_URL || '').trim();
  var form = document.getElementById('questionForm');
  var input = document.getElementById('questionInput');
  var button = document.getElementById('sendButton');
  var messages = document.getElementById('messages');
  var statusBadge = document.getElementById('connectionStatus');
  var topicList = document.getElementById('topicList');
  var toolList = document.getElementById('toolList');
  var requestId = 0;

  function setStatus(text, mode) {
    statusBadge.textContent = text;
    statusBadge.dataset.mode = mode || '';
  }

  function createLink(item) {
    var link = document.createElement('a');
    link.className = 'topic-link';
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.title;
    return link;
  }

  function renderTopicPanel() {
    if (!topicList || !toolList) return;

    topicList.textContent = '';
    toolList.textContent = '';

    (config.TOPIC_LINKS || []).forEach(function (item) {
      topicList.appendChild(createLink(item));
    });

    (config.TOOL_LINKS || []).forEach(function (item) {
      toolList.appendChild(createLink(item));
    });
  }

  function applyRemoteLinks(payload) {
    if (!payload || !payload.ok || !payload.links) return;

    if (Array.isArray(payload.links.topics) && payload.links.topics.length) {
      config.TOPIC_LINKS = payload.links.topics;
    }

    if (Array.isArray(payload.links.tools) && payload.links.tools.length) {
      config.TOOL_LINKS = payload.links.tools;
    }

    renderTopicPanel();
  }

  function addMessage(role, text) {
    var article = document.createElement('article');
    article.className = 'message ' + role;

    var avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? 'Bạn' : 'AI';

    var bubble = document.createElement('div');
    bubble.className = 'bubble';

    var paragraph = document.createElement('p');
    if (role === 'bot') {
      addLinkedText(paragraph, text);
    } else {
      paragraph.textContent = text;
    }

    bubble.appendChild(paragraph);
    article.appendChild(avatar);
    article.appendChild(bubble);
    messages.appendChild(article);
    messages.scrollTop = messages.scrollHeight;

    return article;
  }

  function addLinkedText(container, text) {
    var pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
    var lastIndex = 0;
    var match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      var label = match[1] || match[3];
      var url = match[2] || match[3];
      var cleanUrl = url.replace(/[).,;]+$/, '');
      var trailing = url.slice(cleanUrl.length);

      var link = document.createElement('a');
      link.href = cleanUrl;
      link.textContent = label;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      container.appendChild(link);

      if (trailing) {
        container.appendChild(document.createTextNode(trailing));
      }

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function setBusy(isBusy) {
    input.disabled = isBusy;
    button.disabled = isBusy;
    button.textContent = isBusy ? 'Đang hỏi...' : 'Gửi câu hỏi';
  }

  function normalizeResponse(payload) {
    if (!payload) return 'Không nhận được phản hồi từ Apps Script.';
    if (payload.ok === false) return payload.error || 'Apps Script báo lỗi nhưng không ghi rõ nội dung.';
    return payload.answer || payload.response || payload.text || JSON.stringify(payload, null, 2);
  }

  function askAppsScript(question) {
    return fetchAppsScript({ question: question }, 30000);
  }

  function loadRemoteLinks() {
    if (!endpoint) return;

    fetchAppsScript({ action: 'links' }, 12000)
      .then(applyRemoteLinks)
      .catch(function () {
        renderTopicPanel();
      });
  }

  function fetchAppsScript(params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!endpoint) {
        reject(new Error('Bạn chưa dán URL Apps Script vào file config.js.'));
        return;
      }

      requestId += 1;
      var callbackName = 'sbvFaqCallback_' + Date.now() + '_' + requestId;
      var script = document.createElement('script');
      var timer = window.setTimeout(function () {
        cleanup();
        reject(new Error('Quá 30 giây chưa nhận được phản hồi. Kiểm tra lại URL /exec và bản deploy Apps Script.'));
      }, timeoutMs || 30000);

      function cleanup() {
        window.clearTimeout(timer);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = function (payload) {
        cleanup();
        resolve(payload);
      };

      var separator = endpoint.indexOf('?') === -1 ? '?' : '&';
      var query = Object.keys(params || {}).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
      });
      query.push('callback=' + encodeURIComponent(callbackName));
      script.src = endpoint + separator + query.join('&');
      script.onerror = function () {
        cleanup();
        reject(new Error('Không tải được Apps Script. Kiểm tra URL /exec hoặc quyền truy cập Web App.'));
      };

      document.body.appendChild(script);
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var question = input.value.trim();
    if (!question) return;

    addMessage('user', question);
    input.value = '';
    setBusy(true);
    setStatus('Đang gửi', 'pending');

    askAppsScript(question)
      .then(function (payload) {
        addMessage('bot', normalizeResponse(payload));
        setStatus('Đã kết nối', 'ok');
      })
      .catch(function (error) {
        addMessage('bot', error.message);
        setStatus('Cần kiểm tra', 'error');
      })
      .finally(function () {
        setBusy(false);
        input.focus();
      });
  });

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  renderTopicPanel();
  loadRemoteLinks();
  setStatus(endpoint ? 'Sẵn sàng' : 'Chưa cấu hình', endpoint ? 'ok' : 'error');
})();
