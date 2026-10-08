import { LocalizedText as Text } from "../../i18n/LocalizedText";
import { useCallback, useState } from "react";
import {
  AppState,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  Button,
  Card,
  Choice,
  Copy,
  Notice,
  PageHeading,
  Screen,
  colors,
  useScreenStep,
} from "../../components/ui";
import { EasyIconTile, Icon, IconName } from "../../components/Icon";
import { useRuntime, useSession } from "../../services/runtime";
import { CandidateCard, openPolicy } from "./controls";
import { GuidedConversation } from "./GuidedConversation";
import { monitoringDate } from "./monitoringModel";
import { assistantOverview, questionForNeed } from "./overview";
import { ProfileEditor } from "./ProfileEditor";
import { Candidate, Snapshot } from "./types";
import { useTask } from "./useTask";

const starters = [
  ["home", "집수리 지원이 궁금해요", "주택 수리 지원을 알아보고 싶어요"],
  ["work", "취업을 준비하고 있어요", "취업 지원을 알아보고 싶어요"],
  ["info", "재난 피해를 입었어요", "재난 피해 지원을 알아보고 싶어요"],
] as const;
const views = [
  ["overview", "한눈에 보기"],
  ["supports", "지원 후보"],
  ["questions", "추가 확인"],
  ["progress", "신청 현황"],
  ["alerts", "새 안내"],
] as const;
type ViewName = (typeof views)[number][0];

export default function AiScreen() {
  const auth = useSession();
  const { configError } = useRuntime();
  return (
    <Screen>
      <PageHeading
        eyebrow="내 상황을 기억하는 복지 안내"
        title="AI 복지비서"
        description="새로운 지원부터 신청 준비까지, 필요한 다음 단계를 한곳에서 확인해요."
      />
      {configError ? (
        <Notice>{configError}</Notice>
      ) : auth.status === "restoring" ? (
        <Notice>로그인 상태를 확인하고 있어요.</Notice>
      ) : auth.status === "signedIn" && auth.token ? (
        <MemberAi
          key={`${auth.user?.id}:${auth.token}`}
          token={auth.token}
          user={auth.user}
        />
      ) : (
        <>
          <Hero
            onPress={() => router.navigate("/account")}
            label="로그인하고 내 지원 확인하기"
          />
          <OverviewTiles guest />
          <Card>
            <Copy title>내 상황을 더 알려주세요</Copy>
            <Copy>
              로그인하면 한 가지씩 대화하며 필요한 정보를 확인할 수 있어요. 저장
              여부는 직접 선택해요.
            </Copy>
            <Starters onStart={() => router.navigate("/account")} />
          </Card>
        </>
      )}
    </Screen>
  );
}
function Hero({
  onPress,
  label = "상황을 대화로 추가하기",
}: {
  onPress: () => void;
  label?: string;
}) {
  const { easy } = useRuntime();
  return (
    <View
      style={{
        backgroundColor: colors.mint,
        borderRadius: easy ? 10 : 24,
        borderWidth: easy ? 1 : 0,
        borderColor: colors.easyLine,
        padding: 22,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {easy ? <EasyIconTile name="ai" /> : <Icon name="ai" color={colors.green} size={28} />}
        <Text
          style={{
            color: colors.green,
            fontWeight: "700",
            fontSize: easy ? 22 : 20,
            flex: 1,
          }}
        >
          나에게 필요한 다음 단계
        </Text>
      </View>
      <Copy>
        내 상황과 관련된 지원을 살펴보고, 준비할 내용을 차근차근 확인해요.
      </Copy>
      <Button label={label} onPress={onPress} />
    </View>
  );
}
function Starters({ onStart }: { onStart: (question: string) => void }) {
  const { easy } = useRuntime();
  return (
    <View style={{ gap: 10 }}>
      {starters.map(([icon, title, question]) => (
        <Pressable
          key={icon}
          accessibilityRole="button"
          onPress={() => onStart(question)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 15,
            borderBottomWidth: 1,
            borderColor: colors.line,
          }}
        >
          {easy ? <EasyIconTile name={icon} /> : <Icon name={icon} color={colors.green} />}
          <View style={{ flex: 1 }}>
            <Copy>{title}</Copy>
          </View>
          <Icon name="next" size={20} />
        </Pressable>
      ))}
    </View>
  );
}
function OverviewTiles({
  guest = false,
  snapshot,
  user,
  onView,
  onEdit,
}: {
  guest?: boolean;
  snapshot?: Snapshot;
  user?: { id?: string; region?: string } | null;
  onView?: (view: ViewName) => void;
  onEdit?: () => void;
}) {
  const { easy } = useRuntime();
  const { width } = useWindowDimensions();
  const overview = snapshot ? assistantOverview(snapshot, user) : null;
  const tiles: {
    icon: IconName;
    title: string;
    text: string;
    count?: string;
    press?: () => void;
  }[] = [
    {
      icon: "account",
      title: "내 상황 요약",
      text:
        overview?.facts.join(" · ") ||
        (guest ? "내 생활정보를 정리해요" : "아직 저장한 생활정보가 없어요"),
      press: onEdit,
    },
    {
      icon: "policies",
      title: "새 안내",
      count: overview ? String(overview.newAlerts.length) : undefined,
      text:
        overview?.newAlerts[0]?.title ||
        (guest ? "새로 발견한 지원을 확인해요" : "새로 도착한 안내가 없어요"),
      press: () => onView?.("alerts"),
    },
    {
      icon: "info",
      title: "추가 확인 정보",
      count: overview ? String(overview.questions.length) : undefined,
      text:
        overview?.questions[0]?.question ||
        (guest
          ? "필요한 조건을 하나씩 확인해요"
          : "현재 추가로 요청한 정보가 없어요"),
      press: () => onView?.("questions"),
    },
    {
      icon: "check",
      title: "신청 진행 상태",
      text: overview
        ? `준비 중 ${overview.progressCounts.preparing} · 신청 완료 ${overview.progressCounts.applied} · 확인 완료 ${overview.progressCounts.completed}`
        : "준비부터 신청까지 기록해요",
      press: () => onView?.("progress"),
    },
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.title}
          accessibilityRole={guest ? undefined : "button"}
          disabled={guest}
          onPress={tile.press}
          style={({ pressed }) => ({
            width: easy || width < 390 ? "100%" : "48%",
            padding: 18,
            borderRadius: easy ? 10 : 20,
            borderWidth: 1,
            borderColor: easy ? colors.easyLine : colors.line,
            backgroundColor: "#FFF",
            gap: 12,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          {easy ? <EasyIconTile name={tile.icon} /> : <Icon name={tile.icon} color={colors.green} />}
          <Text
            style={{
              color: colors.ink,
              fontSize: easy ? 22 : 18,
              fontWeight: "700",
              lineHeight: easy ? 32 : 27,
            }}
          >
            {tile.title}
          </Text>
          {tile.count !== undefined && (
            <Text
              style={{ color: colors.green, fontSize: 30, fontWeight: "800" }}
            >
              {tile.count}
              <Text style={{ fontSize: 14 }}>개</Text>
            </Text>
          )}
          <Copy muted>{tile.text}</Copy>
          {guest && (
            <Text style={{ color: colors.muted, fontSize: easy ? 17 : 13 }}>
              로그인 후 확인
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}
function MemberAi({
  token,
  user,
}: {
  token: string;
  user: { id?: string; region?: string } | null;
}) {
  const { api } = useRuntime();
  const { busy, error, run, cancel } = useTask();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [view, setView] = useState<ViewName>("overview");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [conversation, setConversation] = useState<{ question: string } | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [limit, setLimit] = useState(3);
  useScreenStep(`${view}:${editing}:${!!conversation}`);
  const load = useCallback(
    () =>
      run(
        (signal) => api.monitoring.read({ token, signal }),
        (value) => setSnapshot(value as Snapshot),
      ),
    [api, token, run],
  );
  useFocusEffect(
    useCallback(() => {
      load();
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") load();
        else {
          cancel();
          setConversation(null);
          setEditing(false);
          setDeleting(false);
          setSnapshot(null);
        }
      });
      return () => {
        cancel();
        listener.remove();
      };
    }, [load, cancel]),
  );
  const selectView = (next: ViewName) => {
    setView(next);
    setLimit(3);
    setMessage("");
  };
  const start = (question = "") => {
    cancel();
    setEditing(false);
    setConversation({ question });
    setMessage("");
  };
  const change = (
    action: (options: {
      token: string;
      signal: AbortSignal;
    }) => Promise<unknown>,
    notice: string,
  ) =>
    run(
      (signal) => action({ token, signal }),
      (value) => {
        setSnapshot(value as Snapshot);
        setMessage(notice);
        setDeleting(false);
      },
    );
  if (conversation)
    return (
      <GuidedConversation
        token={token}
        initialQuestion={conversation.question}
        onSaved={setSnapshot}
        onClose={() => {
          setConversation(null);
          load();
        }}
      />
    );
  const overview = snapshot ? assistantOverview(snapshot, user) : null;
  const candidates: Candidate[] = snapshot
    ? view === "progress"
      ? overview!.progress
      : overview!.active
    : [];
  return (
    <View style={{ gap: 18 }}>
      {!editing && <Hero onPress={() => start()} />}
      {!snapshot ? (
        <Card>
          {error ? (
            <>
              <Notice>{error}</Notice>
              <Button label="다시 불러오기" disabled={busy} onPress={load} />
            </>
          ) : (
            <Notice>내 지원 현황을 가져오고 있어요.</Notice>
          )}
        </Card>
      ) : (
        <>
          {snapshot.scan_status === "unavailable" && (
            <Notice>
              새 공고를 확인하지 못했어요. 저장한 정보와 이전 안내를 유지하고
              있어요.
            </Notice>
          )}
          {editing ? (
            <ProfileEditor
              profile={snapshot.profile}
              enabled={snapshot.enabled}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={(profile, enabled, consent) =>
                run(
                  (signal) =>
                    api.monitoring.save(profile, {
                      token,
                      signal,
                      enabled,
                      consent,
                    }),
                  (value) => {
                    setSnapshot(value as Snapshot);
                    setEditing(false);
                    setMessage("생활정보와 안내 설정을 저장했어요.");
                  },
                )
              }
            />
          ) : (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {views.map(([key, label]) => (
                  <Choice
                    key={key}
                    label={label}
                    selected={key === view}
                    onPress={() => selectView(key)}
                  />
                ))}
              </View>
              {view === "overview" && (
                <>
                  <OverviewTiles
                    snapshot={snapshot}
                    user={user}
                    onView={selectView}
                    onEdit={() => setEditing(true)}
                  />
                  <Card>
                    <Copy title>내 상황을 더 알려주세요</Copy>
                    <Copy muted>모르는 정보는 건너뛰어도 괜찮아요.</Copy>
                    <Starters onStart={start} />
                  </Card>
                </>
              )}
              {(view === "supports" || view === "progress") && (
                <>
                  <Copy title>
                    {view === "supports"
                      ? `함께 살펴볼 지원 ${candidates.length}개`
                      : "신청 진행 상태"}
                  </Copy>
                  <Copy muted>
                    {view === "supports"
                      ? "지원 후보는 신청 자격 확정이 아니에요. 공고별 조건을 확인해 주세요."
                      : "직접 표시한 진행 상태예요. 기관의 실제 접수 결과와는 별도로 관리해요."}
                  </Copy>
                  {!candidates.length && (
                    <Card>
                      <Copy>
                        {view === "supports"
                          ? "현재 확인된 지원 후보가 없어요. 생활정보를 추가하거나 등록된 공고를 다시 확인해 보세요."
                          : "아직 진행 중으로 표시한 지원이 없어요."}
                      </Copy>
                      <Button
                        secondary
                        label={
                          view === "supports"
                            ? "내 상황 추가하기"
                            : "지원 후보 살펴보기"
                        }
                        onPress={() =>
                          view === "supports" ? start() : selectView("supports")
                        }
                      />
                    </Card>
                  )}
                  {candidates.slice(0, limit).map((item) => (
                    <CandidateCard
                      key={`${item.need_id}:${item.policy_id}`}
                      item={item}
                      disabled={busy}
                      onState={(state) =>
                        change(
                          (options) =>
                            api.monitoring.state(item, state, options),
                          "진행 상태를 저장했어요.",
                        )
                      }
                    />
                  ))}
                  {candidates.length > limit && (
                    <Button
                      secondary
                      label="지원 더 보기"
                      onPress={() => setLimit((old) => old + 3)}
                    />
                  )}
                </>
              )}
              {view === "questions" && (
                <>
                  <Copy title>추가로 확인할 정보</Copy>
                  {!overview!.questions.length && (
                    <Card>
                      <Copy>
                        현재 추가로 요청한 정보가 없어요. 신청 자격은 공고별로
                        확인해 주세요.
                      </Copy>
                      <Button
                        secondary
                        label="대화로 상황 추가하기"
                        onPress={() => start()}
                      />
                    </Card>
                  )}
                  {overview!.questions.map((item, index) => (
                    <Card key={`${item.needId}:${index}`}>
                      <Copy original muted>{item.title}</Copy>
                      <Copy original>{item.question}</Copy>
                      <Button
                        secondary
                        label={
                          item.policy ? "관련 공고 확인" : "대화로 정보 추가"
                        }
                        onPress={() =>
                          item.policy
                            ? openPolicy(item.policy)
                            : start(questionForNeed(item.needId))
                        }
                      />
                    </Card>
                  ))}
                </>
              )}
              {view === "alerts" && (
                <>
                  <Copy title>새 안내</Copy>
                  {!snapshot.alerts.length && (
                    <Card>
                      <Copy>
                        {snapshot.enabled
                          ? "새로 도착한 안내가 없어요."
                          : "지속 안내를 켜면 새 공고와 변경 내용을 모아드려요."}
                      </Copy>
                    </Card>
                  )}
                  {snapshot.alerts.slice(0, limit).map((alert) => (
                    <Card key={alert.id}>
                      <Copy muted>
                        {alert.read ? "읽은 안내" : "새 안내"} ·{" "}
                        {monitoringDate(alert.created_at)}
                      </Copy>
                      <Copy original title>{alert.title}</Copy>
                      <Copy original>{alert.body}</Copy>
                      <Button
                        secondary
                        label="공고 확인"
                        onPress={() => openPolicy({ id: alert.policy_id })}
                      />
                      {!alert.read && (
                        <Button
                          secondary
                          label="읽음으로 표시"
                          disabled={busy}
                          onPress={() =>
                            change(async (options) => {
                              await api.monitoring.readAlerts(
                                [alert.id],
                                options,
                              );
                              return api.monitoring.read(options);
                            }, "안내를 읽음으로 표시했어요.")
                          }
                        />
                      )}
                    </Card>
                  ))}
                  {snapshot.alerts.length > limit && (
                    <Button
                      secondary
                      label="안내 더 보기"
                      onPress={() => setLimit((old) => old + 3)}
                    />
                  )}
                </>
              )}
              <Card>
                <Copy title>내 정보와 안내 설정</Copy>
                <Copy muted>
                  마지막 공고 확인 · {monitoringDate(snapshot.last_checked_at)}
                </Copy>
                <Button
                  secondary
                  label="내 생활정보 확인·수정"
                  disabled={busy}
                  onPress={() => {
                    setEditing(true);
                    setMessage("");
                  }}
                />
                <Button
                  secondary
                  label={
                    snapshot.enabled
                      ? "지속 안내 잠시 멈추기"
                      : "지속 안내 켜기"
                  }
                  disabled={busy}
                  onPress={() =>
                    snapshot.profile
                      ? change(
                          (options) =>
                            api.monitoring.preferences(
                              !snapshot.enabled,
                              options,
                            ),
                          snapshot.enabled
                            ? "새 안내 생성을 멈췄어요."
                            : "지속 안내를 켰어요.",
                        )
                      : setEditing(true)
                  }
                />
                {snapshot.enabled && (
                  <Button
                    secondary
                    label="등록된 공고 다시 확인"
                    disabled={busy}
                    busy={busy}
                    onPress={() =>
                      change(
                        (options) => api.monitoring.refresh(options),
                        "공고 확인 결과를 불러왔어요.",
                      )
                    }
                  />
                )}
                {snapshot.profile &&
                  (deleting ? (
                    <>
                      <Notice>
                        생활정보, 안내 기록, 대화로 확인 중인 정보를 삭제할까요?
                      </Notice>
                      <Button
                        secondary
                        label="취소"
                        disabled={busy}
                        onPress={() => setDeleting(false)}
                      />
                      <Button
                        label="생활정보와 안내 기록 삭제"
                        disabled={busy}
                        onPress={() =>
                          change(
                            (options) => api.monitoring.remove(options),
                            "생활정보와 안내 기록을 삭제했어요.",
                          )
                        }
                      />
                    </>
                  ) : (
                    <Button
                      secondary
                      label="저장한 생활정보 삭제"
                      disabled={busy}
                      onPress={() => setDeleting(true)}
                    />
                  ))}
              </Card>
            </>
          )}
          {!!error && <Notice>{error}</Notice>}
          {!!message && <Notice>{message}</Notice>}
        </>
      )}
    </View>
  );
}
