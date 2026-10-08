import { LocalizedText as Text } from "../../i18n/LocalizedText";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Card, Copy, Field, Notice, useScreenStep } from "../../components/ui";
import { useRuntime, useSession } from "../../services/runtime";
import { useKakao } from "./context";
import { SignupForm } from "./SignupForm";
import { SignupConsent } from "./SignupConsent";
import { emailError, normalizeEmail } from "./signupModel";

export function AccountAccess() {
  const { api, session, easy } = useRuntime();
  const auth = useSession();
  const { controller, state: kakao } = useKakao();
  const [signup, setSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [statusError, setStatusError] = useState("");
  useScreenStep(kakao.pending ? "kakao-signup" : signup ? "signup" : "login");
  useEffect(() => {
    const signal = new AbortController();
    api.auth
      .kakaoStatus(signal.signal)
      .then((data) => {
        if (typeof data.enabled !== "boolean")
          throw new Error("카카오 연결 상태를 확인하지 못했어요.");
        if (!signal.signal.aborted) {
          setEnabled(data.enabled);
          setStatusError("");
        }
      })
      .catch((err) => {
        if (!signal.signal.aborted) setStatusError(err.message);
      });
    return () => signal.abort();
  }, [api, attempt]);
  const busy = auth.status !== "signedOut" || kakao.busy;
  if (kakao.pending)
    return (
      <Card>
        <Copy title>카카오 회원가입 마무리</Copy>
        <Copy>카카오 인증이 완료됐어요. 연락받을 이메일을 입력해 주세요.</Copy>
        <Field
          label="이메일"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError("");
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={254}
          editable={!busy}
          autoComplete="email"
        />
        {error || kakao.message ? (
          <Notice>{error || kakao.message}</Notice>
        ) : null}
        <SignupConsent
          kakao
          busy={busy}
          label="동의하고 카카오 회원가입"
          onSubmit={(consent) => {
            if (emailError(email)) setError(emailError(email));
            else void controller.complete(normalizeEmail(email), consent);
          }}
        />
        <Button
          secondary
          label="가입 취소"
          disabled={busy}
          onPress={() => void controller.cancel()}
        />
      </Card>
    );
  if (signup) return <SignupForm onClose={() => setSignup(false)} />;
  return (
    <>
      <Card>
        <Copy title>로그인하고 이어서 이용하세요</Copy>
        <Copy muted>
          처음 오셨나요? 카카오로 가입하거나 새 계정을 만들 수 있어요.
        </Copy>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="카카오로 가입 또는 로그인"
          accessibilityState={{
            disabled: enabled !== true || busy,
            busy: kakao.busy,
          }}
          disabled={enabled !== true || busy}
          onPress={() => void controller.start()}
          style={({ pressed }) => ({
            backgroundColor: "#FEE500",
            borderRadius: easy ? 8 : 14,
            minHeight: easy ? 60 : 54,
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
            opacity: enabled !== true || busy ? 0.5 : pressed ? 0.75 : 1,
          })}
        >
          <Text
            style={{
              fontSize: easy ? 20 : 17,
              lineHeight: 28,
              fontWeight: "700",
              color: "#191919",
              textAlign: "center",
            }}
          >
            {kakao.busy ? "카카오 인증 확인 중…" : "카카오로 계속하기"}
          </Text>
        </Pressable>
        {enabled === false && (
          <Copy muted>
            카카오 로그인을 준비 중이에요. 이메일로 가입할 수 있어요.
          </Copy>
        )}
        {enabled === null && !statusError && (
          <Copy muted>카카오 연결을 확인하고 있어요.</Copy>
        )}
        {statusError && (
          <>
            <Notice>{statusError}</Notice>
            <Button
              secondary
              label="카카오 연결 다시 확인"
              onPress={() => setAttempt((n) => n + 1)}
            />
          </>
        )}
        {kakao.message && <Notice>{kakao.message}</Notice>}
        <View style={{ gap: 14, marginTop: 12 }}>
          <Field
            label="아이디"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            editable={!busy}
          />
          <Field
            label="비밀번호"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            editable={!busy}
          />
          <Button
            label="아이디로 로그인"
            busy={auth.status === "signingIn"}
            disabled={busy || !username.trim() || !password}
            onPress={() => {
              const secret = password;
              setPassword("");
              void session.login(username, secret);
            }}
          />
          <Button
            secondary
            label="이메일로 회원가입"
            disabled={busy}
            onPress={() => setSignup(true)}
          />
        </View>
      </Card>
    </>
  );
}
