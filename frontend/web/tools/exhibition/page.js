const $ = (id) => document.getElementById(id);
let status = null;
let mode = 'auto';
let manualOrigin = '';
let apkOverride = '';
let lastKey = '';
let requestId = 0;
let targets = null;

function clearCards() {
  targets = null;
  lastKey = '';
  for (const kind of ['android', 'web']) {
    $(kind + '-qr').hidden = true;
    $(kind + '-qr').removeAttribute('src');
    $(kind + '-empty').hidden = false;
    $(kind + '-target').removeAttribute('href');
    $(kind + '-target').textContent = '';
    $(kind + '-save').removeAttribute('href');
    $(kind + '-save').setAttribute('aria-disabled', 'true');
    $(kind + '-copy').disabled = true;
  }
  $('print').disabled = true;
  $('temporary').hidden = true;
}

async function render() {
  const revision = ++requestId;
  const origin = mode === 'auto' ? status?.detectedUrl || '' : manualOrigin;
  if (mode === 'auto') $('origin').value = origin;
  $('source').textContent =
    mode === 'manual'
      ? '직접 입력한 주소를 사용합니다.'
      : status?.source === 'fixed'
        ? '복지나침반 고정 주소를 사용합니다.'
        : status?.source === 'site'
          ? '현재 접속한 복지나침반 사이트 주소를 사용합니다.'
          : origin
            ? '현재 공유 프로세스에 기록된 주소입니다. 외부 접속 성공 여부는 별도 확인하세요.'
            : '실행 중인 공유 서버 주소가 없습니다. 공유 서버를 켜거나 고정 주소를 입력해 주세요.';
  $('apk-status').textContent = apkOverride
    ? '별도 다운로드 주소입니다. 배포 서명과 실제 APK 다운로드를 확인한 뒤 공유하세요.'
    : status?.apkPresent
      ? `로컬 배포 폴더의 APK 확인 (${(status.apkBytes / 1024 / 1024).toFixed(1)} MB). 서명과 외부 다운로드 확인은 별도입니다.`
      : 'APK 미등록 · 설치 QR은 주소 준비용입니다. 배포용 APK를 올리기 전에는 다운로드되지 않습니다.';
  if (!origin) {
    clearCards();
    return;
  }
  const key = JSON.stringify([origin, apkOverride]);
  if (lastKey === key) return;
  clearCards();
  try {
    const params = new URLSearchParams({ origin, apk: apkOverride });
    const response = await fetch('api/targets?' + params, { cache: 'no-store' });
    if (!response.ok) throw new Error(await response.text());
    const next = await response.json();
    if (revision !== requestId) return;
    for (const kind of ['android', 'web']) {
      const qrUrl = 'api/qr?' + new URLSearchParams({ origin, apk: apkOverride, kind });
      const image = $(kind + '-qr');
      image.src = qrUrl;
      await image.decode();
      if (revision !== requestId) return;
      image.hidden = false;
      $(kind + '-empty').hidden = true;
      $(kind + '-target').textContent = next[kind];
      $(kind + '-target').href = next[kind];
      $(kind + '-save').href = qrUrl + '&download=1';
      $(kind + '-save').setAttribute('download', `bokji-${kind}-qr.png`);
      $(kind + '-save').setAttribute('aria-disabled', 'false');
      $(kind + '-copy').disabled = false;
    }
    targets = next;
    lastKey = key;
    $('temporary').hidden = !next.temporary;
    $('error').hidden = true;
    $('print').disabled = false;
    $('updated').textContent =
      'QR 갱신: ' + new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch (error) {
    if (revision !== requestId) return;
    clearCards();
    $('error').textContent = error.message || 'QR을 만들지 못했습니다. 다시 시도해 주세요.';
    $('error').hidden = false;
  }
}

async function poll() {
  try {
    const response = await fetch('api/status', {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok)
      throw new Error(
        [401, 403].includes(response.status)
          ? '관리자 로그인이 만료되었거나 권한이 없습니다. 사이트에서 다시 로그인해 주세요.'
          : '관리 서버 연결이 끊겼습니다. 서버를 켜면 QR을 다시 불러옵니다.',
      );
    status = await response.json();
    if (status.source !== 'fixed' && window.location.protocol === 'https:') {
      status.detectedUrl = window.location.origin;
      status.source = 'site';
    }
    await render();
  } catch (error) {
    ++requestId;
    status = null;
    clearCards();
    $('error').textContent = error.message || '관리 서버에 다시 연결해 주세요.';
    $('error').hidden = false;
  }
}
document.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener('change', () => {
    mode = input.value;
    $('origin').disabled = mode === 'auto';
    if (mode === 'manual') $('origin').value = manualOrigin;
    $('error').hidden = true;
    void render();
  });
});
$('settings').addEventListener('submit', (event) => {
  event.preventDefault();
  manualOrigin = $('origin').value.trim();
  apkOverride = $('apk').value.trim();
  $('error').hidden = true;
  void render();
});
for (const kind of ['android', 'web']) {
  $(kind + '-copy').addEventListener('click', async () => {
    if (!targets) return;
    try {
      await navigator.clipboard.writeText(targets[kind]);
      $('feedback').textContent = '주소를 복사했습니다.';
    } catch {
      $('feedback').textContent = '복사하지 못했습니다. QR 아래 주소를 직접 복사해 주세요.';
    }
  });
}
$('print').addEventListener('click', () => window.print());
async function refreshLoop() {
  await poll();
  setTimeout(refreshLoop, 5000);
}
void refreshLoop();
