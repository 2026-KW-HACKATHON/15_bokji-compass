import { useState } from "react";
import { router } from "expo-router";
import {
  Button,
  Card,
  Copy,
  Details,
  Field,
  Notice,
  Screen,
} from "../components/ui";
import { useRuntime, useSession } from "../services/runtime";
import { NotificationSettings } from "../features/notifications/NotificationSettings";

export default function Account() {
  const { session, configError, easy } = useRuntime();
  const state = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  async function login() {
    const secret = password;
    setPassword("");
    await session.login(username, secret);
  }
  return (
    <Screen>
      <Copy title>내 계정</Copy>
      {configError ? (
        <Notice>{configError}</Notice>
      ) : state.status === "signedIn" ? (
        <Card>
          <Copy title>{state.user?.name || state.user?.username}님</Copy>
          <Copy>웹과 같은 계정으로 연결됐어요.</Copy>
          <Button
            label="금융정보 불러오러 가기"
            onPress={() => router.navigate("/finance")}
          />
          <Button
            secondary
            label="로그아웃"
            onPress={() => void session.logout()}
          />
        </Card>
      ) : state.status === "blocked" ? (
        <Card>
          <Copy>로그인 상태를 다시 확인해 주세요.</Copy>
          <Button label="다시 확인" onPress={() => void session.restore()} />
        </Card>
      ) : state.status === "restoring" || state.status === "signingOut" ? (
        <Notice>로그인 상태를 확인하고 있어요.</Notice>
      ) : (
        <Card>
          <Copy>
            {easy
              ? "웹에서 쓰던 계정으로 로그인해요."
              : "기존 복지나침반 계정으로 로그인해 주세요."}
          </Copy>
          <Field
            label="아이디"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            editable={state.status === "signedOut"}
          />
          <Field
            label="비밀번호"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            editable={state.status === "signedOut"}
            onSubmitEditing={() => {
              if (username && password) void login();
            }}
          />
          <Button
            label="로그인"
            busy={state.status === "signingIn"}
            disabled={!username.trim() || !password}
            onPress={() => void login()}
          />
          <Details label="회원가입 안내">
            <Copy muted>
              모바일 회원가입은 다음 단계에서 제공됩니다. 먼저 웹에서 만든
              계정을 이용해 주세요.
            </Copy>
          </Details>
        </Card>
      )}
      {state.error ? <Notice>{state.error}</Notice> : null}
      <NotificationSettings />
      <Details label="저장 정보 안내">
        <Copy muted>
          금융정보는 자동으로 불러오지 않습니다. 계산기에서 직접 불러오기를
          선택해 주세요.
        </Copy>
      </Details>
    </Screen>
  );
}
