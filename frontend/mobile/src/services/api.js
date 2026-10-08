import {
  parseCalculation,
  toFinancialProfile,
} from "@bokji/core/finance-model";
import { ApiError } from "./client.js";
import { createAuthApi } from "../features/auth/api.js";
import { createAssistantApi } from "../features/assistant/model.js";
import { createMonitoringApi } from "../features/ai/monitoringApi.js";
import { createDialogueApi } from "../features/ai/dialogueApi.js";
import { createNotificationApi } from "../features/notifications/model.js";
import { createPolicyTranslationClient } from "../../../packages/core/src/i18n/policyTranslation.js";
import { translate } from "../../../packages/core/src/i18n/index.js";
import {
  parsePolicy,
  parsePolicyPage,
  policyPath,
} from "../features/policies/model.js";

export function parseUser(value) {
  if (
    !value ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.username !== "string" ||
    !(value.name === null || typeof value.name === "string")
  )
    throw new ApiError("계정 정보를 읽을 수 없습니다.", 0, "invalid_response");
  return {
    id: value.id,
    username: value.username,
    name: value.name,
    ...(Number.isInteger(value.age) && value.age >= 0 && value.age <= 120
      ? { age: value.age }
      : {}),
    ...(typeof value.region === "string" && value.region.length <= 30
      ? { region: value.region }
      : {}),
  };
}

export function parseLoginResult(data) {
  if (
    !data ||
    typeof data.access_token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(data.access_token) ||
    data.token_type !== "Bearer" ||
    !Number.isInteger(data.expires_in) ||
    data.expires_in <= 0 ||
    data.expires_in > 7 * 24 * 60 * 60
  )
    throw new ApiError("로그인 결과를 읽을 수 없습니다.");
  return {
    token: data.access_token,
    expiresIn: data.expires_in,
    user: parseUser(data.user),
  };
}

export function createApi(request) {
  const policyTranslations = createPolicyTranslationClient({ request });
  const stored = (data) => {
    if (
      data.profile === null &&
      data.calculation === null &&
      data.updated_at === null
    )
      return data;
    if (typeof data.updated_at !== "string")
      throw new ApiError("저장 정보를 읽을 수 없습니다.");
    return {
      profile: toFinancialProfile(data.profile),
      calculation: parseCalculation(data.calculation),
      updated_at: data.updated_at,
    };
  };
  return {
    auth: createAuthApi(request),
    policyTranslations: {
      /**
       * @param {ReturnType<typeof parsePolicy>} policy
       * @param {string} language
       * @param {{signal?: AbortSignal, priority?: number}} [options]
       */
      async translate(policy, language, options = {}) {
        if (language === "ko") return policy;
        // Parser fallback labels are UI copy, never canonical notice text.
        const missing = policy.translationSourceEmptyFields || [];
        const source = missing.length
          ? {
              ...policy,
              ...Object.fromEntries(missing.map((field) => [field, ""])),
            }
          : policy;
        const display = await policyTranslations.translate(
          source,
          language,
          options,
        );
        return {
          ...display,
          ...Object.fromEntries(
            missing.map((field) => [
              field,
              display[field] || translate(language, policy[field]),
            ]),
          ),
        };
      },
      clear: policyTranslations.clear,
    },
    notifications: createNotificationApi(request),
    assistant: createAssistantApi(request),
    monitoring: createMonitoringApi(request),
    dialogue: createDialogueApi(request),
    listPolicies: async (filters, signal) =>
      parsePolicyPage(await request(policyPath(filters), { signal })),
    getPolicy: async (id, signal) =>
      parsePolicy(
        await request("/v1/policies/" + encodeURIComponent(id), { signal }),
      ),
    health: async () => {
      const data = await request("/health");
      if (data.status !== "ok" || data.service !== "bokji-compass-backend")
        throw new ApiError("복지나침반 서버인지 확인해 주세요.");
      return data;
    },
    login: async (username, password) => {
      const data = await request("/v1/mobile/auth/login", {
        body: { username, password },
      });
      return parseLoginResult(data);
    },
    me: async (token) =>
      parseUser((await request("/v1/mobile/auth/me", { token })).user),
    logout: (token) => request("/v1/mobile/auth/logout", { token, body: {} }),
    calculate: async (profile, signal) =>
      parseCalculation(
        await request("/v1/finance/calculate", {
          body: { profile: toFinancialProfile(profile) },
          signal,
        }),
      ),
    getProfile: async (token, signal) =>
      stored(await request("/v1/finance/profile", { token, signal })),
    saveProfile: async (token, profile, consent, signal) => {
      if (consent !== true) throw new ApiError("계정 저장에 동의해 주세요.");
      const data = stored(
        await request("/v1/finance/profile", {
          token,
          body: { profile: toFinancialProfile(profile), consent: true },
          signal,
        }),
      );
      if (!data.profile) throw new ApiError("저장 결과를 확인하지 못했습니다.");
      return data;
    },
    deleteProfile: async (token, signal) => {
      const data = await request("/v1/finance/profile/delete", {
        token,
        body: {},
        signal,
      });
      if (data.deleted !== true)
        throw new ApiError("삭제 결과를 확인하지 못했습니다.");
    },
  };
}
