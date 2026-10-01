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
import { sessionStorage } from "../platform/sessionStorage";

let configError = "";
let baseUrl = "";
try {
  baseUrl = resolveApiUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__);
} catch (error) {
  configError = (error as Error).message;
}
const api = createApi(createClient({ baseUrl }));
const session = createSession({ api, storage: sessionStorage, baseUrl });
const Runtime = createContext({
  api,
  session,
  baseUrl,
  configError,
  easy: false,
  setEasy: (_value: boolean) => {},
});

export function RuntimeProvider({ children }: React.PropsWithChildren) {
  const [easy, setEasy] = useState(false);
  useEffect(() => {
    if (!configError) void session.restore();
  }, []);
  return (
    <Runtime.Provider
      value={{ api, session, baseUrl, configError, easy, setEasy }}
    >
      {children}
    </Runtime.Provider>
  );
}
export function useRuntime() {
  return useContext(Runtime);
}
export function useSession() {
  return useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
}
