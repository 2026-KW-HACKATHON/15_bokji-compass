import { ApiError } from "../../services/client.js";

export const notificationTypes = [
  {
    key: "policy_changes",
    title: "선택한 공고의 변경사항",
    description: "관심 공고의 신청 일정, 지원 내용 등 변경사항을 알려드려요.",
  },
  {
    key: "similar_policies",
    title: "즐겨찾기와 유사한 공고",
    description: "즐겨찾기한 공고와 비슷한 새 공고를 알려드려요.",
  },
  {
    key: "eligible_policies",
    title: "내 조건에 맞는 공고",
    description:
      "입력한 조건에 맞는 공고를 알려드려요. 최종 신청 자격은 공고에서 확인해 주세요.",
  },
  {
    key: "application_results",
    title: "지원한 공고의 발표일",
    description: "지원한 공고의 결과 발표일을 알려드려요.",
  },
];

export const defaultPreferences = Object.freeze({
  enabled: false,
  policy_changes: true,
  similar_policies: true,
  eligible_policies: true,
  application_results: true,
});

export function parsePreferences(value) {
  if (
    !value ||
    Object.keys(defaultPreferences).some(
      (key) => typeof value[key] !== "boolean",
    )
  )
    throw new ApiError("알림 설정을 확인하지 못했어요.", 0, "invalid_response");
  return Object.fromEntries(
    Object.keys(defaultPreferences).map((key) => [key, value[key]]),
  );
}

export function allowsNotification(preferences, data) {
  return (
    !!preferences?.enabled &&
    notificationTypes.some(
      ({ key }) => key === data?.category && preferences[key] === true,
    )
  );
}

export function notificationPolicyId(data) {
  const value = data?.policy_id;
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/[\x00-\x1f\x7f]/.test(value)
    ? value
    : null;
}

export function createNotificationApi(request) {
  const path = "/v1/mobile/notifications";
  return {
    read: async (token, signal) =>
      parsePreferences(await request(path + "/preferences", { token, signal })),
    save: async (token, preferences) =>
      parsePreferences(
        await request(path + "/preferences", {
          token,
          body: parsePreferences(preferences),
        }),
      ),
    register: async (token, pushToken, platform) => {
      const value = await request(path + "/devices", {
        token,
        body: { push_token: pushToken, platform },
      });
      if (value.registered !== true)
        throw new ApiError("알림 기기를 등록하지 못했어요.");
    },
    disable: async (token) => {
      const value = await request(path + "/devices/disable", {
        token,
        body: {},
      });
      if (value.disabled !== true)
        throw new ApiError("기기 알림 중지를 확인하지 못했어요.");
    },
  };
}
