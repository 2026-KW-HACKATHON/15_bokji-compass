import { Button, Copy, Screen } from "../components/ui";
import { useAssistant } from "../features/assistant/context";

export default function Support() {
  const { openChat } = useAssistant();
  return (
    <Screen>
      <Copy title>무엇이 궁금하세요?</Copy>
      <Copy>공고를 고르고 궁금한 내용을 확인하세요.</Copy>
      <Button label="챗봇 상담 열기" onPress={() => openChat()} />
    </Screen>
  );
}
