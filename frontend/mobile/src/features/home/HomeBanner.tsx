import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { colors } from "../../components/ui";
import { useRuntime } from "../../services/runtime";

const banners = [
  {
    title: "일상에 힘이 되는\n복지를 찾아요",
    shortTitle: "나에게 필요한\n복지 찾기",
    category: "생활을 더 든든하게",
    action: "복지 지원 알아보기",
    route: "/policies" as const,
    image: require("../../../assets/home/support.png"),
    color: "#E7F0E7",
  },
  {
    title: "우리 집 소득,\n어느 정도일까요?",
    shortTitle: "우리 집\n중위소득 계산",
    category: "궁금한 소득 기준",
    action: "소득 비율 확인하기",
    route: "/finance" as const,
    image: require("../../../assets/home/calculator.png"),
    color: "#F7EFDA",
  },
  {
    title: "저장한 내 정보,\n다시 입력하지 않게",
    shortTitle: "저장한 정보를\n다시 불러와요",
    category: "다음에도 편리하게",
    action: "내 계정 살펴보기",
    route: "/account" as const,
    image: require("../../../assets/home/account.png"),
    color: "#EEEAF6",
  },
];

// User-controlled paging keeps the copy still while reading (including easy mode).
export function HomeBanner() {
  const { easy } = useRuntime();
  const scroll = useRef<ScrollView>(null);
  const selected = useRef(0);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    scroll.current?.scrollTo({ x: selected.current * width, animated: false });
  }, [width]);

  function select(next: number) {
    const value = (next + banners.length) % banners.length;
    selected.current = value;
    setIndex(value);
    scroll.current?.scrollTo({ x: value * width, animated: false });
  }

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={styles.frame}>
        {width > 0 && (
          <ScrollView
            ref={scroll}
            testID="home-banner-scroll"
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            directionalLockEnabled
            bounces={false}
            scrollEventThrottle={32}
            onScroll={(event) => {
              const next = Math.max(
                0,
                Math.min(
                  banners.length - 1,
                  Math.round(event.nativeEvent.contentOffset.x / width),
                ),
              );
              selected.current = next;
              setIndex(next);
            }}
          >
            {banners.map((banner, position) => (
              <Pressable
                key={banner.route}
                accessibilityRole="button"
                accessibilityLabel={banner.action}
                accessibilityElementsHidden={position !== index}
                importantForAccessibility={
                  position === index ? "yes" : "no-hide-descendants"
                }
                aria-hidden={position !== index}
                tabIndex={position === index ? 0 : -1}
                onPress={() => router.navigate(banner.route)}
                style={({ pressed }) => [
                  styles.slide,
                  {
                    width,
                    backgroundColor: banner.color,
                    opacity: pressed ? 0.85 : 1,
                  },
                  easy && styles.easySlide,
                ]}
              >
                <Image
                  source={banner.image}
                  accessible={false}
                  aria-hidden
                  resizeMode="cover"
                  style={easy ? styles.easyImage : styles.image}
                />
                <View style={[styles.copy, easy && styles.easyCopy]}>
                  {!easy && (
                    <Text style={styles.category}>{banner.category}</Text>
                  )}
                  <Text style={[styles.title, easy && styles.easyTitle]}>
                    {easy ? banner.shortTitle : banner.title}
                  </Text>
                  <Text style={[styles.action, easy && { fontSize: 17 }]}>
                    자세히 보기 ↗
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
      <View style={styles.controls}>
        <View style={styles.dots} accessible={false} aria-hidden>
          {banners.map((banner, position) => (
            <View
              key={banner.route}
              style={[styles.dot, position === index && styles.activeDot]}
            />
          ))}
        </View>
        <View style={styles.paging}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이전 배너"
            onPress={() => select(index - 1)}
            style={styles.arrow}
          >
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
          <Text
            accessibilityLabel={`배너 ${index + 1} / ${banners.length}`}
            style={styles.counter}
          >
            {index + 1} / {banners.length}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="다음 배너"
            onPress={() => select(index + 1)}
            style={styles.arrow}
          >
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 24, overflow: "hidden", backgroundColor: "#E7F0E7" },
  slide: { flexShrink: 0 },
  image: { width: "100%", height: 145 },
  copy: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 16, gap: 6 },
  category: {
    color: "#486353",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  title: {
    color: colors.ink,
    fontSize: 23,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  action: { color: colors.ink, fontSize: 14, fontWeight: "600", marginTop: 4 },
  easySlide: {
    flexDirection: "row-reverse",
    alignItems: "center",
    minHeight: 142,
  },
  easyImage: { width: "36%", height: "100%", minHeight: 142 },
  easyCopy: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
  easyTitle: { fontSize: 21, lineHeight: 29, letterSpacing: -0.5 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 4,
  },
  dots: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#C0CCC4" },
  activeDot: { width: 20, backgroundColor: colors.green },
  paging: { flexDirection: "row", alignItems: "center" },
  arrow: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { fontSize: 29, color: colors.ink },
  counter: { color: colors.muted, fontSize: 13, fontVariant: ["tabular-nums"] },
});
