import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createClient, resolveApiUrl } from "./client";
import { createApi } from "./api";
import { createSession } from "./session";
import { createServerConnection } from "./serverConnection";
import { sessionStorage } from "../platform/sessionStorage";
import { AppState } from "react-native";

let configError = "";
let baseUrl = "";
try {
  baseUrl = resolveApiUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__);
} catch (error) {
  configError = (error as Error).message;
}
const connection = createServerConnection(createClient({ baseUrl }));
const api = createApi(connection.request);
const session = createSession({ api, storage: sessionStorage, baseUrl });
const Runtime = createContext({
  api,
  session,
  baseUrl,
  configError,
  connection,
  easy: false,
  setEasy: (_value: boolean) => {},
});

export function RuntimeProvider({ children }: React.PropsWithChildren) {
  const [easy, setEasy] = useState(false);
  const auth = useSession();
  useEffect(() => {
    if (!configError) void session.restore();
    const listener = AppState.addEventListener("change", (next) => {
      // Revalidate after returning from the background; stale private forms are unmounted.
      if (next === "active" && !configError && session.getSnapshot().status === "signedIn")
        void session.restore();
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (configError) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const check = () => { void connection.check().catch(() => {}); };
    const update = (active: boolean) => {
      clearInterval(timer);
      timer = undefined;
      if (active) {
        check();
        timer = setInterval(check, 30000);
      } else connection.cancelCheck();
    };
    update(AppState.currentState !== "background" && AppState.currentState !== "inactive");
    const listener = AppState.addEventListener("change", (next) => update(next === "active"));
    return () => {
      clearInterval(timer);
      listener.remove();
      connection.cancelCheck();
    };
  }, []);
  useEffect(() => {
    if (auth.status !== "signedIn" || !auth.token) return;
    const timer = setTimeout(() => void session.invalidate(auth.token), Math.max(0, auth.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [auth.status, auth.token, auth.expiresAt]);
  return (
    <Runtime.Provider
      value={{ api, session, baseUrl, configError, connection, easy, setEasy }}
    >
      {children}
    </Runtime.Provider>
  );
}
export function useRuntime() {
  return useContext(Runtime);
}
export function useServerConnection() {
  return useSyncExternalStore(connection.subscribe, connection.getSnapshot, connection.getSnapshot);
}
export function useSession() {
  return useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
}
