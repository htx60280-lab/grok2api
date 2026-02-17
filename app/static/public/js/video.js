(() => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');
  const promptInput = document.getElementById('promptInput');
  const imageUrlInput = document.getElementById('imageUrlInput');
  const parentPostInput = document.getElementById('parentPostInput');
  const applyParentBtn = document.getElementById('applyParentBtn');
  const imageFileInput = document.getElementById('imageFileInput');
  const imageFileName = document.getElementById('imageFileName');
  const clearImageFileBtn = document.getElementById('clearImageFileBtn');
  const selectImageFileBtn = document.getElementById('selectImageFileBtn');
  const ratioSelect = document.getElementById('ratioSelect');
  const lengthSelect = document.getElementById('lengthSelect');
  const resolutionSelect = document.getElementById('resolutionSelect');
  const presetSelect = document.getElementById('presetSelect');
  const concurrentSelect = document.getElementById('concurrentSelect');
  const statusText = document.getElementById('statusText');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const durationValue = document.getElementById('durationValue');
  const aspectValue = document.getElementById('aspectValue');
  const lengthValue = document.getElementById('lengthValue');
  const resolutionValue = document.getElementById('resolutionValue');
  const presetValue = document.getElementById('presetValue');
  const countValue = document.getElementById('countValue');
  const videoEmpty = document.getElementById('videoEmpty');
  const videoStage = document.getElementById('videoStage');
  const referencePreview = document.getElementById('referencePreview');
  const referencePreviewImg = document.getElementById('referencePreviewImg');
  const referencePreviewMeta = document.getElementById('referencePreviewMeta');
  const refDropZone = document.getElementById('refDropZone');

  let taskStates = new Map();
  let activeTaskIds = [];
  let isRunning = false;
  let hasRunError = false;
  let startAt = 0;
  let fileDataUrl = '';
  let elapsedTimer = null;
  let lastProgress = 0;
  let previewCount = 0;
  let refDragCounter = 0;
  const DEFAULT_REASONING_EFFORT = 'low';

  function toast(message, type) {
    if (typeof showToast === 'function') {
      showToast(message, type);
    }
  }

  function getParentMemoryApi() {
    return window.ParentPostMemory || null;
  }

  function extractParentPostId(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const api = getParentMemoryApi();
    if (api && typeof api.extractParentPostId === 'function') {
      try {
        return String(api.extractParentPostId(raw) || '').trim();
      } catch (e) {
        // ignore
      }
    }
    const direct = raw.match(/^[0-9a-fA-F-]{32,36}$/);
    if (direct) return direct[0];
    const generated = raw.match(/\/generated\/([0-9a-fA-F-]{32,36})(?:\/|$)/);
    if (generated) return generated[1];
    const imaginePublic = raw.match(/\/imagine-public\/images\/([0-9a-fA-F-]{32,36})(?:\.jpg|\/|$)/);
    if (imaginePublic) return imaginePublic[1];
    const all = raw.match(/([0-9a-fA-F-]{32,36})/g);
    return all && all.length ? all[all.length - 1] : '';
  }

  function normalizeHttpSourceUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:')) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw;
    }
    if (raw.startsWith('/')) {
      return `${window.location.origin}${raw}`;
    }
    return '';
  }

  function pickSourceUrl(hit, parentPostId, fallbackValue = '') {
    const candidates = [
      hit && hit.sourceImageUrl,
      hit && hit.source_image_url,
      hit && hit.imageUrl,
      hit && hit.image_url,
      fallbackValue,
    ];
    for (const candidate of candidates) {
      const normalized = normalizeHttpSourceUrl(candidate);
      if (normalized) return normalized;
    }
    if (!parentPostId) return '';
    const api = getParentMemoryApi();
    if (api && typeof api.buildImaginePublicUrl === 'function') {
      return String(api.buildImaginePublicUrl(parentPostId) || '').trim();
    }
    return `https://imagine-public.x.ai/imagine-public/images/${parentPostId}.jpg`;
  }

  function pickPreviewUrl(hit, parentPostId, fallbackValue = '') {
    const candidates = [
      hit && hit.imageUrl,
      hit && hit.image_url,
      hit && hit.sourceImageUrl,
      hit && hit.source_image_url,
      fallbackValue,
    ];
    for (const candidate of candidates) {
      const raw = String(candidate || '').trim();
      if (raw) return raw;
    }
    return pickSourceUrl(hit, parentPostId, fallbackValue);
  }

  function resolveReferenceByText(text) {
    const raw = String(text || '').trim();
    if (!raw) return { url: '', sourceUrl: '', parentPostId: '' };
    const api = getParentMemoryApi();
    if (api && typeof api.resolveByText === 'function') {
      try {
        const hit = api.resolveByText(raw);
        if (hit && hit.parentPostId) {
          const parentPostId = String(hit.parentPostId || '').trim();
          const sourceUrl = pickSourceUrl(hit, parentPostId);
          const previewUrl = pickPreviewUrl(hit, parentPostId, sourceUrl);
          return {
            url: previewUrl || sourceUrl,
            sourceUrl,
            parentPostId,
          };
        }
      } catch (e) {
        // ignore
      }
    }
    const parentPostId = extractParentPostId(raw);
    if (!parentPostId) {
      return { url: raw, sourceUrl: normalizeHttpSourceUrl(raw), parentPostId: '' };
    }
    const sourceUrl = pickSourceUrl({ sourceImageUrl: raw }, parentPostId, raw);
    const previewUrl = pickPreviewUrl({ imageUrl: raw, sourceImageUrl: sourceUrl }, parentPostId, sourceUrl);
    return { url: previewUrl || sourceUrl, sourceUrl, parentPostId };
  }

  function applyParentPostReference(text, options = {}) {
    const silent = Boolean(options.silent);
    const resolved = resolveReferenceByText(text);
    if (!resolved.parentPostId || !(resolved.url || resolved.sourceUrl)) {
      if (!silent) {
        toast('未识别到有效 parentPostId', 'warning');
      }
      return false;
    }
    if (imageUrlInput) {
      imageUrlInput.value = resolved.sourceUrl || resolved.url;
    }
    if (parentPostInput) {
      parentPostInput.value = resolved.parentPostId;
    }
    clearFileSelection();
    setReferencePreview(resolved.url || resolved.sourceUrl, resolved.parentPostId);
    if (!silent) {
      toast('已使用 parentPostId 填充参考图', 'success');
    }
    return true;
  }

  function clearReferencePreview() {
    if (!referencePreview) return;
    referencePreview.classList.add('hidden');
    if (referencePreviewImg) {
      referencePreviewImg.removeAttribute('src');
    }
    if (referencePreviewMeta) {
      referencePreviewMeta.textContent = '';
    }
  }

  function buildReferencePreviewMeta(url, parentPostId) {
    const raw = String(url || '').trim();
    if (parentPostId) {
      return `parentPostId: ${parentPostId}`;
    }
    if (!raw) return '';
    if (raw.startsWith('data:image/')) {
      return '本地图片（Base64 已隐藏）';
    }
    return raw;
  }

  function setReferencePreview(url, parentPostId) {
    const safeUrl = String(url || '').trim();
    if (!safeUrl || !referencePreview || !referencePreviewImg) {
      clearReferencePreview();
      return;
    }
    referencePreview.classList.remove('hidden');
    referencePreviewImg.src = safeUrl;
    referencePreviewImg.alt = parentPostId ? `parentPostId: ${parentPostId}` : '参考图预览';
    referencePreviewImg.onerror = () => {
      if (!parentPostId) return;
      const api = getParentMemoryApi();
      const memoryHit = api && typeof api.getByParentPostId === 'function'
        ? api.getByParentPostId(parentPostId)
        : null;
      const candidates = [
        memoryHit && memoryHit.imageUrl,
        memoryHit && memoryHit.sourceImageUrl,
        api && typeof api.buildImaginePublicUrl === 'function'
          ? String(api.buildImaginePublicUrl(parentPostId) || '').trim()
          : `https://imagine-public.x.ai/imagine-public/images/${parentPostId}.jpg`,
      ].map((it) => String(it || '').trim()).filter(Boolean);
      for (const next of candidates) {
        if (next === safeUrl || referencePreviewImg.src === next) {
          continue;
        }
        referencePreviewImg.src = next;
        return;
      }
      referencePreviewImg.onerror = null;
    };
    if (referencePreviewMeta) {
      referencePreviewMeta.textContent = buildReferencePreviewMeta(safeUrl, parentPostId);
    }
  }

  function setStatus(state, text) {
    if (!statusText) return;
    statusText.textContent = text;
    statusText.classList.remove('connected', 'connecting', 'error');
    if (state) {
      statusText.classList.add(state);
    }
  }

  function setButtons(running) {
    if (!startBtn || !stopBtn) return;
    if (running) {
      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
    } else {
      startBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      startBtn.disabled = false;
    }
  }

  function updateProgress(value) {
    const safe = Math.max(0, Math.min(100, Number(value) || 0));
    lastProgress = safe;
    if (progressFill) {
      progressFill.style.width = `${safe}%`;
    }
    if (progressText) {
      progressText.textContent = `${safe}%`;
    }
  }

  function updateMeta() {
    if (aspectValue && ratioSelect) {
      aspectValue.textContent = ratioSelect.value;
    }
    if (lengthValue && lengthSelect) {
      lengthValue.textContent = `${lengthSelect.value}s`;
    }
    if (resolutionValue && resolutionSelect) {
      resolutionValue.textContent = resolutionSelect.value;
    }
    if (presetValue && presetSelect) {
      presetValue.textContent = presetSelect.value;
    }
    if (countValue && concurrentSelect) {
      countValue.textContent = concurrentSelect.value;
    }
  }

  function resetOutput(keepPreview) {
    taskStates = new Map();
    activeTaskIds = [];
    hasRunError = false;
    lastProgress = 0;
    updateProgress(0);
    setIndeterminate(false);
    if (!keepPreview) {
      if (videoStage) {
        videoStage.innerHTML = '';
        videoStage.classList.add('hidden');
      }
      if (videoEmpty) {
        videoEmpty.classList.remove('hidden');
      }
      previewCount = 0;
    }
    if (durationValue) {
      durationValue.textContent = '耗时 -';
    }
  }

  function initPreviewSlot() {
    if (!videoStage) return;
    previewCount += 1;
    const item = document.createElement('div');
    item.className = 'video-item';
    item.dataset.index = String(previewCount);
    item.classList.add('is-pending');

    const header = document.createElement('div');
    header.className = 'video-item-bar';

    const title = document.createElement('div');
    title.className = 'video-item-title';
    title.textContent = `视频 ${previewCount}`;

    const actions = document.createElement('div');
    actions.className = 'video-item-actions';

    const openBtn = document.createElement('a');
    openBtn.className = 'geist-button-outline text-xs px-3 video-open hidden';
    openBtn.target = '_blank';
    openBtn.rel = 'noopener';
    openBtn.textContent = '打开';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'geist-button-outline text-xs px-3 video-download';
    downloadBtn.type = 'button';
    downloadBtn.textContent = '下载';
    downloadBtn.disabled = true;

    actions.appendChild(openBtn);
    actions.appendChild(downloadBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'video-item-body';
    body.innerHTML = '<div class="video-item-placeholder">生成中…</div>';

    const link = document.createElement('div');
    link.className = 'video-item-link';

    item.appendChild(header);
    item.appendChild(body);
    item.appendChild(link);
    videoStage.appendChild(item);
    videoStage.classList.remove('hidden');
    if (videoEmpty) {
      videoEmpty.classList.add('hidden');
    }
    return item;
  }

  function updateItemLinks(item, url) {
    if (!item) return;
    const openBtn = item.querySelector('.video-open');
    const downloadBtn = item.querySelector('.video-download');
    const link = item.querySelector('.video-item-link');
    const safeUrl = url || '';
    item.dataset.url = safeUrl;
    if (link) {
      link.textContent = safeUrl;
      link.classList.toggle('has-url', Boolean(safeUrl));
    }
    if (openBtn) {
      if (safeUrl) {
        openBtn.href = safeUrl;
        openBtn.classList.remove('hidden');
      } else {
        openBtn.classList.add('hidden');
        openBtn.removeAttribute('href');
      }
    }
    if (downloadBtn) {
      downloadBtn.dataset.url = safeUrl;
      downloadBtn.disabled = !safeUrl;
    }
    if (safeUrl) {
      item.classList.remove('is-pending');
    }
  }

  function setIndeterminate(active) {
    if (!progressBar) return;
    if (active) {
      progressBar.classList.add('indeterminate');
    } else {
      progressBar.classList.remove('indeterminate');
    }
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    if (!durationValue) return;
    elapsedTimer = setInterval(() => {
      if (!startAt) return;
      const seconds = Math.max(0, Math.round((Date.now() - startAt) / 1000));
      durationValue.textContent = `耗时 ${seconds}s`;
    }, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }

  function clearFileSelection() {
    fileDataUrl = '';
    if (imageFileInput) {
      imageFileInput.value = '';
    }
    if (imageFileName) {
      imageFileName.textContent = '未选择文件';
    }
    const rawUrl = imageUrlInput ? imageUrlInput.value.trim() : '';
    if (rawUrl) {
      const resolved = resolveReferenceByText(rawUrl);
      setReferencePreview(resolved.url || resolved.sourceUrl || rawUrl, resolved.parentPostId || '');
    } else {
      clearReferencePreview();
    }
  }

  async function readFileAsDataUrl(file) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });
  }

  function hasFiles(dataTransfer) {
    if (!dataTransfer) return false;
    if (dataTransfer.files && dataTransfer.files.length > 0) return true;
    const types = dataTransfer.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
  }

  function pickImageFileFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return null;
    if (dataTransfer.files && dataTransfer.files.length) {
      for (const file of dataTransfer.files) {
        if (file && String(file.type || '').startsWith('image/')) {
          return file;
        }
      }
    }
    if (dataTransfer.items && dataTransfer.items.length) {
      for (const item of dataTransfer.items) {
        if (!item) continue;
        if (item.kind === 'file') {
          const file = item.getAsFile ? item.getAsFile() : null;
          if (file && String(file.type || '').startsWith('image/')) {
            return file;
          }
        }
      }
    }
    return null;
  }

  function setRefDragActive(active) {
    if (!refDropZone) return;
    refDropZone.classList.toggle('dragover', Boolean(active));
  }

  async function applyReferenceImageFile(file, sourceLabel) {
    if (!file) return;
    const mimeType = String(file.type || '');
    if (mimeType && !mimeType.startsWith('image/')) {
      toast('仅支持图片文件', 'warning');
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error('图片格式不受支持');
    }
    fileDataUrl = dataUrl;
    if (imageUrlInput) {
      imageUrlInput.value = '';
    }
    if (parentPostInput) {
      parentPostInput.value = '';
    }
    if (imageFileInput) {
      imageFileInput.value = '';
    }
    if (imageFileName) {
      imageFileName.textContent = file.name || sourceLabel || '已选择图片';
    }
    setReferencePreview(fileDataUrl, '');
    if (sourceLabel) {
      toast(`${sourceLabel}已载入`, 'success');
    }
  }

  function normalizeAuthHeader(authHeader) {
    if (!authHeader) return '';
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    return authHeader;
  }

  function buildSseUrl(taskId, rawPublicKey) {
    const httpProtocol = window.location.protocol === 'https:' ? 'https' : 'http';
    const base = `${httpProtocol}://${window.location.host}/v1/public/video/sse`;
    const params = new URLSearchParams();
    params.set('task_id', taskId);
    params.set('t', String(Date.now()));
    if (rawPublicKey) {
      params.set('public_key', rawPublicKey);
    }
    return `${base}?${params.toString()}`;
  }

  function getConcurrentValue() {
    const raw = concurrentSelect ? parseInt(concurrentSelect.value, 10) : 1;
    if (!Number.isFinite(raw)) return 1;
    return Math.max(1, Math.min(4, raw));
  }

  async function createVideoTasks(authHeader) {
    const prompt = promptInput ? promptInput.value.trim() : '';
    const rawUrl = imageUrlInput ? imageUrlInput.value.trim() : '';
    const rawParent = parentPostInput ? parentPostInput.value.trim() : '';
    if (fileDataUrl && rawUrl) {
      toast('参考图只能选择其一：URL/Base64 或 本地上传', 'error');
      throw new Error('invalid_reference');
    }
    let resolvedRef = { url: '', sourceUrl: '', parentPostId: '' };
    if (!fileDataUrl) {
      resolvedRef = resolveReferenceByText(rawParent || rawUrl);
    }
    const parentPostId = fileDataUrl ? '' : String(resolvedRef.parentPostId || '').trim();
    const imageUrl = fileDataUrl ? fileDataUrl : (parentPostId ? '' : resolvedRef.url);
    if (!fileDataUrl && resolvedRef.parentPostId) {
      if (imageUrlInput) {
        imageUrlInput.value = resolvedRef.sourceUrl || resolvedRef.url;
      }
      if (parentPostInput) {
        parentPostInput.value = resolvedRef.parentPostId;
      }
      setReferencePreview(resolvedRef.url || resolvedRef.sourceUrl, resolvedRef.parentPostId);
    }
    const res = await fetch('/v1/public/video/start', {
      method: 'POST',
      headers: {
        ...buildAuthHeaders(authHeader),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        image_url: imageUrl || null,
        parent_post_id: parentPostId || null,
        source_image_url: parentPostId ? (resolvedRef.sourceUrl || null) : null,
        reasoning_effort: DEFAULT_REASONING_EFFORT,
        aspect_ratio: ratioSelect ? ratioSelect.value : '3:2',
        video_length: lengthSelect ? parseInt(lengthSelect.value, 10) : 6,
        resolution_name: resolutionSelect ? resolutionSelect.value : '480p',
        preset: presetSelect ? presetSelect.value : 'normal',
        concurrent: getConcurrentValue()
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to create task');
    }
    const data = await res.json();
    if (data && Array.isArray(data.task_ids) && data.task_ids.length > 0) {
      return data.task_ids
        .map((id) => String(id || '').trim())
        .filter((id) => id.length > 0);
    }
    if (data && data.task_id) {
      return [String(data.task_id)];
    }
    throw new Error('empty_task_ids');
  }

  async function stopVideoTask(taskIds, authHeader) {
    const normalized = Array.isArray(taskIds)
      ? taskIds.map((id) => String(id || '').trim()).filter((id) => id.length > 0)
      : [];
    if (!normalized.length) return;
    try {
      await fetch('/v1/public/video/stop', {
        method: 'POST',
        headers: {
          ...buildAuthHeaders(authHeader),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ task_ids: normalized })
      });
    } catch (e) {
      // ignore
    }
  }

  function extractVideoInfo(buffer) {
    if (!buffer) return null;
    if (buffer.includes('<video')) {
      const matches = buffer.match(/<video[\s\S]*?<\/video>/gi);
      if (matches && matches.length) {
        return { html: matches[matches.length - 1] };
      }
    }
    const mdMatches = buffer.match(/\[video\]\(([^)]+)\)/g);
    if (mdMatches && mdMatches.length) {
      const last = mdMatches[mdMatches.length - 1];
      const urlMatch = last.match(/\[video\]\(([^)]+)\)/);
      if (urlMatch) {
        return { url: urlMatch[1] };
      }
    }
    const urlMatches = buffer.match(/https?:\/\/[^\s<)]+/g);
    if (urlMatches && urlMatches.length) {
      return { url: urlMatches[urlMatches.length - 1] };
    }
    return null;
  }

  function renderVideoFromHtml(taskState, html) {
    const container = taskState && taskState.previewItem;
    if (!container) return;
    const body = container.querySelector('.video-item-body');
    if (!body) return;
    body.innerHTML = html;
    const videoEl = body.querySelector('video');
    let videoUrl = '';
    if (videoEl) {
      videoEl.controls = true;
      videoEl.preload = 'metadata';
      const source = videoEl.querySelector('source');
      if (source && source.getAttribute('src')) {
        videoUrl = source.getAttribute('src');
      } else if (videoEl.getAttribute('src')) {
        videoUrl = videoEl.getAttribute('src');
      }
    }
    updateItemLinks(container, videoUrl);
  }

  function renderVideoFromUrl(taskState, url) {
    const container = taskState && taskState.previewItem;
    if (!container) return;
    const safeUrl = url || '';
    const body = container.querySelector('.video-item-body');
    if (!body) return;
    body.innerHTML = `\n      <video controls preload="metadata">\n        <source src="${safeUrl}" type="video/mp4">\n      </video>\n    `;
    updateItemLinks(container, safeUrl);
  }

  function updateAggregateProgress() {
    if (!taskStates.size) {
      updateProgress(0);
      return;
    }
    let total = 0;
    taskStates.forEach((state) => {
      total += state.done ? 100 : (state.progress || 0);
    });
    updateProgress(Math.round(total / taskStates.size));
  }

  function handleDelta(taskState, text) {
    if (!taskState) return;
    if (!text) return;
    if (text.includes('<think>') || text.includes('</think>')) {
      return;
    }
    if (text.includes('超分辨率')) {
      setStatus('connecting', '超分辨率中');
      setIndeterminate(true);
      if (progressText) {
        progressText.textContent = '超分辨率中';
      }
      return;
    }

    if (!taskState.collectingContent) {
      const maybeVideo = text.includes('<video') || text.includes('[video](') || text.includes('http://') || text.includes('https://');
      if (maybeVideo) {
        taskState.collectingContent = true;
      }
    }

    if (taskState.collectingContent) {
      taskState.contentBuffer += text;
      const info = extractVideoInfo(taskState.contentBuffer);
      if (info) {
        if (info.html) {
          renderVideoFromHtml(taskState, info.html);
        } else if (info.url) {
          renderVideoFromUrl(taskState, info.url);
        }
      }
      return;
    }

    taskState.progressBuffer += text;
    const matches = [...taskState.progressBuffer.matchAll(/进度\s*(\d+)%/g)];
    if (matches.length) {
      const last = matches[matches.length - 1];
      const value = parseInt(last[1], 10);
      setIndeterminate(false);
      taskState.progress = value;
      updateAggregateProgress();
      taskState.progressBuffer = taskState.progressBuffer.slice(
        Math.max(0, taskState.progressBuffer.length - 200)
      );
    }
  }

  function closeAllSources() {
    taskStates.forEach((taskState) => {
      if (!taskState || !taskState.source) {
        return;
      }
      try {
        taskState.source.close();
      } catch (e) {
        // ignore
      }
      taskState.source = null;
    });
  }

  function markTaskFinished(taskId, hasError) {
    const taskState = taskStates.get(taskId);
    if (!taskState || taskState.done) {
      return;
    }
    taskState.done = true;
    if (!hasError) {
      taskState.progress = 100;
    } else {
      hasRunError = true;
    }
    if (taskState.source) {
      try {
        taskState.source.close();
      } catch (e) {
        // ignore
      }
      taskState.source = null;
    }
    updateAggregateProgress();

    const allDone = Array.from(taskStates.values()).every((state) => state.done);
    if (allDone) {
      finishRun(hasRunError);
    }
  }

  async function startConnection() {
    const prompt = promptInput ? promptInput.value.trim() : '';
    if (!prompt) {
      toast('请输入提示词', 'error');
      return;
    }

    if (isRunning) {
      toast('已在生成中', 'warning');
      return;
    }

    const authHeader = await ensurePublicKey();
    if (authHeader === null) {
      toast('请先配置 Public Key', 'error');
      window.location.href = '/login';
      return;
    }

    isRunning = true;
    startBtn.disabled = true;
    updateMeta();
    resetOutput();
    setStatus('connecting', '连接中');

    let taskIds = [];
    try {
      taskIds = await createVideoTasks(authHeader);
    } catch (e) {
      setStatus('error', '创建任务失败');
      startBtn.disabled = false;
      isRunning = false;
      return;
    }

    if (!taskIds.length) {
      setStatus('error', '创建任务失败');
      startBtn.disabled = false;
      isRunning = false;
      return;
    }

    taskStates = new Map();
    previewCount = 0;
    for (const taskId of taskIds) {
      const previewItem = initPreviewSlot();
      taskStates.set(taskId, {
        taskId,
        source: null,
        previewItem,
        progressBuffer: '',
        contentBuffer: '',
        collectingContent: false,
        progress: 0,
        done: false
      });
    }
    activeTaskIds = taskIds.slice();
    hasRunError = false;

    startAt = Date.now();
    setStatus('connected', `生成中 (${taskIds.length} 路)`);
    setButtons(true);
    setIndeterminate(true);
    updateAggregateProgress();
    startElapsedTimer();

    const rawPublicKey = normalizeAuthHeader(authHeader);
    taskIds.forEach((taskId, index) => {
      const url = buildSseUrl(taskId, rawPublicKey);
      const es = new EventSource(url);
      const taskState = taskStates.get(taskId);
      if (!taskState) {
        try {
          es.close();
        } catch (e) {
          // ignore
        }
        return;
      }
      taskState.source = es;

      es.onopen = () => {
        setStatus('connected', `生成中 (${taskIds.length} 路)`);
      };

      es.onmessage = (event) => {
        if (!event || !event.data) return;
        if (event.data === '[DONE]') {
          markTaskFinished(taskId, false);
          return;
        }
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (payload && payload.error) {
          toast(`任务 ${index + 1}: ${payload.error}`, 'error');
          setStatus('error', '部分任务失败');
          markTaskFinished(taskId, true);
          return;
        }
        const choice = payload.choices && payload.choices[0];
        const delta = choice && choice.delta ? choice.delta : null;
        if (delta && delta.content) {
          handleDelta(taskState, delta.content);
        }
        if (choice && choice.finish_reason === 'stop') {
          markTaskFinished(taskId, false);
        }
      };

      es.onerror = () => {
        if (!isRunning) return;
        setStatus('error', '部分任务连接异常');
        markTaskFinished(taskId, true);
      };
    });
  }

  async function stopConnection() {
    const authHeader = await ensurePublicKey();
    if (authHeader !== null) {
      await stopVideoTask(activeTaskIds, authHeader);
    }
    closeAllSources();
    isRunning = false;
    taskStates = new Map();
    activeTaskIds = [];
    hasRunError = false;
    stopElapsedTimer();
    setIndeterminate(false);
    setButtons(false);
    setStatus('', '未连接');
  }

  function finishRun(hasError) {
    if (!isRunning) return;
    closeAllSources();
    isRunning = false;
    activeTaskIds = [];
    setButtons(false);
    stopElapsedTimer();
    if (!hasError) {
      setStatus('connected', '完成');
      setIndeterminate(false);
      updateProgress(100);
    } else {
      setStatus('error', '部分任务失败');
      setIndeterminate(false);
    }
    if (durationValue && startAt) {
      const seconds = Math.max(0, Math.round((Date.now() - startAt) / 1000));
      durationValue.textContent = `耗时 ${seconds}s`;
    }
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => startConnection());
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => stopConnection());
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (isRunning) {
        toast('生成进行中，停止后再清空', 'warning');
        return;
      }
      resetOutput();
    });
  }

  if (videoStage) {
    videoStage.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains('video-download')) return;
      event.preventDefault();
      const item = target.closest('.video-item');
      if (!item) return;
      const url = item.dataset.url || target.dataset.url || '';
      const index = item.dataset.index || '';
      if (!url) return;
      try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
          throw new Error('download_failed');
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = index ? `grok_video_${index}.mp4` : 'grok_video.mp4';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(blobUrl);
      } catch (e) {
        toast('下载失败，请检查视频链接是否可访问', 'error');
      }
    });
  }

  if (imageFileInput) {
    imageFileInput.addEventListener('change', async () => {
      const file = imageFileInput.files && imageFileInput.files[0];
      if (!file) {
        clearFileSelection();
        return;
      }
      try {
        await applyReferenceImageFile(file, '上传图片');
      } catch (e) {
        fileDataUrl = '';
        toast(String(e && e.message ? e.message : '文件读取失败'), 'error');
        clearReferencePreview();
      }
    });
  }

  if (selectImageFileBtn && imageFileInput) {
    selectImageFileBtn.addEventListener('click', () => {
      imageFileInput.click();
    });
  }

  if (clearImageFileBtn) {
    clearImageFileBtn.addEventListener('click', () => {
      clearFileSelection();
    });
  }

  if (applyParentBtn) {
    applyParentBtn.addEventListener('click', () => {
      applyParentPostReference(parentPostInput ? parentPostInput.value : '');
    });
  }

  if (parentPostInput) {
    parentPostInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyParentPostReference(parentPostInput.value);
      }
    });
    parentPostInput.addEventListener('input', () => {
      const raw = parentPostInput.value.trim();
      if (!raw) {
        if (!fileDataUrl) {
          clearReferencePreview();
        }
        return;
      }
      applyParentPostReference(raw, { silent: true });
    });
    parentPostInput.addEventListener('paste', (event) => {
      const text = String(event.clipboardData ? event.clipboardData.getData('text') || '' : '').trim();
      if (!text) return;
      event.preventDefault();
      parentPostInput.value = text;
      applyParentPostReference(text, { silent: true });
    });
  }

  if (imageUrlInput) {
    imageUrlInput.addEventListener('input', () => {
      const raw = imageUrlInput.value.trim();
      if (!raw) {
        if (parentPostInput) {
          parentPostInput.value = '';
        }
        if (!fileDataUrl) {
          clearReferencePreview();
        }
        return;
      }
      const hasUrlLikePrefix = raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:image/') || raw.startsWith('/');
      if (!hasUrlLikePrefix) {
        const applied = applyParentPostReference(raw, { silent: true });
        if (applied) {
          return;
        }
      }
      const resolved = resolveReferenceByText(raw);
      if (resolved.parentPostId && parentPostInput) {
        parentPostInput.value = resolved.parentPostId;
      }
      if (raw && fileDataUrl) {
        clearFileSelection();
      }
      setReferencePreview(resolved.url || resolved.sourceUrl || raw, resolved.parentPostId || '');
    });
    imageUrlInput.addEventListener('paste', (event) => {
      const text = String(event.clipboardData ? event.clipboardData.getData('text') || '' : '').trim();
      if (!text) return;
      event.preventDefault();
      imageUrlInput.value = text;
      const applied = applyParentPostReference(text, { silent: true });
      if (!applied) {
        const resolved = resolveReferenceByText(text);
        if (resolved.parentPostId && parentPostInput) {
          parentPostInput.value = resolved.parentPostId;
        }
        if (fileDataUrl) {
          clearFileSelection();
        }
        setReferencePreview(resolved.url || resolved.sourceUrl || text, resolved.parentPostId || '');
      }
    });
  }

  document.addEventListener('paste', async (event) => {
    const dataTransfer = event.clipboardData;
    if (!dataTransfer) return;
    const imageFile = pickImageFileFromDataTransfer(dataTransfer);
    if (imageFile) {
      event.preventDefault();
      try {
        await applyReferenceImageFile(imageFile, '粘贴图片');
      } catch (e) {
        toast(String(e && e.message ? e.message : '图片读取失败'), 'error');
      }
      return;
    }
    const text = String(dataTransfer.getData('text') || '').trim();
    if (!text) return;
    const target = event.target;
    const allowTarget = target === parentPostInput || target === imageUrlInput || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement);
    if (!allowTarget || target === promptInput) {
      return;
    }
    const applied = applyParentPostReference(text, { silent: true });
    if (applied) {
      event.preventDefault();
    }
  });

  if (refDropZone) {
    refDropZone.addEventListener('dragenter', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      refDragCounter += 1;
      setRefDragActive(true);
    });

    refDropZone.addEventListener('dragover', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setRefDragActive(true);
    });

    refDropZone.addEventListener('dragleave', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      refDragCounter = Math.max(0, refDragCounter - 1);
      if (refDragCounter === 0) {
        setRefDragActive(false);
      }
    });

    refDropZone.addEventListener('drop', async (event) => {
      event.preventDefault();
      refDragCounter = 0;
      setRefDragActive(false);
      const file = pickImageFileFromDataTransfer(event.dataTransfer);
      if (!file) {
        toast('未检测到可用图片文件', 'warning');
        return;
      }
      try {
        await applyReferenceImageFile(file, '拖拽图片');
      } catch (e) {
        toast(String(e && e.message ? e.message : '图片读取失败'), 'error');
      }
    });
  }

  window.addEventListener('dragover', (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
  });

  window.addEventListener('drop', (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    if (refDropZone && event.target instanceof Node && refDropZone.contains(event.target)) {
      return;
    }
    event.preventDefault();
    refDragCounter = 0;
    setRefDragActive(false);
  });

  if (promptInput) {
    promptInput.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        startConnection();
      }
    });
  }

  [ratioSelect, lengthSelect, resolutionSelect, presetSelect, concurrentSelect]
    .filter(Boolean)
    .forEach((el) => {
      el.addEventListener('change', updateMeta);
    });

  updateMeta();
  if (imageUrlInput && imageUrlInput.value.trim()) {
    const resolved = resolveReferenceByText(imageUrlInput.value.trim());
    setReferencePreview(resolved.url || resolved.sourceUrl || imageUrlInput.value.trim(), resolved.parentPostId || '');
    if (resolved.parentPostId && parentPostInput && !parentPostInput.value.trim()) {
      parentPostInput.value = resolved.parentPostId;
    }
  } else {
    clearReferencePreview();
  }
})();
