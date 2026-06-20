'use strict';

const stripAnsi = require('strip-ansi');

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripAnsiKeepNewlines(str) {
  if (str == null) return '';
  return stripAnsi(String(str)).replace(/\u001b/g, '');
}

function isPrimitive(value) {
  const type = typeof value;
  return value === null || value === undefined || type === 'string' || type === 'number' || type === 'boolean';
}

function jsonReplacer(key, value) {
  if (typeof value === 'function') {
    try {
      return '[Function: ' + (value.name || 'anonymous') + ']' + '\n' + value.toString();
    } catch (e) {
      return '[Function: ' + (value.name || 'anonymous') + ']';
    }
  }
  return value;
}

function serializePropertyValue(value) {
  if (isPrimitive(value)) {
    return String(value);
  }
  try {
    if (typeof value === 'function') {
      return jsonReplacer('', value);
    }
    return JSON.stringify(value, jsonReplacer);
  } catch (e) {
    return String(value);
  }
}

function isSerializableForDataAttr(value) {
  return !isPrimitive(value) && (typeof value === 'object' || typeof value === 'function');
}

function buildHtmlTemplate(suitesHtml, summary) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Jest Test Report</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
.container { max-width: 1200px; margin: 0 auto; }
.header { background: #fff; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.header h1 { font-size: 24px; margin-bottom: 16px; }
.summary { display: flex; gap: 16px; flex-wrap: wrap; }
.summary-card { flex: 1; min-width: 120px; background: #f8f9fa; border-radius: 6px; padding: 16px; text-align: center; }
.summary-card .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.summary-card .value { font-size: 28px; font-weight: bold; }
.summary-card.tests .value { color: #1976d2; }
.summary-card.passed .value { color: #388e3c; }
.summary-card.failed .value { color: #d32f2f; }
.summary-card.skipped .value { color: #f57c00; }
.summary-card.errors .value { color: #d32f2f; }
.summary-card.time .value { font-size: 20px; color: #666; }
.suite { background: #fff; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
.suite-header { padding: 16px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #fafafa; border-bottom: 1px solid #eee; }
.suite-header:hover { background: #f0f0f0; }
.suite-name { font-weight: 600; font-size: 16px; }
.suite-stats { display: flex; gap: 12px; font-size: 13px; color: #666; }
.suite-stats .passed { color: #388e3c; }
.suite-stats .failed { color: #d32f2f; }
.suite-stats .skipped { color: #f57c00; }
.suite-stats .time { color: #999; }
.suite-body { padding: 0; display: none; }
.suite.open .suite-body { display: block; }
.testcase { padding: 12px 20px 12px 40px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: flex-start; }
.testcase:hover { background: #fafafa; }
.testcase-info { flex: 1; }
.testcase-classname { font-size: 12px; color: #999; margin-bottom: 4px; }
.testcase-title { font-size: 14px; color: #333; }
.testcase-meta { display: flex; gap: 10px; align-items: center; font-size: 12px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
.badge.passed { background: #e8f5e9; color: #2e7d32; }
.badge.failed { background: #ffebee; color: #c62828; }
.badge.skipped { background: #fff3e0; color: #e65100; }
.testcase-time { color: #999; }
.failure-details { margin-top: 10px; background: #fff3f3; border-left: 3px solid #d32f2f; padding: 8px 12px; border-radius: 0 4px 4px 0; }
.failure-details summary { cursor: pointer; font-size: 12px; color: #c62828; font-weight: 600; padding: 4px 0; }
.failure-details pre { white-space: pre-wrap; word-break: break-word; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; color: #c62828; line-height: 1.5; margin-top: 8px; }
.toggle-icon { display: inline-block; transition: transform 0.2s; margin-right: 8px; }
.suite.open .toggle-icon { transform: rotate(90deg); }
.system-out { margin: 10px 0; background: #f5f5f5; border-left: 3px solid #999; padding: 12px; border-radius: 0 4px 4px 0; }
.system-out summary { cursor: pointer; font-size: 12px; color: #666; font-weight: 600; }
.system-out pre { white-space: pre-wrap; word-break: break-word; font-family: 'Consolas', 'Monaco', monospace; font-size: 11px; color: #555; line-height: 1.4; margin-top: 8px; }
.properties-section { margin-top: 8px; }
.properties-btn { background: none; border: none; color: #1976d2; font-size: 12px; cursor: pointer; padding: 4px 0; }
.properties-btn:hover { text-decoration: underline; }
.properties-content { display: none; margin-top: 6px; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px; }
.properties-content.show { display: block; }
.property-row { display: flex; gap: 8px; padding: 2px 0; }
.property-name { color: #666; font-weight: 500; min-width: 120px; }
.property-value { color: #333; word-break: break-all; }
.property-value.complex { color: #7b1fa2; font-family: monospace; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Jest Test Report</h1>
    <div class="summary">
      <div class="summary-card tests">
        <div class="label">Tests</div>
        <div class="value">${summary.tests}</div>
      </div>
      <div class="summary-card passed">
        <div class="label">Passed</div>
        <div class="value">${summary.passed}</div>
      </div>
      <div class="summary-card failed">
        <div class="label">Failed</div>
        <div class="value">${summary.failed}</div>
      </div>
      <div class="summary-card skipped">
        <div class="label">Skipped</div>
        <div class="value">${summary.skipped}</div>
      </div>
      <div class="summary-card errors">
        <div class="label">Errors</div>
        <div class="value">${summary.errors}</div>
      </div>
      <div class="summary-card time">
        <div class="label">Time</div>
        <div class="value">${summary.time.toFixed(3)}s</div>
      </div>
    </div>
  </div>
  ${suitesHtml}
</div>
<script>
document.querySelectorAll('.suite-header').forEach(function(header) {
  header.addEventListener('click', function() {
    header.parentElement.classList.toggle('open');
  });
});
document.querySelectorAll('.properties-btn').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var content = btn.nextElementSibling;
    var isJson = btn.getAttribute('data-json') === 'true';
    if (isJson) {
      try {
        var data = JSON.parse(decodeURIComponent(btn.getAttribute('data-properties')));
        var html = '';
        for (var key in data) {
          var val = data[key];
          var valStr = typeof val === 'object' && val !== null ? JSON.stringify(val, null, 2) : String(val);
          var complex = typeof val === 'object' && val !== null ? ' complex' : '';
          html += '<div class="property-row"><span class="property-name">' + escapeHtml(key) + '</span><span class="property-value' + complex + '">' + escapeHtml(valStr) + '</span></div>';
        }
        content.innerHTML = html;
        btn.setAttribute('data-json', 'false');
      } catch (err) {
        content.textContent = 'Error parsing properties: ' + err.message;
      }
    }
    content.classList.toggle('show');
  });
});
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
</script>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  stripAnsiKeepNewlines,
  isPrimitive,
  jsonReplacer,
  serializePropertyValue,
  isSerializableForDataAttr,
  buildHtmlTemplate,
};
