(function () {
  'use strict';
  var labels = { 'windows-x64': 'Windows x64', 'macos-arm64': 'Apple Silicon', 'macos-x64': 'Intel' };
  var boxes = document.querySelectorAll('[data-download]');
  var status = document.getElementById('download-status');
  var retry = document.getElementById('download-retry');
  var loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    retry.hidden = true;
    status.textContent = '正在加载下载信息…';
    boxes.forEach(function (box) {
      var link = box.querySelector('[data-download-link]');
      link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true');
      link.textContent = labels[box.dataset.download] + ' · 正在加载';
      box.querySelector('[data-download-info]').textContent = '';
      box.querySelector('[data-download-notes]').hidden = true;
    });
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch('/api/v1/client-downloads', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Download catalog unavailable');
      var items = await response.json();
      if (!Array.isArray(items) || items.length !== 3 || new Set(items.map(function (item) { return item.id; })).size !== 3) throw new Error('Invalid download catalog');
      boxes.forEach(function (box) {
        var id = box.dataset.download;
        var item = items.find(function (value) { return value.id === id; });
        if (!item || typeof item.enabled !== 'boolean' || typeof item.version !== 'string' || typeof item.minimumOsVersion !== 'string' || typeof item.releaseNotes !== 'string' || !Number.isFinite(item.fileSize)) throw new Error('Invalid download entry');
      });
      boxes.forEach(function (box) {
        var id = box.dataset.download;
        var item = items.find(function (value) { return value.id === id; });
        var link = box.querySelector('[data-download-link]');
        if (!item.enabled || item.fileSize <= 0) { link.textContent = labels[id] + ' · 暂未提供'; return; }
        link.href = '/downloads/' + id.replace('-', '/');
        link.removeAttribute('aria-disabled'); link.classList.remove('installer-pending');
        link.textContent = '下载 ' + labels[id];
        box.querySelector('[data-download-info]').textContent = '版本 ' + item.version + ' · ' + (item.fileSize / 1024 / 1024).toFixed(1) + ' MB · ' + item.minimumOsVersion;
        var notes = box.querySelector('[data-download-notes]');
        notes.hidden = !item.releaseNotes;
        notes.querySelector('p').textContent = item.releaseNotes;
      });
      status.textContent = '下载无需登录，不扣面试时长。';
    } catch (error) {
      status.textContent = '下载信息加载失败，请重试。';
      boxes.forEach(function (box) { box.querySelector('[data-download-link]').textContent = labels[box.dataset.download] + ' · 加载失败'; });
      retry.hidden = false;
    } finally { clearTimeout(timer); loading = false; }
  }
  retry.addEventListener('click', load);
  load();
})();
