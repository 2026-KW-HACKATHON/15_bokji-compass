import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as Linking from "expo-linking";
import { useRuntime, useSession } from "../../services/runtime";
import { kakaoPlatform } from "../../platform/kakaoAuth";
import { createKakaoLogin, KAKAO_CALLBACK } from "./kakao";

const Auth = createContext<ReturnType<typeof createKakaoLogin> | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const { api, session, baseUrl } = useRuntime();
  const auth = useSession();
  const [kakao] = useState(() =>
    createKakaoLogin({ api, session, baseUrl, ...kakaoPlatform }),
  );
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !["signedOut", "signedIn"].includes(auth.status))
      return;
    restored.current = true;
    if (auth.status === "signedIn") return;
    void Linking.getInitialURL().then((url) =>
      kakao.resume(url?.startsWith(KAKAO_CALLBACK) ? url : null),
    );
  }, [auth.status, kakao]);
  return <Auth.Provider value={kakao}>{children}</Auth.Provider>;
}
export function useKakao() {
  const controller = useContext(Auth);
  if (!controller) throw new Error("AuthProvider is required");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { controller, state };
}
