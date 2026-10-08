import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Card, Copy, Field, Notice, useScreenStep } from "../../components/ui";
import { useRuntime } from "../../services/runtime";
import {
  credentialsError,
  emailError,
  normalizeEmail,
  signupConsent,
} from "./signupModel";
import { SignupConsent } from "./SignupConsent";

export function SignupForm({ onClose }: { onClose: () => void }) {
  const { api, session } = useRuntime();
  const [step, setStep] = useState(-1);
  const [consent, setConsent] = useState<ReturnType<
    typeof signupConsent
  > | null>(null);
  const [fields, setFields] = useState({
    username: "",
    password: "",
    confirm_password: "",
    email: "",
  });
  const [checked, setChecked] = useState("");
  const [proof, setProof] = useState({
    token: "",
    email: "",
    verified: false,
    expiresAt: 0,
    resendAt: 0,
  });
  const [code, setCode] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [complete, setComplete] = useState(false);
  useScreenStep(complete ? "complete" : step);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      pending.current?.abort();
    };
  }, []);
  const email = normalizeEmail(fields.email);
  const verified =
    proof.verified && proof.email === email && proof.expiresAt > now;
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage("");
    try {
      await action(controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) setMessage((err as Error).message);
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  function change(key: keyof typeof fields, value: string) {
    setFields((old) => ({ ...old, [key]: value }));
    setMessage("");
    if (key === "username") setChecked("");
    if (key === "email") {
      setProof((old) => ({ ...old, verified: false }));
      setCode("");
    }
  }
  async function submit(consent: ReturnType<typeof signupConsent>) {
    const invalid =
      credentialsError(fields) ||
      emailError(fields.email) ||
      (!verified ? "이메일 인증이 만료됐어요. 다시 인증해 주세요." : "");
    if (invalid) {
      setMessage(invalid);
      return;
    }
    await run(async (signal) => {
      await api.auth.signup(
        { ...fields, email, consent, verification_token: proof.token },
        signal,
      );
      if (signal.aborted) return;
      const password = fields.password;
      setFields((old) => ({ ...old, password: "", confirm_password: "" }));
      setComplete(true);
      await session.login(fields.username, password);
    });
  }
  if (complete)
    return (
      <Card>
        <Copy title>회원가입이 완료됐어요</Copy>
        <Copy>로그인을 마치지 못했다면 새 계정으로 로그인해 주세요.</Copy>
        <Button label="로그인 화면으로" onPress={onClose} />
      </Card>
    );
  if (step === -1)
    return (
      <Card>
        <SignupConsent
          busy={busy}
          label="동의하고 가입 시작"
          onSubmit={(value) => {
            setConsent(value);
            setStep(0);
          }}
        />
        <Button secondary label="가입 취소 · 로그인으로" onPress={onClose} />
      </Card>
    );
  return (
    <Card>
      <Copy title>
        {
          ["아이디와 비밀번호 만들기", "이메일 인증하기", "회원가입 마무리"][
            step
          ]
        }
      </Copy>
      <Copy muted>{step + 1} / 3단계</Copy>
      {message ? <Notice>{message}</Notice> : null}
      {step === 0 && (
        <>
          <Field
            label="아이디"
            value={fields.username}
            onChangeText={(v) => change("username", v)}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            autoComplete="username-new"
          />
          <Copy muted>영문·숫자·밑줄(_)로 4~20자</Copy>
          <Button
            secondary
            label={
              checked === fields.username && checked
                ? "사용 가능한 아이디예요"
                : "아이디 중복 확인"
            }
            busy={busy}
            onPress={() =>
              void run(async (signal) => {
                if (!/^[a-zA-Z0-9_]{4,20}$/.test(fields.username))
                  throw new Error(
                    "아이디를 영문·숫자·밑줄(_)로 4~20자 입력해 주세요.",
                  );
                const result = await api.auth.username(fields.username, signal);
                if (result.available !== true)
                  throw new Error("이미 사용 중인 아이디예요.");
                setChecked(fields.username);
              })
            }
          />
          <Field
            label="비밀번호"
            value={fields.password}
            onChangeText={(v) => change("password", v)}
            secureTextEntry={!visible}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
            editable={!busy}
            autoComplete="new-password"
          />
          <Copy muted>영문과 숫자를 포함해 8자 이상</Copy>
          <Field
            label="비밀번호 확인"
            value={fields.confirm_password}
            onChangeText={(v) => change("confirm_password", v)}
            secureTextEntry={!visible}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={128}
            editable={!busy}
            autoComplete="new-password"
          />
          <Button
            secondary
            label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
            onPress={() => setVisible(!visible)}
          />
          <Button
            label="다음 · 이메일 인증"
            disabled={busy}
            onPress={() => {
              const error =
                credentialsError(fields) ||
                (checked !== fields.username
                  ? "아이디 중복 확인을 해 주세요."
                  : "");
              if (error) setMessage(error);
              else {
                setStep(1);
                setMessage("");
              }
            }}
          />
        </>
      )}
      {step === 1 && (
        <>
          <Field
            label="이메일"
            value={fields.email}
            onChangeText={(v) => change("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            editable={!busy}
            maxLength={254}
          />
          <Button
            secondary
            label={
              proof.resendAt > now
                ? `${Math.ceil((proof.resendAt - now) / 1000)}초 후 다시 받기`
                : proof.token
                  ? "인증번호 다시 받기"
                  : "인증번호 받기"
            }
            disabled={proof.resendAt > now || verified}
            busy={busy}
            onPress={() =>
              void run(async (signal) => {
                if (emailError(email)) throw new Error(emailError(email));
                const data = await api.auth.sendEmail(
                  email,
                  proof.token,
                  signal,
                );
                setProof({
                  token: data.verification_token,
                  email,
                  verified: false,
                  expiresAt: Date.now() + data.expires_in * 1000,
                  resendAt: Date.now() + data.resend_after * 1000,
                });
                setCode("");
                setMessage(
                  "이메일로 보낸 6자리 번호를 입력해 주세요. 스팸함도 확인해 주세요.",
                );
              })
            }
          />
          {proof.email === email && proof.token && (
            <>
              <Field
                label="6자리 인증번호"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                editable={!busy && !verified}
                autoComplete="one-time-code"
              />
              <Button
                secondary
                label={verified ? "이메일 인증 완료" : "인증번호 확인"}
                disabled={
                  verified || !/^\d{6}$/.test(code) || proof.expiresAt <= now
                }
                busy={busy}
                onPress={() =>
                  void run(async (signal) => {
                    const data = await api.auth.verifyEmail(
                      email,
                      code,
                      proof.token,
                      signal,
                    );
                    setProof((old) => ({
                      ...old,
                      verified: true,
                      expiresAt: Date.now() + data.expires_in * 1000,
                    }));
                    setCode("");
                  })
                }
              />
              <Copy muted>
                {proof.expiresAt <= now
                  ? "인증 시간이 지났어요. 번호를 다시 받아 주세요."
                  : `남은 시간 ${Math.floor((proof.expiresAt - now) / 60000)}분 ${Math.ceil(((proof.expiresAt - now) % 60000) / 1000)}초`}
              </Copy>
            </>
          )}
          <Button
            label="다음 · 가입 확인"
            disabled={!verified || busy}
            onPress={() => {
              setStep(2);
              setMessage("");
            }}
          />
        </>
      )}
      {step === 2 && (
        <View style={{ gap: 16 }}>
          <Copy>아이디: {fields.username}</Copy>
          <Copy>인증한 이메일: {email}</Copy>
          <Copy muted>
            앞서 선택한 개인정보 동의로 가입합니다. 금융정보는 저장하지
            않습니다.
          </Copy>
          <Button
            secondary
            label="개인정보 동의 다시 확인"
            disabled={busy}
            onPress={() => setStep(-1)}
          />
          <Button
            label="회원가입 완료"
            busy={busy}
            disabled={!consent}
            onPress={() => {
              if (consent) void submit(consent);
            }}
          />
        </View>
      )}
      {step > 0 && (
        <Button
          secondary
          label="이전 단계"
          disabled={busy}
          onPress={() => {
            setStep(step - 1);
            setMessage("");
          }}
        />
      )}
      <Button
        secondary
        label="가입 취소 · 로그인으로"
        disabled={busy}
        onPress={onClose}
      />
    </Card>
  );
}
