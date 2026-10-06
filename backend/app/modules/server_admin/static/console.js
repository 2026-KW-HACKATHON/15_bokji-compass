(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = { user: null, view: "overview", collectionTab: "status", settings: null, overview: null, generation: 0, saving: false };
  const controls = new Map();
  const viewLabels = { overview: "서버 개요", processes: "서버·프론트 제어", operations: "수집 실행", collection: "데이터 수집", settings: "서버 설정" };
  let controlTimer = null, controlBusy = false, controlDisconnected = false, processState = null;
  let operationTimer = null, operationLoading = false, operationSubmitting = false, operationActive = false;
  const runFields = ["page_size", "max_pages", "max_jobs", "max_seconds", "max_http_calls", "max_model_calls", "max_tokens"];
  const providerLabels = { bokjiro: "복지로", gov24: "정부24", notice: "외부 공고 원문", model: "Codex 모델" };
  const statusLabels = { completed: "완료", budget_reached: "처리 한도 도달", busy: "작업 중", failed: "실패", paused: "대기", pending: "대기", running: "처리 중", done: "완료", dead: "재확인 필요", needs_review: "검토 대기", queued: "수집 대기", disabled: "비활성", reachable: "연결 확인", unavailable: "확인 필요" };
  const groupLabels = {
    ingestion: ["수집 처리량", "한 번에 처리할 양과 재시도 기준을 정합니다."],
    collection: ["수집 처리량", "한 번에 처리할 양과 재시도 기준을 정합니다."],
    limits: ["호출 한도", "일일 사용량과 모델 처리 한도를 관리합니다."],
    quota: ["일일 호출 한도", "공급자별 호출량을 보수적으로 제한합니다."],
    scheduling: ["수집 주기", "목록 재탐색과 공고 수정 확인 주기를 정합니다."],
    resources: ["서버 자원", "서버가 무리 없이 작업할 수 있는 기준을 정합니다."],
    model: ["Codex 모델", "분석 모델과 대체 모델, 제한 시간을 설정합니다."],
    codex: ["Codex 모델", "분석 모델과 대체 모델, 제한 시간을 설정합니다."],
    discovery: ["외부 공고 검색", "검색 범위와 공식 사이트 허용 목록을 관리합니다."],
    credentials: ["공공 API 인증", "등록 여부를 확인하고 필요한 키만 교체하세요."],
    keys: ["공공 API 인증", "등록 여부를 확인하고 필요한 키만 교체하세요."],
    api: ["공공 API 인증", "등록 여부를 확인하고 필요한 키만 교체하세요."],
    database: ["데이터베이스", "연결 설정의 변경은 서버를 재시작한 뒤 적용됩니다."],
    storage: ["저장과 공개", "검증된 결과의 저장·공개 기준을 관리합니다."],
    publication: ["공고 공개", "검증된 결과의 공개 기준을 관리합니다."],
  };
  const descriptions = {
    ingestion_enabled: "끄면 다음 수집 회차부터 대기합니다. 진행 중인 회차는 기존 제한 시간 내 종료합니다. 켜도 스케줄 또는 명시적 실행이 있어야 수집합니다.",
    ingestion_page_size: "한 페이지에서 요청할 공고 수입니다. 대기열 한도보다 작거나 같아야 합니다.",
    ingestion_max_pages: "한 차례에 조회할 최대 페이지 수입니다. 0이면 목록 조회를 쉬어갑니다.",
    ingestion_max_jobs: "한 차례에 처리할 상세 수집·분석 작업 수입니다.",
    ingestion_max_seconds: "한 차례 작업의 최대 실행 시간입니다. 단위: 초.",
    ingestion_max_http_calls: "재시도와 원문 이동을 포함한 한 차례 HTTP 호출 한도입니다.",
    ingestion_max_response_bytes: "원문 응답 하나의 최대 크기입니다. 단위: 바이트.",
    ingestion_http_interval_seconds: "HTTP 요청 사이의 최소 간격입니다. 단위: 초.",
    ingestion_max_model_calls: "한 차례에 허용할 모델 호출 수입니다. 대체 모델도 포함됩니다.",
    ingestion_max_tokens: "보고된 토큰 사용량을 기준으로 후속 호출을 멈추는 한도입니다.",
    ingestion_daily_model_calls: "하루에 허용할 모델 호출 수입니다. 한국 시간 자정 기준입니다.",
    ingestion_daily_bokjiro_calls: "복지로의 실제 계정 한도에 맞춰 지정하세요. 재시도도 포함됩니다.",
    ingestion_daily_gov24_calls: "정부24의 실제 계정 한도에 맞춰 지정하세요. 재시도도 포함됩니다.",
    ingestion_daily_notice_calls: "외부 공고 원문 조회의 일일 호출 한도입니다.",
    ingestion_scan_interval_seconds: "전체 목록 조회가 끝난 후 다음 조회까지의 간격입니다. 단위: 초.",
    ingestion_recheck_seconds: "등록된 공고의 수정 여부를 확인할 간격입니다. 단위: 초.",
    ingestion_queue_limit: "대기열이 이 한도에 이르면 새로운 목록 수집을 쉬어갑니다.",
    ingestion_max_attempts: "오류가 발생한 작업의 최대 시도 횟수입니다.",
    ingestion_min_available_memory_mb: "사용 가능한 메모리가 이 값보다 적으면 작업을 대기합니다. 단위: MB.",
    ingestion_min_free_disk_mb: "남은 디스크 공간이 이 값보다 적으면 작업을 대기합니다. 단위: MB.",
    ingestion_discovery_enabled: "검색 후보를 저장합니다. 후보의 원문 수집은 별도 검토 후 진행합니다.",
    ingestion_discovery_domains: "허용할 공식 도메인을 한 줄에 하나씩 입력하세요.",
    ingestion_discovery_query: "작은 모델이 외부 공고를 찾을 때 사용할 검색어입니다.",
    codex_model: "공고 분석에 사용할 기본 모델입니다.",
    codex_fallback_model: "검증 실패 시 사용할 모델입니다. 빈 값은 대체 모델 사용을 끕니다.",
    codex_reasoning_effort: "모델이 분석에 사용할 추론 수준입니다.",
    codex_timeout_seconds: "모델 호출 하나의 최대 대기 시간입니다. 단위: 초.",
    parsing_max_input_chars: "모델에 전달할 원문의 최대 글자 수입니다.",
    policy_auto_publish: "검증된 공고를 자동으로 공개할지 설정합니다.",
    db_enabled: "MySQL 사용 여부입니다. 변경 후 서버를 재시작해야 합니다.",
    db_ssl_ca: "MySQL TLS 인증서 경로입니다. 사용하지 않으면 빈 값으로 둡니다.",
  };

  class ApiError extends Error {
    constructor(status, code = "") { super(code); this.status = status; this.code = code; }
  }
  function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = String(text);
    return node;
  }
  function icon(name) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    node.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#i-${name}`); node.append(use); return node;
  }
  function number(value) { return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ko-KR") : "—"; }
  function date(value) {
    if (value == null || value === "") return "기록 없음";
    const parsed = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value);
    return Number.isNaN(parsed.getTime()) ? "기록 없음" : parsed.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function duration(value) {
    if (typeof value !== "number") return "—";
    const days = Math.floor(value / 86400), hours = Math.floor(value / 3600) % 24, minutes = Math.floor(value / 60) % 60;
    return `${days ? `${days}일 ` : ""}${hours ? `${hours}시간 ` : ""}${minutes}분`;
  }
  function errorMessage(error) {
    if (error.code === "session_changed") return "";
    if (error.code && !["connection_failed"].includes(error.code) && error.status >= 400 && error.status !== 401 && error.status !== 403) return error.code;
    if (error.status === 401) return "아이디 또는 비밀번호를 확인하세요.";
    if (error.status === 403) return "최고관리자 계정으로 로그인하세요.";
    if (error.status === 409) return "다른 곳에서 설정이 변경되었습니다. 최신 설정을 불러온 뒤 다시 수정하세요.";
    if (error.status === 422 || error.status === 400) return "입력값과 항목별 범위를 확인하세요. 대기열 한도는 페이지 크기 이상이어야 합니다.";
    if (error.status === 429) return "요청이 잠시 제한되었습니다. 조금 뒤 다시 시도하세요.";
    if (error.status === 503) return "서버 또는 데이터베이스가 아직 준비되지 않았습니다. 서버 개요에서 상태를 확인하세요.";
    return "요청을 완료하지 못했습니다. 서버 연결을 확인한 뒤 다시 시도하세요.";
  }
  function message(id, text, type = "") {
    const node = $(id); node.replaceChildren(); node.hidden = !text;
    node.className = id === "login-message" ? "form-message" : `notice ${type}`;
    if (text) node.append(element("span", "", text));
  }
  function refreshed() { $("last-refreshed").textContent = `최근 확인 · ${date(Date.now())}`; }
  async function api(path, options = {}) {
    const generation = state.generation;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`/v1/server-admin${path}`, {
        method: options.method || "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "X-Auth-Request": "1", ...(options.body ? { "Content-Type": "application/json" } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
      if (generation !== state.generation) throw new ApiError(0, "session_changed");
      if (!response.ok) {
        if ((response.status === 401 || response.status === 403) && state.user) showLogin("관리자 인증이 만료되었거나 권한이 변경되었습니다. 다시 로그인하세요.");
        throw new ApiError(response.status, typeof payload.detail === "string" ? payload.detail : payload.detail?.code || "");
      }
      return payload;
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(0, "connection_failed"); }
    finally { window.clearTimeout(timer); }
  }
  function showLogin(text = "") {
    window.clearTimeout(controlTimer); controlTimer = null; controlBusy = false; controlDisconnected = false; processState = null;
    message("process-message", ""); $("process-job-result").replaceChildren();
    window.clearTimeout(operationTimer); operationTimer = null; operationActive = false; operationSubmitting = false;
    state.runInitialized = false; state.runPresets = null;
    $("operation-result").replaceChildren(); message("operation-message", "");
    $("run-readiness").replaceChildren(); $("schedule-status").textContent = "자동 수집 상태를 불러오는 중";
    $("schedule-detail").textContent = "Windows 작업 스케줄러로 10분마다 실행합니다.";
    $("schedule-enable").hidden = true; $("schedule-remove").hidden = true;
    state.generation += 1; state.user = null; state.settings = null; state.overview = null; state.saving = false; controls.clear();
    $("console-screen").hidden = true; $("login-screen").hidden = false;
    $("password").value = ""; $("password").type = "password";
    $("toggle-password").setAttribute("aria-pressed", "false"); $("toggle-password").setAttribute("aria-label", "비밀번호 표시");
    $("account-name").textContent = "";
    for (const id of ["overview-content", "collection-content", "settings-content"]) $(id).replaceChildren();
    message("global-message", ""); message("settings-message", ""); message("login-message", text);
    $("settings-savebar").hidden = true;
  }
  async function showConsole(user) {
    if (!user || user.admin_role !== "superadmin") { showLogin("최고관리자 계정으로 로그인하세요."); return; }
    state.generation += 1; state.user = user;
    $("login-screen").hidden = true; $("console-screen").hidden = false; $("account-name").textContent = user.username || "관리자";
    $("password").value = ""; message("login-message", ""); selectView("overview", false);
    loading($("overview-content"));
    const results = await Promise.allSettled([api("/overview"), api("/settings")]);
    if (!state.user) return;
    if (results[1].status === "fulfilled") { state.settings = results[1].value; renderSettings(); }
    else settingsError(results[1].reason);
    if (results[0].status === "fulfilled") { state.overview = results[0].value; renderOverview(); refreshed(); }
    else showError($("overview-content"), results[0].reason);
  }
  function loading(container) { const node = element("div", "loading-state"); node.append(element("span", "spinner"), document.createTextNode("불러오는 중입니다")); container.replaceChildren(node); }
  function empty(container, title, description) { const node = element("div", "empty-state"); node.append(icon("layers"), element("h3", "", title), element("p", "", description)); container.replaceChildren(node); }
  function showError(container, error) { const text = errorMessage(error); if (text && state.user) empty(container, "정보를 불러오지 못했습니다", text); }
  function settingsError(error) { showError($("settings-content"), error); if (state.user && error.code !== "session_changed") { const button = element("button", "button button-secondary", "설정 다시 불러오기"); button.type = "button"; button.addEventListener("click", loadSettings); const target = $("settings-content").querySelector(".empty-state"); if (target) target.append(button); } }
  function badge(text, type = "") { return element("span", `badge ${type}`, text); }
  function panel(title, description = "") { const node = element("section", "panel"); const heading = element("div", "panel-heading"); const titles = element("div"); titles.append(element("h2", "", title)); if (description) titles.append(element("p", "", description)); heading.append(titles); const body = element("div", "panel-content"); node.append(heading, body); return { node, heading, body }; }
  function statusRow(container, label, detail, text, type = "") { const row = element("div", "status-row"); const name = element("span", "status-label", label); if (detail) name.append(element("small", "", detail)); row.append(name, badge(text, type)); container.append(row); }
  function metric(label, value, caption, iconName, emphasis = false) { const node = element("div", `metric-card${emphasis ? " emphasis" : ""}`); const symbol = element("span", "metric-icon"); symbol.append(icon(iconName)); node.append(element("div", "metric-label", label), symbol, element("div", `metric-value${typeof value === "string" && value.length > 4 ? " word-value" : ""}`, value), element("div", "metric-caption", caption)); return node; }
  function tickBanner(tick, available = true) {
    const node = element("div", "tick-banner"); const symbol = element("span", "tick-symbol"); symbol.append(icon("layers")); const text = element("div");
    if (!available) { text.append(element("strong", "", "수집 상태를 확인하려면 데이터베이스 연결이 필요합니다."), element("p", "", "서버 설정에서 MySQL 연결을 설정하고 서버를 재시작하세요.")); }
    else if (!tick) { text.append(element("strong", "", "아직 저장된 수집 실행 기록이 없습니다."), element("p", "", "스케줄이 실행되면 처리 결과가 이곳에 표시됩니다.")); }
    else { text.append(element("strong", "", `최근 실행 · ${statusLabels[tick.status] || "상태 확인"}`), element("p", "", `신규 ${number(tick.new ?? 0)}건 · 변경 ${number(tick.changed ?? 0)}건 · 동일 ${number(tick.unchanged ?? 0)}건 · 완료 작업 ${number(tick.jobs_completed ?? 0)}건`)); }
    node.append(symbol, text); if (tick) node.append(badge(`HTTP ${number(tick.http_calls ?? 0)} · 모델 ${number(tick.model_calls ?? 0)}`, tick.status === "failed" ? "error" : "")); return node;
  }
  function currentKoreanDay() { const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
  function quotaPanel(collection) {
    const item = panel("오늘의 호출 사용량", "한국 시간 자정 기준 · 설정한 일일 한도");
    const values = state.settings?.values || {}; const today = currentKoreanDay();
    for (const provider of ["bokjiro", "gov24", "notice", "model"]) {
      const limitKey = provider === "model" ? "ingestion_daily_model_calls" : `ingestion_daily_${provider}_calls`;
      const limit = values[limitKey]; const usage = (collection.usage || []).find((row) => row.provider === provider && String(row.day).slice(0, 10) === today);
      const used = usage?.calls ?? 0; const row = element("div", "quota-item"); const line = element("div", "quota-line"); const value = element("span", "quota-value");
      value.append(element("strong", "", collection.available === false ? "—" : number(used)), document.createTextNode(` / ${number(limit)}회`)); line.append(element("span", "", providerLabels[provider]), value);
      const progress = element("progress", `quota-progress${limit && used / limit >= .8 ? " warn" : ""}`); progress.max = Math.max(Number(limit) || 1, 1); progress.value = collection.available === false ? 0 : Math.min(used, progress.max); progress.setAttribute("aria-label", `${providerLabels[provider]} 호출 사용량`); row.append(line, progress); item.body.append(row);
    }
    item.body.append(element("p", "quota-note", "실제 공공 API 계정의 허용량은 공급자에서 확인하세요. 모델 토큰은 보고된 사용량을 기준으로 제한합니다.")); return item.node;
  }
  function renderOverview() {
    const data = state.overview; if (!data) return;
    const server = data.server || {}, database = data.database || {}, collection = data.collection || {}, resources = data.resources || {}, jobs = collection.jobs || {};
    $("environment-label").textContent = { development: "개발 환경", production: "운영 환경", test: "테스트 환경" }[server.app_env] || "서버 환경";
    const container = $("overview-content"); container.replaceChildren();
    const metrics = element("div", "metric-grid"); metrics.append(metric("서버 가동 시간", duration(server.uptime_seconds), `시작 · ${date(server.started_at)}`, "server", true), metric("대기 중인 작업", collection.available ? number(jobs.pending || 0) : "—", `처리 중 ${collection.available ? number(jobs.running || 0) : "—"}건`, "layers"), metric("사용 가능 메모리", resources.available_memory_mb == null ? "—" : `${number(Math.round(resources.available_memory_mb))} MB`, "현재 서버의 남은 메모리", "grid"), metric("남은 디스크", resources.free_disk_mb == null ? "—" : `${number(Math.round(resources.free_disk_mb / 1024))} GB`, "수집 원문 저장 공간", "server")); container.append(metrics, tickBanner(collection.state?.last_tick, collection.available));
    const grid = element("div", "overview-grid"); const readiness = panel("서버 준비 상태", "현재 실행 중인 서버의 연결 상태입니다.");
    statusRow(readiness.body, "백엔드 서버", `${server.host || ""}${server.port ? ` : ${server.port}` : ""}`, "실행 중");
    statusRow(readiness.body, "MySQL 데이터베이스", database.enabled ? "수집 이력과 공고 저장" : "연결 설정이 비활성 상태입니다.", statusLabels[database.status] || "확인 필요", database.status === "reachable" ? "" : database.status === "disabled" ? "muted" : "error");
    statusRow(readiness.body, "수집 저장소", "대기열, 체크포인트, 중복 확인", collection.available ? "준비됨" : "설정 확인", collection.available ? "" : "warn");
    statusRow(readiness.body, "관리자 인증 저장소", server.auth_database === "mysql" ? "MySQL 계정 저장소" : "로컬 계정 저장소", server.auth_database === "mysql" ? "MySQL" : "SQLite", "muted");
    const pending = data.configuration?.restart_required || []; if (pending.length) statusRow(readiness.body, "재시작 적용 대기", "저장한 DB 설정은 서버 재시작 후 반영됩니다.", `${pending.length}개 설정`, "warn");
    grid.append(readiness.node, quotaPanel(collection)); container.append(grid);
  }
  async function loadOverview() {
    if (!state.user) return; $("refresh-overview").disabled = true;
    try { state.overview = await api("/overview"); if (!state.user) return; renderOverview(); refreshed(); message("global-message", ""); }
    catch (error) { if (state.user) message("global-message", errorMessage(error), "error"); }
    finally { $("refresh-overview").disabled = false; }
  }
  function table(headers, rows) { const wrap = element("div", "table-wrap"); const node = element("table", "data-table"); const head = element("thead"), tr = element("tr"); for (const name of headers) { const cell = element("th", "", name); cell.scope = "col"; tr.append(cell); } head.append(tr); const body = element("tbody"); for (const values of rows) { const row = element("tr"); for (const value of values) { const cell = element("td"); if (value instanceof Node) cell.append(value); else cell.textContent = String(value ?? "—"); row.append(cell); } body.append(row); } node.append(head, body); wrap.append(node); return wrap; }
  function detailList(pairs) { const list = element("ul", "detail-list"); for (const [key, value] of pairs) { const row = element("li"); row.append(element("span", "", key), element("span", "", value)); list.append(row); } return list; }
  function renderCollectionStatus(data) {
    const container = $("collection-content"); container.replaceChildren(); const jobs = data.jobs || {}; const metrics = element("div", "metric-grid");
    for (const [key, label, description] of [["pending", "대기 작업", "처리 순서를 기다리는 작업"], ["running", "처리 중", "현재 진행 중인 작업"], ["done", "완료 작업", "저장까지 완료한 작업"], ["dead", "재확인 필요", "최대 시도 횟수에 도달한 작업"]]) metrics.append(metric(label, number(jobs[key] || 0), description, key === "dead" ? "sliders" : "layers", key === "pending"));
    container.append(metrics, tickBanner(data.state?.last_tick));
    const cursors = Object.entries(data.state || {}).filter(([key]) => key !== "last_tick" && key !== "worker" && key !== "scan_offset" && !key.startsWith("blocked:"));
    if (cursors.length) { const section = panel("수집 위치", "중단되더라도 저장된 위치부터 이어서 처리합니다."); section.body.replaceChildren(table(["수집 범위", "다음 페이지", "다음 확인", "상태"], cursors.map(([key, value]) => [providerLabels[key] || key.replace(/^scan:/, ""), value?.page ?? "—", date(value?.next_due ?? value?.next_due_at), value?.last_error ? badge("오류 확인", "warn") : badge("저장됨", "muted")]))); container.append(section.node); }
    const failures = data.failures || []; const section = panel("최근 오류 작업", "원인 확인이 필요한 작업을 최대 20건까지 표시합니다.");
    if (failures.length) section.body.replaceChildren(table(["공고 / 작업", "종류", "상태", "시도", "오류 코드"], failures.map((row) => [row.policy_key || row.job_id, { parse: "분석", notice: "원문 수집", bokjiro_detail: "상세 수집" }[row.kind] || row.kind, badge(statusLabels[row.status] || row.status, row.status === "dead" ? "error" : "warn"), number(row.attempts), element("span", "mono", row.error_code || "—")])));
    else empty(section.body, "현재 표시할 오류 작업이 없습니다.", "작업 오류가 발생하면 상태와 오류 코드가 이곳에 표시됩니다."); container.append(section.node);
  }
  function renderChanges(items) {
    const section = panel("공고 변경 이력", "수집한 내용이 실제로 달라진 공고의 최근 이력입니다.");
    if (!items.length) empty(section.body, "아직 확인된 변경 이력이 없습니다.", "기존 공고의 내용이 바뀌면 변경된 항목과 확인 시간이 표시됩니다.");
    else section.body.replaceChildren(table(["공고", "변경된 항목", "확인 시간"], items.map((row) => { const fields = element("div"); for (const value of row.changed_fields || []) fields.append(element("span", "code-chip", value)); return [element("strong", "", row.policy_key), fields, date(row.observed_at)]; })));
    $("collection-content").replaceChildren(section.node);
  }
  function safeLink(url, title) { try { const parsed = new URL(url); if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return element("strong", "", title); const link = element("a", "text-link", title); link.href = parsed.href; link.target = "_blank"; link.rel = "noopener noreferrer"; link.append(icon("link")); return link; } catch { return element("strong", "", title); } }
  function renderCandidates(items) {
    const section = panel("외부 공고 후보", "검색 결과의 후보입니다. 원문과 기존 공고를 검토한 뒤 수집 대상으로 등록하세요.");
    if (!items.length) empty(section.body, "아직 저장된 검색 후보가 없습니다.", "외부 검색을 활성화하고 스케줄이 실행되면 후보가 저장됩니다.");
    else section.body.replaceChildren(table(["검색 후보", "기관 / 지역", "검토 상태", "기존 공고 유사 후보", "최근 확인"], items.map((row) => { const candidate = row.candidate_json || row; const title = element("div"); title.append(safeLink(row.url || candidate.url, candidate.title || "제목 없음")); if (candidate.reason) title.append(element("span", "secondary-text", candidate.reason)); const owner = element("div", "", candidate.organization || "기관 미확인"); owner.append(element("span", "secondary-text", candidate.region || "지역 미확인")); const matches = element("div"); for (const key of row.possible_matches || []) matches.append(element("span", "code-chip", key)); if (!matches.childNodes.length) matches.textContent = "표시할 후보 없음"; return [title, owner, badge(statusLabels[row.status] || "검토 대기", row.status === "queued" ? "" : "warn"), matches, date(row.last_seen_at)]; })));
    $("collection-content").replaceChildren(section.node);
  }
  async function loadCollection() {
    if (!state.user) return; const tab = state.collectionTab; loading($("collection-content")); $("refresh-collection").disabled = true;
    try { const data = await api(`/collection/${tab}`); if (!state.user || state.collectionTab !== tab) return; if (tab === "status") renderCollectionStatus(data); else if (tab === "changes") renderChanges(data.items || []); else renderCandidates(data.items || []); refreshed(); }
    catch (error) { if (state.collectionTab === tab) showError($("collection-content"), error); }
    finally { $("refresh-collection").disabled = false; }
  }
  function normalizeKind(kind) { return { bool: "boolean", int: "integer", float: "number", str: "string", list: "array", domains: "array", password: "secret" }[kind] || kind || "string"; }
  function settingField(field, values, configured, overrides) {
    const name = field.name, kind = normalizeKind(field.kind), wrapper = element("div", `field${kind === "array" || name === "ingestion_discovery_query" ? " wide" : ""}`), label = element("label", "", field.label || name); label.htmlFor = `setting-${name}`; label.append(element("span", "setting-key", field.env_name || name.toUpperCase())); wrapper.append(label);
    const readOnly = overrides.includes(name); let input;
    if (kind === "boolean") { const box = element("div", "toggle-field"), text = element("span", "", values[name] ? "사용" : "사용 안 함"); input = element("input", "toggle"); input.type = "checkbox"; input.checked = Boolean(values[name]); input.addEventListener("change", () => { text.textContent = input.checked ? "사용" : "사용 안 함"; }); box.append(text, input); wrapper.append(box); }
    else if (field.options?.length) { input = element("select"); for (const option of field.options) { const value = typeof option === "object" ? option.value : option; const node = element("option", "", typeof option === "object" ? option.label || value : value); node.value = value; input.append(node); } input.value = values[name] ?? ""; wrapper.append(input); }
    else if (kind === "array") { input = element("textarea"); input.rows = 3; input.value = Array.isArray(values[name]) ? values[name].join("\n") : ""; wrapper.append(input); }
    else { input = element("input"); input.type = kind === "secret" ? "password" : ["integer", "number"].includes(kind) ? "number" : "text"; input.value = kind === "secret" ? "" : values[name] ?? ""; input.autocomplete = kind === "secret" ? "new-password" : "off"; input.spellcheck = false; if (kind === "secret") input.placeholder = configured[name] ? "등록된 값 유지 · 교체할 때만 입력" : "새 값 입력"; if (field.minimum != null) input.min = field.minimum; if (field.maximum != null) input.max = field.maximum; if (kind === "integer") input.step = "1"; if (kind === "number") input.step = "any"; wrapper.append(input); }
    input.id = `setting-${name}`; input.name = name; input.disabled = readOnly;
    const description = element("p", "field-description", field.description || descriptions[name] || (["integer", "number"].includes(kind) && field.minimum != null ? `설정 범위: ${number(field.minimum)} ~ ${number(field.maximum)}` : "")); description.id = `hint-${name}`; input.setAttribute("aria-describedby", description.id); wrapper.append(description);
    let clear;
    if (kind === "secret") { const info = element("span", "secret-status"); info.append(icon(configured[name] ? "check" : "lock"), document.createTextNode(configured[name] ? "값이 등록되어 있습니다. 기존 값은 표시하지 않습니다." : "등록된 값이 없습니다.")); wrapper.append(info); if (configured[name]) { const clearLabel = element("label", "secret-clear"); clear = element("input"); clear.type = "checkbox"; clear.disabled = readOnly; clear.id = `clear-${name}`; clearLabel.htmlFor = clear.id; clearLabel.append(clear, document.createTextNode("저장된 값 삭제")); wrapper.append(clearLabel); clear.addEventListener("change", () => { input.disabled = clear.checked || readOnly; if (clear.checked) input.value = ""; updateDirty(); }); } }
    if (field.restart_required) wrapper.append(badge("재시작 후 적용", "muted")); if (readOnly) wrapper.append(badge("환경변수로 지정 · 읽기 전용", "muted"));
    controls.set(name, { field, kind, input, clear, readOnly }); input.addEventListener("input", updateDirty); input.addEventListener("change", updateDirty); return wrapper;
  }
  function renderSettings() {
    const data = state.settings; if (!data) return; controls.clear(); const container = $("settings-content"); container.replaceChildren(); $("settings-revision").textContent = `설정 · ${(data.revision || "").slice(0, 8)}`;
    const groups = new Map(); for (const field of data.fields || []) {
      let key = field.group || "설정";
      if (field.name.startsWith("ingestion_daily_")) key = "quota";
      else if (field.name.startsWith("ingestion_discovery_")) key = "discovery";
      else if (field.name.startsWith("ingestion_min_")) key = "resources";
      else if (["ingestion_scan_interval_seconds", "ingestion_recheck_seconds"].includes(field.name)) key = "scheduling";
      else if (field.name === "policy_auto_publish") key = "publication";
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(field);
    }
    for (const [group, fields] of groups) { const [title, description] = groupLabels[group] || [group, "서버에 저장된 설정을 확인하고 수정합니다."]; const section = panel(title, description); section.node.classList.add("settings-panel"); const grid = element("div", "settings-grid"); for (const field of fields) grid.append(settingField(field, data.values || {}, data.secret_configured || {}, data.env_overrides || [])); section.body.replaceWith(grid); container.append(section.node); }
    if (!groups.size) empty(container, "편집 가능한 설정이 없습니다.", "서버의 설정 구성을 확인하세요."); updateDirty();
  }
  function fieldValue(control) { if (control.kind === "secret") return control.clear?.checked ? "" : control.input.value; if (control.kind === "boolean") return control.input.checked; if (control.kind === "array") return control.input.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean); if (["integer", "number"].includes(control.kind)) return control.input.value.trim() === "" ? null : Number(control.input.value); return control.input.value; }
  function changes() { const result = {}; if (!state.settings) return result; for (const [name, control] of controls) { if (control.readOnly) continue; const value = fieldValue(control); if (control.kind === "secret") { if (control.clear?.checked || value !== "") result[name] = value; } else if (JSON.stringify(value) !== JSON.stringify(state.settings.values[name])) result[name] = value; } return result; }
  function updateDirty() { const count = Object.keys(changes()).length; $("settings-savebar").hidden = !state.settings; $("dirty-count").textContent = state.saving ? "설정 저장 중" : count ? `${count}개 설정 변경` : "변경 없음"; $("save-settings").disabled = state.saving || count === 0; $("reset-settings").disabled = state.saving || count === 0; }
  function setSaving(saving) { state.saving = saving; for (const control of controls.values()) { control.input.disabled = saving || control.readOnly || Boolean(control.clear?.checked); if (control.clear) control.clear.disabled = saving || control.readOnly; } updateDirty(); }
  async function loadSettings() {
    if (!state.user) return; loading($("settings-content"));
    try { state.settings = await api("/settings"); if (!state.user) return; renderSettings(); refreshed(); message("settings-message", ""); }
    catch (error) { settingsError(error); }
  }
  async function saveSettings(event) {
    event.preventDefault(); if (!state.user || !state.settings || state.saving) return;
    if (!$("settings-form").reportValidity()) return; const changed = changes(); if (!Object.keys(changed).length) return;
    if (Object.values(changed).some((value) => value === null || typeof value === "number" && !Number.isFinite(value))) { message("settings-message", "숫자 항목에 올바른 값을 입력하세요.", "error"); return; }
    setSaving(true); message("settings-message", "");
    try { const data = await api("/settings", { method: "PATCH", body: { revision: state.settings.revision, changes: changed } }); if (!state.user) return; state.settings = data; renderSettings(); const pending = data.restart_fields || (Array.isArray(data.restart_required) ? data.restart_required : []); message("settings-message", pending.length ? `설정을 저장했습니다. ${pending.length}개 항목은 서버 재시작 후 적용됩니다. 수집·모델 설정은 다음 작업부터 반영됩니다.` : "설정을 저장했습니다. 변경된 수집·모델 설정은 다음 작업부터 반영됩니다."); refreshed(); if (state.overview) renderOverview(); }
    catch (error) { if (state.user) { message("settings-message", errorMessage(error), "error"); if (error.status === 409) { const reload = element("button", "button button-secondary", "최신 설정 불러오기"); reload.type = "button"; reload.addEventListener("click", loadSettings); $("settings-message").append(reload); } } }
    finally { setSaving(false); }
  }
  const operationNames = { check: "DB 준비 확인", tick: "공고 수집", seed: "기존 공고 연결", "schedule-enable": "자동 수집 등록", "schedule-remove": "자동 수집 해제" };
  const operationReasons = { collection_disabled: "새 수집 회차가 꺼져 있습니다.", another_worker: "다른 수집 작업이 실행 중입니다. 완료 후 다시 실행하세요.", operation_failed: "작업을 완료하지 못했습니다. DB 연결, 모델 로그인 또는 Windows 작업 권한을 확인하세요.", http_calls: "HTTP 호출 한도에 도달했습니다.", model_calls: "모델 호출 한도에 도달했습니다.", tokens: "토큰 한도에 도달했습니다.", deadline: "이번 회차의 제한 시간이 지났습니다.", memory: "사용 가능한 메모리가 부족합니다.", disk: "저장 공간이 부족합니다." };
  function updateOperationButtons() {
    for (const button of document.querySelectorAll("[data-operation], #run-submit")) button.disabled = operationActive || operationSubmitting;
  }
  function renderOperation(operation) {
    const container = $("operation-result"); container.replaceChildren(); operationActive = operation?.status === "running";
    updateOperationButtons();
    if (!operation) { empty(container, "첫 수집을 시작해 보세요", "DB 준비를 확인하고 원문 수집부터 실행하세요. 실행 결과는 이곳에 표시됩니다."); return; }
    const result = operation.result || {}, running = operationActive;
    const header = element("div", "operation-result-heading"); header.append(element("strong", "", operationNames[operation.action] || "수집 작업"), badge(running ? "실행 중" : statusLabels[result.status] || ({ database_ready: "DB 준비 완료" }[result.status]) || "작업 종료", operation.status === "failed" || result.error_count ? "warn" : "")); container.append(header);
    container.append(element("p", "operation-caption", `${date(operation.started_at)} 시작${operation.finished_at ? ` · ${date(operation.finished_at)} 종료` : " · 완료될 때까지 자동으로 상태를 확인합니다."}`));
    if (running) { const line = element("p", "operation-running"); line.append(element("span", "spinner"), document.createTextNode("서버가 작업을 처리하고 있습니다. 다른 메뉴를 살펴봐도 작업은 계속됩니다.")); container.append(line); return; }
    const metrics = element("div", "operation-result-grid");
    for (const [key, label] of [["new", "신규 원문"], ["changed", "변경 원문"], ["jobs_completed", "완료 작업"], ["http_calls", "HTTP 호출"], ["model_calls", "모델 호출"], ["tokens", "보고된 토큰"], ["error_count", "발생 오류"], ["indexed", "연결 공고"]]) {
      if (result[key] != null && (key !== "error_count" || result[key])) { const item = element("div"); item.append(element("span", "", label), element("strong", "", number(result[key]))); metrics.append(item); }
    }
    if (metrics.childNodes.length) container.append(metrics);
    if (result.reason) container.append(element("p", "operation-caption", operationReasons[result.reason] || "이번 회차가 제한 또는 준비 상태에 따라 종료되었습니다. 수집 현황에서 세부 상태를 확인하세요."));
    if (result.status === "database_ready") container.append(element("p", "operation-caption", `MySQL과 수집 테이블 연결을 확인했습니다. 복지로 키 ${result.bokjiro_key_configured ? "등록" : "미등록"} · 정부24 키 ${result.gov24_key_configured ? "등록" : "미등록"}. 실제 API 응답과 Codex 로그인은 수집 실행에서 확인합니다.`));
    if (result.complete === false) container.append(element("p", "operation-caption", "아직 연결할 공고가 남아 있습니다. 기존 공고 연결을 다시 실행하면 이어서 처리합니다."));
    if (operation.action === "tick" && !result.model_calls) container.append(element("p", "operation-caption", "원문 수집과 AI 분석은 단계별로 진행됩니다. 대기 작업은 다음 분석 회차에서 이어서 처리합니다."));
    if (result.schedule) renderSchedule(result.schedule);
  }
  function refreshRunSummary() {
    const mode = $("run-mode").value, calls = Number($("run-max_model_calls").value) || 0;
    $("run-summary").textContent = mode === "raw" ? "공공 API 목록만 수집합니다. AI 분석과 외부 검색은 실행하지 않습니다." : mode === "analysis" ? `대기 중인 상세·분석 작업을 최대 ${$("run-max_jobs").value}개 처리합니다. 모델은 최대 ${calls}회 호출하며 다음 회차에서 이어갈 수 있습니다.` : `직접 입력한 한도로 수집합니다. 모델 최대 ${calls}회 · 외부 검색은 저장된 서버 설정을 따릅니다.`;
    for (const key of ["max_jobs", "max_model_calls", "max_tokens"]) $("run-" + key).disabled = mode === "raw";
  }
  function applyRunPreset(mode) {
    const preset = state.runPresets?.[mode];
    if (preset) for (const key of runFields) $("run-" + key).value = preset[key];
    if (mode === "custom" && state.settings) for (const key of runFields) $("run-" + key).value = Math.min(key === "max_seconds" ? 600 : Infinity, state.settings.values["ingestion_" + key] ?? $("run-" + key).value);
    refreshRunSummary();
  }
  function renderRunReadiness() {
    const settings = state.settings, values = settings?.values || {};
    const container = $("run-readiness"); container.replaceChildren();
    container.append(badge(values.db_enabled ? "MySQL 사용" : "MySQL 설정 필요", values.db_enabled ? "" : "warn"), badge(values.ingestion_enabled ? "수집 허용" : "수집 꺼짐", values.ingestion_enabled ? "" : "warn"), badge(values.policy_auto_publish ? "검증 통과 후 자동 공개" : "검토용 초안 저장", "muted"));
    $("run-publication-note").textContent = values.policy_auto_publish ? "현재 설정: 검증을 통과한 새 공고가 자동 공개됩니다." : "현재 설정: 분석 결과를 초안으로 저장합니다.";
    if (settings?.restart_fields?.length) container.append(badge("DB 변경 · 재시작 필요", "warn"));
  }
  async function loadOperations() {
    if (!state.user || operationLoading) return;
    operationLoading = true; window.clearTimeout(operationTimer); $("refresh-operations").disabled = true;
    try {
      const data = await api("/operations"); if (!state.user) return;
      const previous = operationActive; state.runPresets = data.presets;
      renderOperation(data.operation); renderRunReadiness(); refreshed();
      if (!state.runInitialized) { applyRunPreset($("run-mode").value); state.runInitialized = true; }
      if (previous && !operationActive && state.view === "operations") loadSchedule();
    } catch (error) { if (state.user) message("operation-message", errorMessage(error), "error"); }
    finally { operationLoading = false; $("refresh-operations").disabled = false; if (state.user && state.view === "operations") operationTimer = window.setTimeout(loadOperations, operationActive ? 2000 : 10000); }
  }
  function renderSchedule(data) {
    const labels = { NotInstalled: "자동 수집이 등록되지 않았습니다", Ready: "자동 수집 대기 중", Running: "자동 수집 실행 중", Disabled: "자동 수집 비활성", unsupported: "Windows 서버에서 사용할 수 있습니다" };
    $("schedule-status").textContent = labels[data.state] || "자동 수집 상태를 확인하세요";
    $("schedule-detail").textContent = data.enabled ? "10분마다 실행 · 로그인 유지 · AC 전원 · MySQL 실행 필요" : data.state === "NotInstalled" ? "등록하면 현재 저장된 서버 설정으로 10분마다 처리합니다." : "상태를 확인한 뒤 자동 수집을 등록하거나 해제하세요.";
    $("schedule-enable").hidden = data.supported === false || data.state !== "NotInstalled";
    $("schedule-remove").hidden = data.supported === false || data.state === "NotInstalled";
  }
  async function loadSchedule() {
    if (!state.user) return; $("refresh-schedule").disabled = true;
    try { const data = await api("/schedule"); if (state.user) renderSchedule(data); }
    catch (error) { if (state.user) { $("schedule-status").textContent = "자동 수집 상태를 확인하지 못했습니다"; $("schedule-detail").textContent = errorMessage(error); $("schedule-enable").hidden = true; $("schedule-remove").hidden = true; } }
    finally { $("refresh-schedule").disabled = false; }
  }
  async function startOperation(action) {
    if (!state.user || operationSubmitting || operationActive) return;
    if (Object.keys(changes()).length) { message("operation-message", "서버 설정에 저장하지 않은 변경이 있습니다. 설정을 저장하거나 취소한 뒤 실행하세요.", "warn"); return; }
    const body = { action };
    if (action === "tick") {
      if (!$("run-form").reportValidity()) return;
      body.mode = $("run-mode").value;
      for (const key of runFields) body[key] = Number($("run-" + key).value);
      if (body.mode === "raw") body.max_jobs = body.max_model_calls = body.max_tokens = 0;
    }
    operationSubmitting = true; updateOperationButtons(); message("operation-message", "");
    try { const data = await api("/operations", { method: "POST", body }); if (!state.user) return; renderOperation(data.operation); message("operation-message", `${operationNames[action]}을 시작했습니다.`); loadOperations(); }
    catch (error) { if (state.user) { message("operation-message", errorMessage(error), "error"); loadOperations(); } }
    finally { operationSubmitting = false; updateOperationButtons(); }
  }
  const processTargets = { backend: "백엔드", frontend: "프론트", all: "백엔드와 프론트" };
  function updateProcessButtons() {
    for (const button of document.querySelectorAll("[data-process-target]")) {
      const target = button.dataset.processTarget;
      const allowed = processState?.supported && processState.mode !== "unmanaged" && processState.mode !== "unsupported";
      button.disabled = controlBusy || controlDisconnected || !allowed || target === "frontend" && button.dataset.processAction === "stop" && !processState?.frontend?.running;
    }
  }
  function renderProcessJob(job) {
    const container = $("process-job-result"); container.replaceChildren(); if (!job) return;
    const labels = { accepted: "접수 완료", running: "처리 중", completed: "완료", failed: "실패" };
    container.append(element("strong", "", `${processTargets[job.target] || "서비스"} ${job.action === "restart" ? "재시작" : "종료"} · ${labels[job.status] || "상태 확인"}`), element("p", "operation-caption", `${date(job.started_at)} 요청${job.finished_at ? ` · ${date(job.finished_at)} 종료` : ""}`));
    if (job.status === "failed") {
      const errors = { process_identity_changed: "실행 프로세스가 바뀌어 작업을 중단했습니다. 상태를 새로 확인하세요.", startup_failed: "다시 실행한 서비스가 준비되지 않았습니다. 서버 실행 로그와 포트 사용 여부를 확인하세요.", runtime_missing: "실행 파일 또는 프론트 의존성이 없습니다. 서버 환경을 확인하세요.", configuration_invalid: "운영 프론트 설정을 확인해 주세요.", unmanaged_runtime: "프로젝트 실행 BAT로 서버를 시작한 뒤 사용하세요." };
      container.append(element("p", "operation-caption", errors[job.error_code] || "작업을 완료하지 못했습니다. 서버의 프로세스 제어 로그와 실행 권한을 확인하세요."));
    }
  }
  async function loadProcesses() {
    if (!state.user) return; $("refresh-processes").disabled = true;
    try {
      const data = await api("/processes"); if (!state.user) return;
      processState = data; controlDisconnected = false;
      $("process-mode").textContent = { development: "개발 서버 · Vite 프론트", shared: "운영 서버 · 웹·QR 프론트", unmanaged: "프로젝트 실행기로 시작해 주세요", unsupported: "Windows 서버에서 사용 가능합니다" }[data.mode] || "실행 환경 확인 필요";
      $("process-backend-status").textContent = data.backend?.running ? "실행 중" : "상태 확인 필요";
      $("process-frontend-status").textContent = data.frontend?.running ? "실행 중" : "중지됨";
      renderProcessJob(data.operation); updateProcessButtons(); refreshed();
      if (!controlBusy && ["accepted", "running"].includes(data.operation?.status)) {
        controlBusy = true; updateProcessButtons(); window.clearTimeout(controlTimer);
        pollProcessJob(data.operation, Date.now(), state.generation);
      }
    } catch (error) { if (state.user) message("process-message", errorMessage(error), "error"); }
    finally { $("refresh-processes").disabled = false; }
  }
  async function pollProcessJob(job, started, generation) {
    if (!state.user || state.generation !== generation) return;
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 3000);
    let retry = false;
    try {
      const response = await fetch(`/v1/server-admin/processes/${encodeURIComponent(job.id)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (state.generation !== generation) return;
      if (response.status === 401 || response.status === 403) { showLogin("서버가 다시 연결되었습니다. 관리자 계정으로 로그인하세요."); return; }
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json(); if (state.generation !== generation) return; renderProcessJob(data.operation);
      retry = ["accepted", "running"].includes(data.operation.status);
      if (!retry) {
        controlBusy = false; controlDisconnected = false; updateProcessButtons();
        message("process-message", data.operation.status === "completed" ? `${processTargets[job.target]} ${job.action === "restart" ? "재시작" : "종료"} 작업이 완료되었습니다.` : "작업을 완료하지 못했습니다. 아래 결과를 확인하세요.", data.operation.status === "failed" ? "error" : "");
        loadProcesses();
      }
    } catch {
      if (state.generation !== generation) return;
      controlDisconnected = true; updateProcessButtons();
      if (job.action === "stop" && job.target !== "frontend") {
        controlBusy = false;
        message("process-message", "백엔드 응답이 중단되었습니다. 다시 사용하려면 서버 PC에서 실행 BAT로 서버를 켜 주세요. 처리 결과는 다음 실행 후 확인할 수 있습니다.", "warn");
      } else {
        retry = true; message("process-message", "서비스를 다시 실행하는 중입니다. 백엔드 연결 복구를 기다리고 있습니다.");
      }
    } finally {
      window.clearTimeout(timer);
      if (retry && state.user && state.generation === generation) {
        if (Date.now() - started > 120000) { controlBusy = false; message("process-message", "연결 복구가 지연되고 있습니다. 실행 로그를 확인한 뒤 상태 확인을 눌러 주세요.", "warn"); }
        else controlTimer = window.setTimeout(() => pollProcessJob(job, started, generation), 1500);
      }
    }
  }
  async function startProcessControl(target, action) {
    if (!state.user || controlBusy) return;
    if (Object.keys(changes()).length) { message("process-message", "서버 설정을 먼저 저장하거나 변경을 취소해 주세요.", "warn"); return; }
    const effect = target === "frontend" ? "웹 서비스 연결이 잠시 끊길 수 있습니다." : action === "stop" ? "관리 페이지와 API 연결이 종료됩니다. 다시 켤 때는 서버 PC의 실행 BAT가 필요합니다." : "관리 페이지와 API 연결이 잠시 끊기고, 서버가 준비되면 다시 연결합니다.";
    if (!window.confirm(`${processTargets[target]}를 ${action === "restart" ? "재시작" : "종료"}할까요?\n\n${effect}`)) return;
    controlBusy = true; updateProcessButtons(); message("process-message", "명령을 전달하는 중입니다.");
    try {
      const data = await api("/processes", { method: "POST", body: { target, action } }); if (!state.user) return;
      renderProcessJob(data.operation); message("process-message", `${processTargets[target]} ${action === "restart" ? "재시작" : "종료"} 요청을 전달했습니다.`);
      pollProcessJob(data.operation, Date.now(), state.generation);
    } catch (error) { controlBusy = false; updateProcessButtons(); if (state.user) message("process-message", errorMessage(error), "error"); }
  }
  function selectView(view, load = true) { state.view = view; window.clearTimeout(operationTimer); for (const key of Object.keys(viewLabels)) $(`view-${key}`).hidden = view !== key; for (const button of document.querySelectorAll("[data-view]")) { const active = button.dataset.view === view; button.classList.toggle("active", active); if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); } $("breadcrumb-current").textContent = viewLabels[view]; message("global-message", ""); if (load) { if (view === "overview") loadOverview(); if (view === "processes") loadProcesses(); if (view === "operations") { loadOperations(); loadSchedule(); } if (view === "collection") loadCollection(); if (view === "settings" && !state.settings) loadSettings(); } }

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!$("login-form").reportValidity()) return; const button = $("login-submit"); button.disabled = true; button.querySelector("span").textContent = "로그인 중"; message("login-message", "");
    try { const data = await api("/login", { method: "POST", body: { username: $("username").value.trim(), password: $("password").value } }); await showConsole(data.user); }
    catch (error) { if (!state.user) { message("login-message", errorMessage(error)); $("password").value = ""; } }
    finally { button.disabled = false; button.querySelector("span").textContent = "로그인"; }
  });
  $("toggle-password").addEventListener("click", () => { const visible = $("password").type === "password"; $("password").type = visible ? "text" : "password"; $("toggle-password").setAttribute("aria-pressed", String(visible)); $("toggle-password").setAttribute("aria-label", visible ? "비밀번호 숨기기" : "비밀번호 표시"); });
  $("logout-button").addEventListener("click", async () => { $("logout-button").disabled = true; try { await api("/logout", { method: "POST", body: {} }); showLogin(); $("username").focus(); } catch (error) { if (state.user) message("global-message", errorMessage(error), "error"); } finally { $("logout-button").disabled = false; } });
  for (const button of document.querySelectorAll("[data-view]")) button.addEventListener("click", () => selectView(button.dataset.view));
  for (const button of document.querySelectorAll("[data-process-target]")) button.addEventListener("click", () => startProcessControl(button.dataset.processTarget, button.dataset.processAction));
  $("refresh-processes").addEventListener("click", loadProcesses);
  $("run-mode").addEventListener("change", () => applyRunPreset($("run-mode").value));
  $("run-form").addEventListener("input", refreshRunSummary);
  $("run-form").addEventListener("submit", (event) => { event.preventDefault(); startOperation("tick"); });
  for (const button of document.querySelectorAll("[data-operation]")) button.addEventListener("click", () => startOperation(button.dataset.operation));
  $("refresh-operations").addEventListener("click", loadOperations);
  $("refresh-schedule").addEventListener("click", loadSchedule);
  $("open-run-settings").addEventListener("click", () => selectView("settings"));
  for (const button of document.querySelectorAll("[data-collection]")) button.addEventListener("click", () => { state.collectionTab = button.dataset.collection; for (const item of document.querySelectorAll("[data-collection]")) { const active = item === button; item.classList.toggle("active", active); item.setAttribute("aria-selected", String(active)); } $("collection-content").setAttribute("aria-labelledby", button.id); loadCollection(); });
  document.querySelector(".tab-bar").addEventListener("keydown", (event) => { const tabs = [...document.querySelectorAll("[data-collection]")]; const current = tabs.indexOf(document.activeElement); if (current < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; tabs[next].focus(); tabs[next].click(); });
  $("refresh-overview").addEventListener("click", loadOverview); $("refresh-collection").addEventListener("click", loadCollection); $("settings-form").addEventListener("submit", saveSettings); $("reset-settings").addEventListener("click", () => { renderSettings(); message("settings-message", ""); });
  window.addEventListener("beforeunload", (event) => { if (Object.keys(changes()).length) { event.preventDefault(); event.returnValue = ""; } });
  api("/session").then((data) => showConsole(data.user)).catch((error) => { if (error.status !== 401) message("login-message", errorMessage(error)); });
})();
