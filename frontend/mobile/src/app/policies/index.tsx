import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import {
  Button,
  Card,
  Copy,
  Field,
  Notice,
  Screen,
  colors,
} from "../../components/ui";
import { useRuntime } from "../../services/runtime";
import {
  categories,
  regions,
  parsePolicyPage,
} from "../../features/policies/model";

const initialFilters = {
  query: "",
  category: "전체",
  region: "전국",
  sort: "recent",
};
type Page = ReturnType<typeof parsePolicyPage>;

export default function Policies() {
  const { api, easy, configError } = useRuntime();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [paging, setPaging] = useState<{
    easy: boolean;
    cursors: (string | null)[];
  }>({ easy, cursors: [null] });
  if (paging.easy !== easy) setPaging({ easy, cursors: [null] });
  const cursors = paging.easy === easy ? paging.cursors : [null];
  const cursor = cursors[cursors.length - 1];
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify([filters, cursor, easy, retry]);
  const [response, setResponse] = useState<{
    key: string;
    page: Page | null;
    error: string;
  } | null>(null);
  const current = response?.key === requestKey ? response : null;
  const page = current?.page;
  const error = configError || current?.error || "";
  const busy = !configError && !current;
  useEffect(() => {
    const controller = new AbortController();
    if (configError) return;
    api
      .listPolicies(
        { ...filters, cursor, limit: easy ? 3 : 6 },
        controller.signal,
      )
      .then((value) => {
        if (!controller.signal.aborted)
          setResponse({ key: requestKey, page: value, error: "" });
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setResponse({
            key: requestKey,
            page: null,
            error:
              err.status === 503
                ? "공고 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."
                : err.message,
          });
      });
    return () => controller.abort();
  }, [api, filters, cursor, easy, configError, requestKey]);
  function change(key: keyof typeof initialFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPaging({ easy, cursors: [null] });
  }
  function reset() {
    setQuery("");
    setFilters(initialFilters);
    setPaging({ easy, cursors: [null] });
  }
  function choices(
    label: string,
    values: string[],
    key: "category" | "region" | "sort",
  ) {
    return (
      <View style={{ gap: 8 }}>
        <Copy>{label}</Copy>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {values.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={
                value === "recent"
                  ? "최근 등록순"
                  : value === "name"
                    ? "이름순"
                    : value
              }
              accessibilityState={{ checked: filters[key] === value }}
              onPress={() => change(key, value)}
              style={{
                minHeight: 48,
                justifyContent: "center",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.green,
                backgroundColor: filters[key] === value ? colors.mint : "#FFF",
              }}
            >
              <Text style={{ color: colors.ink, fontSize: easy ? 20 : 16 }}>
                {value === "recent"
                  ? "최근 등록순"
                  : value === "name"
                    ? "이름순"
                    : value}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }
  return (
    <Screen key={JSON.stringify([filters, cursor, easy])}>
      <Copy title>{easy ? "복지 공고 찾기" : "복지 공고 찾아보기"}</Copy>
      {!easy && (
        <Copy muted>관심 있는 지원을 검색하고 공식 안내를 확인하세요.</Copy>
      )}
      <Field
        label="공고 검색"
        value={query}
        onChangeText={setQuery}
        placeholder="예: 주거, 취업, 돌봄"
        maxLength={200}
        returnKeyType="search"
        onSubmitEditing={() => change("query", query)}
      />
      <Button label="검색" onPress={() => change("query", query)} />
      <Button
        secondary
        label={showFilters ? "검색 조건 접기" : "분야·지역 선택"}
        onPress={() => setShowFilters(!showFilters)}
      />
      <Copy muted>
        {filters.category === "전체" ? "모든 분야" : filters.category} ·{" "}
        {filters.region}
        {!easy
          ? ` · ${filters.sort === "recent" ? "최근 등록순" : "이름순"}`
          : ""}
      </Copy>
      {showFilters && (
        <Card>
          {choices("분야", categories, "category")}
          {choices("지역", regions, "region")}
          {choices("정렬", ["recent", "name"], "sort")}
          <Button secondary label="검색 조건 지우기" onPress={reset} />
        </Card>
      )}
      {busy ? (
        <Notice>공고를 가져오고 있어요.</Notice>
      ) : error ? (
        <Card>
          <Notice>{error}</Notice>
          <Button
            label="다시 시도하기"
            onPress={() => setRetry((value) => value + 1)}
          />
        </Card>
      ) : (
        page && (
          <>
            <Copy title>공고 목록 · {page.total}개</Copy>
            {!page.items.length ? (
              <Card>
                <Copy>조건에 맞는 공고가 없어요.</Copy>
                <Copy muted>
                  {easy
                    ? "다른 조건으로 찾아보세요."
                    : "검색 조건을 지워 보세요. 공개된 공고가 등록되면 여기에 표시됩니다."}
                </Copy>
                <Button secondary label="검색 조건 지우기" onPress={reset} />
              </Card>
            ) : (
              page.items.map((policy) => (
                <Card key={policy.id}>
                  <Copy muted>
                    {policy.category} · {policy.region}
                  </Copy>
                  <Copy title numberOfLines={easy ? 2 : undefined}>
                    {policy.title}
                  </Copy>
                  {!easy && <Copy numberOfLines={4}>{policy.summary}</Copy>}
                  <Copy numberOfLines={easy ? 2 : undefined}>
                    신청 기간: {policy.applicationPeriod}
                  </Copy>
                  {!easy && <Copy muted>{policy.organization}</Copy>}
                  <Button
                    label="공고 자세히 보기"
                    onPress={() =>
                      router.push({
                        pathname: "/policies/[id]",
                        params: { id: policy.id },
                      })
                    }
                  />
                </Card>
              ))
            )}
            {(cursors.length > 1 || page.nextCursor) && (
              <Card>
                <Copy>{cursors.length}번째 페이지</Copy>
                <Button
                  secondary
                  label="이전 페이지"
                  disabled={cursors.length === 1}
                  onPress={() =>
                    setPaging({ easy, cursors: cursors.slice(0, -1) })
                  }
                />
                <Button
                  label="다음 페이지"
                  disabled={
                    !page.nextCursor || cursors.includes(page.nextCursor)
                  }
                  onPress={() =>
                    setPaging({ easy, cursors: [...cursors, page.nextCursor] })
                  }
                />
              </Card>
            )}
          </>
        )
      )}
    </Screen>
  );
}
