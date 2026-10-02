export class ApiError extends Error {
  constructor(message, status = 0, code = "request") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function resolveApiUrl(value, development = false) {
  if (!value?.trim())
    throw new Error("EXPO_PUBLIC_API_BASE_URL에 서버 주소를 설정해 주세요.");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("서버 주소 형식이 올바르지 않습니다.");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(url.protocol === "https:" || (development && url.protocol === "http:"))
  ) {
    throw new Error(
      "운영 서버에는 인증정보·쿼리가 없는 HTTPS 주소를 사용해 주세요.",
    );
  }
  return url.href.replace(/\/+$/, "");
}

export function createClient({
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
}) {
  return async (
    path,
    { body, token, signal, timeoutMs: requestTimeoutMs = timeoutMs } = {},
  ) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);
    try {
      if (controller.signal.aborted)
        throw new ApiError("요청을 취소했습니다.", 0, "aborted");
      const response = await fetchImpl(baseUrl + path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "omit",
        cache: "no-store",
        // Browsers enforce this; Android also disables redirects in its native HTTP client.
        redirect: "error",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(body === undefined
            ? {}
            : { "Content-Type": "application/json", "X-Auth-Request": "1" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (signal?.aborted)
        throw new ApiError("요청을 취소했습니다.", 0, "aborted");
      if (!response.ok) {
        const messages = {
          401: "아이디·비밀번호를 확인하거나 다시 로그인해 주세요.",
          403: "요청을 확인할 수 없습니다. 앱을 업데이트해 주세요.",
          404: "아직 제공되지 않는 기능입니다.",
          422: "입력한 값과 저장 동의를 확인해 주세요.",
          429: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
        };
        throw new ApiError(
          messages[response.status] ||
            "서버에서 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          response.status,
        );
      }
      const data = await response.json().catch(() => null);
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new ApiError(
          "서버 응답을 읽을 수 없습니다.",
          0,
          "invalid_response",
        );
      if (signal?.aborted)
        throw new ApiError("요청을 취소했습니다.", 0, "aborted");
      return data;
    } catch (error) {
      if (signal?.aborted)
        throw new ApiError("요청을 취소했습니다.", 0, "aborted");
      if (timedOut)
        throw new ApiError(
          "연결이 지연됩니다. 다시 시도해 주세요.",
          0,
          "timeout",
        );
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
        0,
        "network",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
}
