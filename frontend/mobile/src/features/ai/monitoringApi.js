// Ported from web/monitoring/monitoringApi.js; keep the response contract aligned.
import { ApiError } from "../../services/client.js";
import {
  candidateStates,
  parseMonitoringProfile,
  parseMonitoringSnapshot,
} from "./monitoringModel.js";

export function createMonitoringApi(request) {
  async function call(path, body, { signal, token } = {}) {
    if (!token)
      throw new ApiError("로그인한 뒤 AI 복지비서를 이용해 주세요.", 401);
    return request("/v1/monitoring" + path, {
      ...(body === undefined ? {} : { body }),
      signal,
      token,
      timeoutMs: 30000,
    });
  }
  const snapshot = async (path, body, options) =>
    parseMonitoringSnapshot(await call(path, body, options));
  return {
    read: (options) => snapshot("", undefined, options),
    save: (profile, { consent, enabled, ...options } = {}) => {
      if (consent !== true)
        throw new ApiError(
          "생활정보를 계정에 저장하고 지속 안내에 사용하는 데 동의해 주세요.",
          0,
          "consent_required",
        );
      if (typeof enabled !== "boolean")
        throw new ApiError(
          "지속 안내 설정을 확인해 주세요.",
          0,
          "invalid_input",
        );
      return snapshot(
        "/profile",
        { profile: parseMonitoringProfile(profile), consent: true, enabled },
        options,
      );
    },
    preferences: (enabled, options) => {
      if (typeof enabled !== "boolean")
        throw new ApiError(
          "지속 안내 설정을 확인해 주세요.",
          0,
          "invalid_input",
        );
      return snapshot("/preferences", { enabled }, options);
    },
    refresh: (options) => snapshot("/refresh", {}, options),
    state: (candidate, state, options) => {
      if (
        !candidate?.policy_id ||
        !candidate?.need_id ||
        !candidateStates.some(([value]) => value === state)
      )
        throw new ApiError(
          "지원 진행 상태를 확인해 주세요.",
          0,
          "invalid_input",
        );
      return snapshot(
        "/candidates/state",
        { policy_id: candidate.policy_id, need_id: candidate.need_id, state },
        options,
      );
    },
    readAlerts: async (ids, options) => {
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        !ids.every((id) => typeof id === "string" && id)
      )
        throw new ApiError("읽을 알림을 확인해 주세요.", 0, "invalid_input");
      const value = await call(
        "/alerts/read",
        { ids: [...new Set(ids)] },
        options,
      );
      if (value?.updated !== true)
        throw new ApiError(
          "알림 읽음 처리를 확인하지 못했어요.",
          0,
          "invalid_response",
        );
      return value;
    },
    remove: (options) => snapshot("/delete", {}, options),
  };
}
