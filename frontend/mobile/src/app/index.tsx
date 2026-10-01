import { useState } from "react";
import { router } from "expo-router";
import { Switch, View } from "react-native";
import { Button, Card, Copy, Notice, Screen, colors } from "../components/ui";
import { useRuntime } from "../services/runtime";

export default function Home() {
  const { api, configError, easy, setEasy } = useRuntime();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    setMessage("");
    try {
      await api.health();
      setMessage("서버에 연결됐습니다.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Copy muted>복지나침반 · 모바일</Copy>
      <Copy title>나에게 필요한 복지를{"\n"}찾는 첫걸음</Copy>
      <Copy muted>
        내 상황을 차근차근 정리하고, 소득과 재산의 참고 금액을 확인해 보세요.
      </Copy>
      {configError ? <Notice>{configError}</Notice> : null}
      <Card>
        <Copy title>소득·재산 알아보기</Copy>
        <Copy>
          회원가입 없이 계산할 수 있어요. 입력한 정보는 저장을 선택할 때만
          계정에 보관합니다.
        </Copy>
        <Button
          label="계산 시작하기"
          onPress={() => router.navigate("/finance")}
        />
      </Card>
      <Card>
        <Copy title>내 계정에 저장한 정보</Copy>
        <Copy>
          웹에서 사용하던 계정으로 로그인하고 저장한 금융정보를 불러오세요.
        </Copy>
        <Button
          secondary
          label="내 계정으로 이동"
          onPress={() => router.navigate("/account")}
        />
      </Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Copy>쉬운 화면</Copy>
          <Copy muted>글씨를 더 크게 보여드려요.</Copy>
        </View>
        <Switch
          accessibilityLabel="쉬운 화면"
          value={easy}
          onValueChange={setEasy}
          trackColor={{ true: colors.green }}
        />
      </View>
      <Notice>
        공고 탐색과 맞춤 추천은 앱에서 준비 중입니다. 현재 버전에서는 소득·재산
        계산과 계정 연결을 제공합니다.
      </Notice>
      <Button
        secondary
        label="서버 연결 확인"
        disabled={!!configError}
        busy={busy}
        onPress={() => void check()}
      />
      {message ? <Notice>{message}</Notice> : null}
    </Screen>
  );
}
