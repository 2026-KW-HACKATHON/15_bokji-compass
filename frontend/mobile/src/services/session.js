// Injectable storage/HTTP make restart, offline, and account-isolation behavior testable.
export function createSession({ api, storage, baseUrl, now = Date.now }) {
  /** @type {{status: string, user: {id: string, username: string, name: string | null} | null, token: string | null, error: string, revision: number, expiresAt: number}} */
  let state = {
    status: "restoring",
    user: null,
    token: null,
    error: "",
    revision: 0,
    expiresAt: 0,
  };
  let record = null;
  let busy = false;
  const listeners = new Set();
  const emit = (next) => {
    state = { ...state, ...next, revision: state.revision + 1 };
    listeners.forEach((listener) => listener());
  };
  const cleared = (status, error = "") =>
    emit({ status, user: null, token: null, error, expiresAt: 0 });
  async function finishLogout() {
    if (record) {
      record = { ...record, pendingLogout: true };
      await storage.write(record);
      try {
        await api.logout(record.token);
      } catch (error) {
        if (error.status !== 401) throw error;
      }
    }
    await storage.clear();
    record = null;
    cleared("signedOut");
  }
  async function signIn(perform) {
    if (busy || state.status !== "signedOut") return;
    busy = true;
    cleared("signingIn");
    try {
      const result = await perform();
      record = {
        token: result.token,
        expiresAt: now() + result.expiresIn * 1000,
        baseUrl,
        pendingLogout: false,
      };
      try {
        await storage.write(record);
      } catch {
        record = { ...record, pendingLogout: true };
        // Never report a persistent login if the secure-store write failed.
        try {
          await api.logout(result.token);
        } catch {
          /* Session still expires server-side. */
        }
        cleared(
          "blocked",
          "로그인을 안전하게 저장하지 못했습니다. 다시 확인해 주세요.",
        );
        return;
      }
      emit({
        status: "signedIn",
        token: result.token,
        user: result.user,
        error: "",
        expiresAt: record.expiresAt,
      });
    } catch (error) {
      record = null;
      cleared("signedOut", error.message);
    } finally {
      busy = false;
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async restore() {
      if (busy) return;
      busy = true;
      cleared("restoring");
      try {
        record = record?.pendingLogout ? record : await storage.read();
        if (!record) {
          cleared("signedOut");
          return;
        }
        if (
          record.baseUrl !== baseUrl ||
          !/^[A-Za-z0-9_-]{43}$/.test(record.token) ||
          !Number.isFinite(record.expiresAt) ||
          record.expiresAt <= now()
        ) {
          await storage.clear();
          record = null;
          cleared("signedOut");
          return;
        }
        if (record.pendingLogout) {
          await finishLogout();
          return;
        }
        const user = await api.me(record.token);
        emit({
          status: "signedIn",
          user,
          token: record.token,
          error: "",
          expiresAt: record.expiresAt,
        });
      } catch (error) {
        if (error.status === 401) {
          try {
            await storage.clear();
            record = null;
            cleared("signedOut", "로그인이 만료되었습니다.");
          } catch {
            cleared(
              "blocked",
              "보안 저장소를 정리하지 못했습니다. 다시 시도해 주세요.",
            );
          }
        } else {
          cleared(
            "blocked",
            record?.pendingLogout
              ? "로그아웃을 완료하지 못했습니다. 연결 후 다시 시도해 주세요."
              : "로그인 상태를 확인하지 못했습니다. 연결과 보안 저장소를 확인하고 다시 시도해 주세요.",
          );
        }
      } finally {
        busy = false;
      }
    },
    login: (username, password) =>
      signIn(() => api.login(username.trim(), password)),
    signIn,
    async logout() {
      if (busy) return;
      busy = true;
      cleared("signingOut");
      try {
        await finishLogout();
      } catch {
        cleared(
          "blocked",
          "로그아웃을 완료하지 못했습니다. 연결 후 다시 시도해 주세요.",
        );
      } finally {
        busy = false;
      }
    },
    async invalidate(token) {
      if (state.token !== token || busy) return;
      busy = true;
      cleared("restoring");
      try {
        await storage.clear();
        record = null;
        cleared("signedOut", "로그인이 만료되었습니다.");
      } catch {
        cleared(
          "blocked",
          "보안 저장소를 정리하지 못했습니다. 다시 확인해 주세요.",
        );
      } finally {
        busy = false;
      }
    },
  };
}
