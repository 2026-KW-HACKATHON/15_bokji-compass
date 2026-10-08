import { ApiError } from "../../services/client.js";
import { parseLoginResult } from "../../services/api.js";

const secret = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const seconds = (value) =>
  Number.isInteger(value) && value > 0 && value <= 3600;
export function createAuthApi(request) {
  async function call(path, body, signal) {
    try {
      return await request(path, { body, signal });
    } catch (error) {
      const messages = {
        400: "인증번호를 확인해 주세요. 만료됐거나 여러 번 틀렸다면 다시 받아 주세요.",
        401: "가입·로그인 인증이 만료됐어요. 다시 인증해 주세요.",
        409: "이미 사용 중인 아이디 또는 가입된 카카오 계정이에요. 로그인해 주세요.",
        422: "아이디·비밀번호·이메일과 필수 동의를 확인해 주세요.",
      };
      if (messages[error.status])
        throw new ApiError(messages[error.status], error.status);
      throw error;
    }
  }
  return {
    notice: (signal) => call("/v1/auth/privacy-notice", undefined, signal),
    kakaoStatus: (signal) => call("/v1/auth/kakao/status", undefined, signal),
    username: (username, signal) =>
      call("/v1/auth/username/check", { username }, signal),
    async sendEmail(email, verification_token = "", signal) {
      const data = await call(
        "/v1/mobile/auth/email/request",
        { email, verification_token },
        signal,
      );
      if (
        !secret(data.verification_token) ||
        !seconds(data.expires_in) ||
        !seconds(data.resend_after)
      )
        throw new ApiError("이메일 인증 응답을 확인하지 못했어요.");
      return data;
    },
    async verifyEmail(email, code, verification_token, signal) {
      const data = await call(
        "/v1/mobile/auth/email/verify",
        { email, code, verification_token },
        signal,
      );
      if (data.verified !== true || !seconds(data.expires_in))
        throw new ApiError("이메일 인증을 다시 확인해 주세요.");
      return data;
    },
    signup: (body, signal) => call("/v1/mobile/auth/signup", body, signal),
    async startKakao(code_challenge) {
      const data = await call("/v1/mobile/auth/kakao/start", {
        code_challenge,
      });
      if (!secret(data.flow) || !seconds(data.expires_in))
        throw new ApiError("카카오 인증 요청을 확인하지 못했어요.");
      return data;
    },
    async exchangeKakao(body) {
      const data = await call("/v1/mobile/auth/kakao/exchange", body);
      if (data.status === "signed_in")
        return { status: data.status, session: parseLoginResult(data) };
      if (
        data.status !== "signup_required" ||
        !secret(data.signup_token) ||
        !seconds(data.expires_in)
      )
        throw new ApiError("카카오 인증 결과를 확인하지 못했어요.");
      return data;
    },
    async completeKakao(body) {
      return parseLoginResult(
        await call("/v1/mobile/auth/kakao/complete", body),
      );
    },
    cancelKakao: (body) => call("/v1/mobile/auth/kakao/cancel", body),
    cancelSignup: (signup_token) =>
      call("/v1/mobile/auth/kakao/cancel-signup", { signup_token }),
  };
}
