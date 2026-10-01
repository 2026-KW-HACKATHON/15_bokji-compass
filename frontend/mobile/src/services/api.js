import {
  parseCalculation,
  toFinancialProfile,
} from "@bokji/core/finance-model";
import { ApiError } from "./client.js";

export function parseUser(value) {
  if (
    !value ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.username !== "string" ||
    !(value.name === null || typeof value.name === "string")
  )
    throw new ApiError("계정 정보를 읽을 수 없습니다.", 0, "invalid_response");
  return { id: value.id, username: value.username, name: value.name };
}

export function createApi(request) {
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
      if (
        !/^[A-Za-z0-9_-]{43}$/.test(data.access_token) ||
        data.token_type !== "Bearer" ||
        !Number.isInteger(data.expires_in) ||
        data.expires_in <= 0
      )
        throw new ApiError("로그인 결과를 읽을 수 없습니다.");
      return {
        token: data.access_token,
        expiresIn: data.expires_in,
        user: parseUser(data.user),
      };
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
