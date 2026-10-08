export const KAKAO_CALLBACK = "bokji-compass://auth/callback";
const secret = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

export function callbackValues(value, flow) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("카카오 복귀 주소를 확인할 수 없어요.");
  }
  if (
    url.protocol !== "bokji-compass:" ||
    url.hostname !== "auth" ||
    url.pathname !== "/callback" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !secret(flow) ||
    url.searchParams.getAll("flow").length !== 1 ||
    url.searchParams.get("flow") !== flow ||
    url.searchParams.getAll("code").length > 1 ||
    url.searchParams.getAll("error").length > 1 ||
    [...url.searchParams.keys()].some(
      (key) => !["flow", "code", "error"].includes(key),
    )
  )
    throw new Error(
      "요청한 카카오 로그인과 응답이 일치하지 않아요. 다시 시도해 주세요.",
    );
  const error = url.searchParams.get("error");
  if (error)
    throw new Error(
      error === "cancelled"
        ? "카카오 로그인을 취소했어요."
        : error === "expired"
          ? "카카오 인증이 만료됐어요. 다시 로그인해 주세요."
          : "카카오 인증에 실패했어요. 다시 시도해 주세요.",
    );
  const code = url.searchParams.get("code");
  if (!secret(code)) throw new Error("카카오 인증 코드를 확인할 수 없어요.");
  return code;
}

export function authorizeUrl(value, baseUrl, flow) {
  const expected = new URL(baseUrl + "/v1/mobile/auth/kakao/authorize");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("카카오 인증 주소를 확인할 수 없어요.");
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.get("flow") !== flow ||
    [...url.searchParams.keys()].length !== 1
  )
    throw new Error("카카오 인증 주소를 확인할 수 없어요.");
  return url.href;
}

export function createKakaoLogin({
  api,
  session,
  storage,
  browser,
  proof,
  baseUrl,
  now = Date.now,
}) {
  let state = { busy: false, pending: null, message: "" };
  let active = null;
  let processing = false;
  const listeners = new Set();
  const emit = (value) => {
    state = { ...state, ...value };
    listeners.forEach((fn) => fn());
  };
  const save = async (record) => {
    await storage.write({ ...record, baseUrl });
    active = record;
  };
  const clear = async () => {
    await storage.clear();
    active = null;
  };
  async function accept(result) {
    if (session.getSnapshot().status !== "signedOut") {
      await api.logout(result.token).catch(() => {});
      throw new Error(
        "다른 로그인 작업이 진행 중이에요. 내 계정을 확인해 주세요.",
      );
    }
    await session.signIn(async () => result);
  }
  async function resume(url) {
    if (processing) return;
    processing = true;
    emit({ busy: true, message: "" });
    try {
      const record = active || (await storage.read());
      if (
        !record ||
        (record.baseUrl && record.baseUrl !== baseUrl) ||
        record.expiresAt <= now()
      ) {
        await clear();
        if (url)
          throw new Error(
            "카카오 로그인 요청이 만료됐어요. 다시 시도해 주세요.",
          );
        return;
      }
      active = record;
      if (record.kind === "pending") {
        emit({
          pending: record,
          message:
            "카카오 인증이 완료됐어요. 이메일과 가입 동의를 확인해 주세요.",
        });
        return;
      }
      if (!url) return;
      const code = callbackValues(url, record.flow);
      const result = await api.auth.exchangeKakao({
        flow: record.flow,
        code,
        code_verifier: record.verifier,
      });
      try {
        await clear();
      } catch (error) {
        if (result.status === "signed_in")
          await api.logout(result.session.token).catch(() => {});
        else await api.auth.cancelSignup(result.signup_token).catch(() => {});
        throw error;
      }
      if (result.status === "signed_in") await accept(result.session);
      else {
        const pending = {
          kind: "pending",
          token: result.signup_token,
          expiresAt: now() + result.expires_in * 1000,
        };
        try {
          await save(pending);
        } catch (error) {
          await api.auth.cancelSignup(result.signup_token).catch(() => {});
          throw error;
        }
        emit({
          pending,
          message:
            "카카오 인증이 완료됐어요. 이메일과 가입 동의를 확인해 주세요.",
        });
      }
    } catch (error) {
      await clear().catch(() => {});
      emit({
        pending: null,
        message: error.message || "카카오 로그인을 다시 시도해 주세요.",
      });
    } finally {
      processing = false;
      emit({ busy: false });
    }
  }
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => state,
    resume,
    async start() {
      if (
        state.busy ||
        processing ||
        session.getSnapshot().status !== "signedOut"
      )
        return;
      emit({ busy: true, pending: null, message: "" });
      try {
        if (active?.kind === "pending")
          await api.auth.cancelSignup(active.token).catch(() => {});
        await clear();
        const { verifier, challenge } = await proof();
        const response = await api.auth.startKakao(challenge);
        const url = authorizeUrl(
          response.authorization_url,
          baseUrl,
          response.flow,
        );
        await save({
          kind: "oauth",
          flow: response.flow,
          verifier,
          expiresAt: now() + response.expires_in * 1000,
        });
        const result = await browser(url, KAKAO_CALLBACK);
        if (result.type === "success") await resume(result.url);
        else {
          if (active?.kind === "oauth")
            await api.auth
              .cancelKakao({
                flow: active.flow,
                code_verifier: active.verifier,
              })
              .catch(() => {});
          await clear();
          emit({ message: "카카오 로그인을 취소했어요." });
        }
      } catch (error) {
        await clear().catch(() => {});
        emit({ message: error.message || "카카오 로그인 창을 열지 못했어요." });
      } finally {
        emit({ busy: false });
      }
    },
    async complete(email, consent) {
      if (state.busy || !state.pending) return;
      if (state.pending.expiresAt <= now()) {
        await clear();
        emit({
          pending: null,
          message: "카카오 가입 인증이 만료됐어요. 다시 로그인해 주세요.",
        });
        return;
      }
      emit({ busy: true, message: "" });
      try {
        const result = await api.auth.completeKakao({
          email,
          consent,
          signup_token: state.pending.token,
        });
        try {
          await clear();
        } catch (error) {
          await api.logout(result.token).catch(() => {});
          throw error;
        }
        emit({ pending: null });
        await accept(result);
      } catch (error) {
        if ([401, 409].includes(error.status)) {
          await clear();
          emit({ pending: null });
        }
        emit({ message: error.message });
      } finally {
        emit({ busy: false });
      }
    },
    async cancel() {
      if (state.busy) return;
      emit({ busy: true });
      try {
        if (state.pending)
          await api.auth.cancelSignup(state.pending.token).catch(() => {});
        await clear();
        emit({
          pending: null,
          message: "가입을 취소했어요. 다시 시작할 수 있어요.",
        });
      } finally {
        emit({ busy: false });
      }
    },
  };
}
