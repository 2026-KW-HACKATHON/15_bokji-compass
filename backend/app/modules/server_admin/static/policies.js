/* Public-policy editing uses the same authenticated console boundary as server settings. */
(() => {
  "use strict";
  window.PolicyEditor = { create({ request, onError }) {
    const $ = (id) => document.getElementById(id);
    const labels = { summary: "화면에 표시할 요약", benefits: "지원 내용 요약", region: "지역 조건 요약", age: "연령·지원 대상 요약", gender: "성별 조건 요약", other: "기타 조건 · 한 줄에 하나", application_period: "신청 기간", application_method: "신청 방법", application_url: "신청 링크", contact: "문의처", published_date: "공고 게시일", modified_date: "공고 수정일" };
    const rawLabels = { text: "공고 본문", purpose_summary: "사업 목적·설명 원문", eligibility: "지원 대상 원문", selection: "선정 기준 원문", benefits: "지원 내용 원문", application_period: "신청 기간 원문", application_method: "신청 방법 원문", application_url: "신청 링크 원문", contact: "문의처 원문", documents: "제출 서류 원문" };
    const statuses = { published: "공개 중", raw: "원문 확보", listing: "상세 수집 대기", draft: "초안", reviewed: "검토 완료", rejected: "제외" };
    let current = null, dirty = false, saving = false, next = null, cursors = ["0"], sequence = 0, listSequence = 0;
    const inputs = new Map(), rawInputs = new Map();
    function node(tag, cls = "", text = "") { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; }
    function button(text, fn, cls = "button button-secondary") { const b = node("button", cls, text); b.type = "button"; b.addEventListener("click", fn); return b; }
    function notice(text, error = false) { const n = $("policy-message"); n.hidden = !text; n.className = `notice${error ? " error" : ""}`; n.textContent = text; }
    function updateDirty() { $("policy-save").disabled = saving || !dirty; $("policy-dirty").textContent = saving ? "저장 중" : dirty ? "저장하지 않은 변경이 있습니다" : "저장된 내용"; }
    function field(container, key, label, value, { textarea = false, options, max = 5000 } = {}) {
      const wrap = node("div", "field"), id = `policy-field-${key}`;
      const name = node("label", "", label); name.htmlFor = id;
      const control = node(options ? "select" : textarea ? "textarea" : "input"); control.id = id;
      if (options) for (const [v, text] of options) { const option = node("option", "", text); option.value = v; control.append(option); }
      else { control.maxLength = max; if (textarea) control.rows = 4; }
      control.value = value ?? "";
      control.addEventListener("input", () => { dirty = true; updateDirty(); });
      wrap.append(name, control); container.append(wrap); inputs.set(key, control); return control;
    }
    function group(title, description, open = true) { const details = node("details", "policy-group"); details.open = open; details.append(node("summary", "", title), node("p", "field-description", description)); const body = node("div", "policy-fields"); details.append(body); $("policy-fields").append(details); return body; }
    function render(record) {
      current = record; dirty = false; inputs.clear(); rawInputs.clear();
      $("policy-edit-form").hidden = false; $("policy-empty").hidden = true;
      $("policy-fields").replaceChildren(); $("policy-title").textContent = record.title;
      $("policy-identity").textContent = `${record.policyKey} · ${statuses[record.reviewStatus] || record.reviewStatus}`;
      const basic = group("기본 정보·공개 설정", "공개로 저장하면 프론트 목록·상세·분류 검색에 반영됩니다. 비공개로 저장하면 공개 목록에서 내려갑니다.");
      field(basic, "title", "공고 제목", record.title, { max: 300 });
      field(basic, "organization", "담당 기관", record.organization, { max: 2000 });
      field(basic, "source_url", "공식 원문 링크", record.source_url, { max: 4000 });
      field(basic, "category", "분류 코드·분야", record.category, { options: record.categories.map((c) => [c, c]) });
      field(basic, "published", "공개 상태", String(record.published), { options: [["true", "공개 · 프론트에 반영"], ["false", "비공개 · 관리자만 확인"]] });
      const display = group("요약·신청 안내", "요약은 관리자 검토 내용으로 저장됩니다. 조건을 확인할 수 없으면 ‘미확정’을 선택하세요.");
      for (const [key, label] of Object.entries(labels)) {
        field(display, key, label, record.display[key], { textarea: true, max: ["application_period", "application_method", "application_url", "contact", "published_date", "modified_date"].includes(key) ? 500 : 5000 });
        if (["region", "age", "gender"].includes(key)) field(display, `${key}_status`, `${label} · 정보 상태`, record.display[`${key}_status`], { options: [["specified", "조건 명시"], ["unrestricted", "제한 없음"], ["unclear", "미확정"], ["not_stated", "원문 미기재"]] });
      }
      const raw = group("공고 원문 전체", "수집 원본 이력은 보존하고 이 공고의 새 개정에 수정 내용을 저장합니다. 원문 항목은 내용을 자르지 않습니다.", false);
      for (const [key, value] of Object.entries(record.fields)) {
        const control = field(raw, `raw-${key}`, rawLabels[key] || key, value, { textarea: true, max: 200000 }); rawInputs.set(key, control);
      }
      const codes = group("조건·상태 코드 편집", "0=조건 없음, 1=조건 있음, 9=미확정. field_key·subject·operator·value·unit·group_id·근거를 함께 검증합니다. 자동 지역 코드는 아래 표준화 결과에서 확인할 수 있습니다.", false);
      const use = field(codes, "edit_analysis", "조건 코드 저장 방식", "false", { options: [["false", "기존 유효 조건 유지 · 원문 변경 시 규칙으로 재구성"], ["true", "아래 조건 JSON을 직접 수정하여 저장"]] });
      const analysis = field(codes, "analysis", "조건·그룹 JSON", JSON.stringify(record.analysis, null, 2), { textarea: true, max: 400000 }); analysis.classList.add("policy-json"); analysis.readOnly = true;
      use.addEventListener("change", () => { analysis.readOnly = use.value !== "true"; });
      const canonical = node("pre", "policy-json-readonly", JSON.stringify(record.canonical, null, 2)); codes.append(node("p", "field-description", "표준화 조건·지역 코드 · 저장 시 조건 JSON으로 다시 계산"), canonical);
      const history = node("div", "policy-history"); history.append(node("h3", "", "최근 수정·분석 이력"));
      for (const h of record.history) history.append(node("p", "", `${new Date(h.createdAt).toLocaleString("ko-KR")} · ${h.manual ? "관리자 수정" : "분석 개정"} · ${statuses[h.status] || h.status}${h.note ? ` · ${h.note}` : ""}`));
      $("policy-fields").append(history);
      $("policy-note").value = "관리자 공고 내용 수정";
      updateDirty();
    }
    async function open(key) {
      if (saving) return;
      if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 이 공고를 다시 불러올까요?")) return;
      const version = ++sequence;
      notice("공고를 불러오는 중입니다.");
      try { const data = await request(`/policies/${encodeURIComponent(key)}`); if (version !== sequence) return; render(data); notice(""); }
      catch (error) { if (version === sequence) notice(onError(error), true); }
    }
    async function load(reset = false) {
      const version = ++listSequence;
      if (reset) cursors = ["0"];
      $("policy-list").textContent = "공고를 불러오는 중입니다.";
      const query = new URLSearchParams({ q: $("policy-search").value.trim(), status: $("policy-status").value, cursor: cursors.at(-1), limit: "20" });
      try {
        const data = await request(`/policies?${query}`); if (version !== listSequence) return; const list = $("policy-list"); list.replaceChildren();
        $("policy-count").textContent = `검색 결과 ${data.total.toLocaleString("ko-KR")}건`; next = data.nextCursor;
        for (const item of data.items) {
          const b = button("", () => open(item.policy_key), "policy-list-item");
          b.append(node("strong", "", item.title || item.policy_key), node("span", "", item.organization || item.policy_key), node("small", "", `${statuses[item.review_status] || item.review_status} · ${item.review_status === "raw" || item.review_status === "listing" ? "미분석" : item.category || "기타"}`));
          b.disabled = item.review_status === "listing"; list.append(b);
        }
        if (!data.items.length) list.append(node("p", "empty-state", "조건에 맞는 공고가 없습니다."));
        $("policy-prev").disabled = cursors.length < 2; $("policy-next").disabled = !next;
      } catch (error) { $("policy-list").textContent = onError(error); }
    }
    async function save(event) {
      event.preventDefault(); if (!current || saving || !dirty) return;
      const get = (key) => inputs.get(key).value;
      const display = Object.fromEntries(Object.keys(current.display).map((key) => [key, get(key)]));
      let analysis = null;
      if (get("edit_analysis") === "true") {
        try { analysis = JSON.parse(get("analysis")); if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) throw new Error(); }
        catch { notice("조건 JSON의 형식을 확인하세요. 조건과 그룹을 포함한 객체가 필요합니다.", true); return; }
      }
      const body = { version: current.version, title: get("title"), organization: get("organization"), source_url: get("source_url") || null, category: get("category"), published: get("published") === "true", display, fields: Object.fromEntries([...rawInputs].map(([key, control]) => [key, control.value])), analysis, note: $("policy-note").value };
      saving = true; updateDirty(); notice("변경 내용을 저장하고 있습니다.");
      const formControls = [...$("policy-edit-form").querySelectorAll("input,textarea,select,button")]; formControls.forEach((c) => { c.disabled = true; });
      try { const saved = await request(`/policies/${encodeURIComponent(current.policyKey)}`, { method: "PATCH", body }); render(saved); notice(saved.published ? "저장했습니다. 공개 공고의 목록·상세·분류가 프론트에 반영됩니다." : "비공개로 저장했습니다. 프론트의 공개 목록에서 제외됩니다."); load(); }
      catch (error) { notice(onError(error), true); if (error.status === 409) $("policy-message").append(button("최신 내용 다시 불러오기", () => open(current.policyKey))); }
      finally { saving = false; formControls.forEach((c) => { c.disabled = false; }); updateDirty(); }
    }
    $("policy-search-form").addEventListener("submit", (event) => { event.preventDefault(); load(true); });
    $("policy-prev").addEventListener("click", () => { cursors.pop(); load(); });
    $("policy-next").addEventListener("click", () => { if (next) { cursors.push(next); load(); } });
    $("policy-reload").addEventListener("click", () => current && open(current.policyKey));
    $("policy-edit-form").addEventListener("submit", save);
    $("policy-note").addEventListener("input", () => { dirty = true; updateDirty(); });
    return { load, isDirty: () => dirty, reset() { sequence += 1; listSequence += 1; current = null; dirty = false; inputs.clear(); rawInputs.clear(); $("policy-fields").replaceChildren(); $("policy-list").replaceChildren(); $("policy-edit-form").hidden = true; $("policy-empty").hidden = false; notice(""); } };
  } };
})();
