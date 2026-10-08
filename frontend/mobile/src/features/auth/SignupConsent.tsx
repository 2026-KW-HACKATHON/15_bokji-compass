import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Copy, Details, Notice, colors } from "../../components/ui";
import { useRuntime } from "../../services/runtime";
import { signupConsent, validNotice } from "./signupModel";

type NoticeData = {
  version: string;
  operator_name: string;
  contact_email: string;
  retention: string;
  ai?: Record<string, string | boolean | string[]>;
};
export function SignupConsent({
  kakao = false,
  busy,
  onSubmit,
  label,
}: {
  kakao?: boolean;
  busy: boolean;
  onSubmit: (consent: ReturnType<typeof signupConsent>) => void;
  label: string;
}) {
  const { api, easy } = useRuntime();
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [collection, setCollection] = useState(false);
  const [profile, setProfile] = useState(false);
  const [ai, setAi] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api.auth
      .notice(controller.signal)
      .then((data) => {
        if (!validNotice(data))
          throw new Error(
            "최신 개인정보 안내를 확인하지 못했어요. 앱 업데이트를 확인해 주세요.",
          );
        if (!controller.signal.aborted) {
          setNotice(data);
          setError("");
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [api, attempt]);
  function choice(
    label: string,
    value: boolean,
    change: (value: boolean) => void,
  ) {
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled: busy }}
        disabled={busy}
        onPress={() => change(!value)}
        style={{
          minHeight: easy ? 64 : 56,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 12,
          borderWidth: 1,
          borderColor: value ? colors.green : colors.easyLine,
          borderRadius: easy ? 8 : 14,
        }}
      >
        <Text style={{ fontSize: 22, color: colors.green }}>
          {value ? "☑" : "☐"}
        </Text>
        <View style={{ flex: 1 }}>
          <Copy>{label}</Copy>
        </View>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <Copy title>가입 전 확인해 주세요</Copy>
      {error ? (
        <>
          <Notice>{error}</Notice>
          <Button
            secondary
            label="안내 다시 불러오기"
            onPress={() => setAttempt((n) => n + 1)}
          />
        </>
      ) : !notice ? (
        <Copy>가입 안내를 불러오고 있어요.</Copy>
      ) : null}
      {notice && (
        <>
          <Copy>
            {notice.operator_name}은 회원가입과 계정 관리를 위해 아래 정보를
            처리합니다.
          </Copy>
          <Copy>
            {kakao
              ? "카카오 계정 식별정보와 직접 입력한 이메일"
              : "아이디·비밀번호·이메일"}
            을 수집합니다. 회원 식별, 로그인·계정 관리와 부정 이용 방지에
            사용합니다.
          </Copy>
          <Copy muted>
            {notice.retention} 필수 동의를 거부하면 가입은 할 수 없지만 공개
            공고를 볼 수 있습니다.
          </Copy>
          <Details collapsible label="개인정보 처리 내용 전체 보기">
            <Copy>
              회원 식별자, 가입·수정 시각, 동의 항목·안내 버전·시각, 인증·로그인
              세션 정보도 처리합니다. 일반 가입은 이메일을 인증합니다.
              비밀번호는 해시로 저장합니다.
            </Copy>
            <Copy>
              인증·가입 대기 정보는 만료 후 정리하고 로그인은 최대 7일
              유지합니다. 부정 요청 제한을 위해 IP 해시와 요청 횟수를 일시
              처리합니다.
            </Copy>
            {kakao && (
              <Copy>
                카카오 닉네임은 가입 확인을 위해 최대 10분간 처리합니다. 선택
                동의한 경우에만 표시 이름으로 저장합니다. 동의하지 않아도 가입할
                수 있습니다.
              </Copy>
            )}
            <Copy>
              금융정보의 계정 저장은 계산기에서 별도로 동의합니다. 이 가입
              동의에는 금융정보 저장이나 건강·장애 등 민감정보 처리가 포함되지
              않습니다.
            </Copy>
            <Copy>
              회원정보 수정·탈퇴는 현재 웹의 내 정보에서 할 수 있습니다. 탈퇴 시
              계정·금융정보·카카오 연결·동의 기록·알림과 기기 토큰을 즉시
              삭제하고 모든 로그인 세션을 종료합니다.
            </Copy>
            <Copy>
              개인정보 열람·정정·동의 철회 문의: {notice.contact_email}
            </Copy>
            <Copy muted>안내문 버전 {notice.version}</Copy>
          </Details>
          {choice(
            "[필수] 회원가입 개인정보 수집·이용에 동의해요",
            collection,
            setCollection,
          )}
          {kakao &&
            choice(
              "[선택] 카카오 닉네임을 표시 이름으로 사용해요",
              profile,
              setProfile,
            )}
          {notice.ai?.enabled === true && (
            <>
              <Details collapsible label="외부 AI 처리·국외이전 안내">
                {[
                  ["처리 업체", "provider_name"],
                  ["업체 연락처", "contact"],
                  ["이전 국가", "countries"],
                  ["이용 목적", "purpose"],
                  ["이전 항목", "items"],
                  ["이전 시점", "transfer_time"],
                  ["이전 방법", "transfer_method"],
                  ["보유 기간", "retention"],
                  ["모델 학습", "training"],
                ].map(([label, key]) => (
                  <Copy key={key}>
                    {label}: {String(notice.ai?.[key] || "안내 확인 필요")}
                  </Copy>
                ))}
                <Copy>
                  거부해도 가입·공고 탐색·준비된 FAQ를 이용할 수 있습니다. 동의
                  철회는 개인정보 문의 이메일로 요청할 수 있습니다.
                </Copy>
              </Details>
              {choice(
                "[선택] 외부 AI 처리·개인정보 국외이전에 동의해요",
                ai,
                setAi,
              )}
            </>
          )}
          <Button
            label={label}
            busy={busy}
            disabled={!collection}
            onPress={() => {
              try {
                onSubmit(signupConsent(notice, { collection, profile, ai }));
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </>
      )}
    </View>
  );
}
