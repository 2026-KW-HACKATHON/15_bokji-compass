import { ApiError } from "./client.js";

// Observe requests without retrying writes or retaining tokens / response bodies.
export function createServerConnection(client) {
  let state = { status: "unknown", reason: "", checking: false };
  let sequence = 0;
  let applied = 0;
  let pending = null;
  let controller = null;
  const listeners = new Set();
  const emit = (next) => {
    if (Object.entries(next).every(([key, value]) => state[key] === value)) return;
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const report = (id, status, reason = "") => {
    // A slow, earlier request cannot overwrite a newer connection result.
    if (id < applied) return;
    applied = id;
    emit({ status, reason });
  };
  async function request(path, options) {
    const id = ++sequence;
    try {
      const data = await client(path, options);
      if (path === "/health" &&
          (data.status !== "ok" || data.service !== "bokji-compass-backend"))
        throw new ApiError("복지나침반 서버 응답을 확인할 수 없습니다.", 0, "invalid_response");
      report(id, "available");
      return data;
    } catch (error) {
      if (error.code === "aborted") throw error;
      const reason = error.code === "network" ? "network"
        : error.code === "timeout" ? "timeout"
        : error.status >= 500 ? "server"
        : error.code === "invalid_response" || path === "/health" ? "response" : "";
      // Login / validation failures still demonstrate a reachable server.
      if (reason) report(id, "unavailable", reason);
      else if (error.status >= 400) report(id, "available");
      throw error;
    }
  }
  function check() {
    if (pending && !controller.signal.aborted) return pending;
    controller = new AbortController();
    emit({ checking: true });
    const task = request("/health", { signal: controller.signal, timeoutMs: 5000 })
      .finally(() => {
        if (pending !== task) return;
        pending = null;
        controller = null;
        emit({ checking: false });
      });
    pending = task;
    return pending;
  }
  return {
    request,
    check,
    cancelCheck: () => controller?.abort(),
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function connectionMessage(reason) {
  if (reason === "server") return "서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 연결해 주세요.";
  if (reason === "timeout") return "서버 응답이 늦어지고 있습니다. 인터넷 연결을 확인하고 다시 연결해 주세요.";
  if (reason === "response") return "서버에서 올바른 응답을 받지 못했습니다. 잠시 후 다시 연결해 주세요.";
  return "서버가 꺼져 있거나 인터넷 연결이 끊겼을 수 있습니다. Wi-Fi·모바일 데이터를 확인해 주세요.";
}
