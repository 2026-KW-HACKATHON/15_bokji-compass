import { emptyFinancialProfile } from "@bokji/core/finance-model";
import {
  applyQuickDefaults,
  financialDraftDefaults,
  quickDefaultsFromFinance,
  knownHouseholdSize,
} from "@bokji/core/finance-prefill";
import { updateDraft } from "./draft.js";

function initial() {
  return {
    owner: null,
    draft: emptyFinancialProfile(),
    quick: { householdSize: "1", monthlyIncome: "" },
    edited: false,
    view: "quick",
    step: 0,
    result: null,
    prefill: "idle",
    busy: false,
    message: "",
    saved: false,
  };
}

// Ephemeral form state: never persist finance inputs on the device. Late account
// responses cannot replace current edits or restore data after deletion/logout.
export function createFinanceState(api) {
  let state = initial();
  let identity = null;
  let request = null;
  let generation = 0;
  let revision = 0;
  let quickEdited = new Set();
  let cache = {};
  const listeners = new Set();
  const emit = (change) => {
    state = { ...state, ...change };
    listeners.forEach((fn) => fn());
  };
  const cancel = () => {
    generation++;
    request?.abort();
    request = null;
  };
  const reset = () => {
    revision++;
    quickEdited = new Set();
    cache = {};
    state = initial();
  };
  const apply = (data, force, incomingRevision, incomingQuick) => {
    if (data.profile) {
      const untouched = !state.edited && incomingRevision === revision;
      const draft = force || untouched ? data.profile : state.draft;
      emit({
        saved: true,
        ...(force || untouched
          ? { draft, step: 5, edited: false, result: null }
          : {}),
        quick: applyQuickDefaults(
          state.quick,
          quickDefaultsFromFinance(draft),
          force ? new Set() : new Set([...quickEdited, ...incomingQuick]),
        ),
      });
    } else emit({ saved: false });
  };
  async function load(force = false) {
    if (!identity) return;
    cancel();
    const id = generation;
    const owner = identity.id;
    const token = identity.token;
    const incomingRevision = revision;
    const incomingQuick = new Set(quickEdited);
    const controller = (request = new AbortController());
    emit({ prefill: "loading", busy: force, message: "" });
    try {
      const data = await api.getProfile(token, controller.signal);
      if (
        id !== generation ||
        controller.signal.aborted ||
        identity?.id !== owner
      )
        return;
      const preservingEdits =
        !force && (state.edited || incomingRevision !== revision);
      if (force && data.profile) {
        revision++;
        quickEdited = new Set();
        cache = {};
      }
      apply(data, force, incomingRevision, incomingQuick);
      emit({
        prefill: data.profile ? "loaded" : "empty",
        message: data.profile
          ? preservingEdits
            ? "작성 중인 입력을 유지했어요. 저장한 정보는 직접 다시 불러올 수 있어요."
            : "저장한 정보를 불러왔어요. 바뀐 내용만 확인해 주세요."
          : force
            ? "저장된 정보가 없어 현재 입력을 유지했어요."
            : "",
      });
    } catch (error) {
      if (id === generation && !controller.signal.aborted)
        emit({
          prefill: "error",
          message:
            "저장 정보를 불러오지 못했어요. 작성 중인 내용은 유지됩니다.",
        });
      if (error.status === 401) return { unauthorized: token };
    } finally {
      if (id === generation && !controller.signal.aborted)
        emit({ busy: false });
    }
  }
  return {
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot: () => state,
    dispose: cancel,
    setIdentity(auth) {
      if (["restoring", "signingIn"].includes(auth.status)) {
        cancel();
        emit({
          busy: false,
          prefill: state.prefill === "loading" ? "idle" : state.prefill,
        });
        return;
      }
      const next =
        auth.status === "signedIn"
          ? { id: auth.user.id, token: auth.token }
          : null;
      if (identity?.id === next?.id && identity?.token === next?.token)
        return next && state.prefill === "idle" ? load() : undefined;
      const previous = identity;
      cancel();
      identity = next;
      if (previous && previous.id !== next?.id) reset();
      emit({ owner: next?.id ?? null, busy: false });
      if (next) {
        if (!state.edited)
          emit({ draft: financialDraftDefaults({ user: auth.user }), step: 0 });
        return load();
      }
    },
    load,
    edit(path, value) {
      if (state.busy) return;
      revision++;
      if (path === "vehicles") cache.vehicles = value;
      emit({
        draft: updateDraft(state.draft, path, value, cache),
        edited: true,
        result: null,
        message: "",
      });
    },
    editQuick(key, value) {
      quickEdited.add(key);
      emit({ quick: { ...state.quick, [key]: value }, message: "" });
    },
    show(view, step = state.step) {
      if (state.busy) return;
      if (
        view === "detail" &&
        state.view === "quick" &&
        quickEdited.has("householdSize")
      ) {
        if (knownHouseholdSize(state.quick.householdSize) === null) {
          emit({ message: "실제 가구원 수를 선택하거나 입력해 주세요." });
          return;
        }
        revision++;
        emit({
          draft: financialDraftDefaults({
            saved: state.draft,
            quick: state.quick,
            useQuickHousehold: true,
          }),
          edited: true,
          result: null,
        });
        quickEdited.delete("householdSize");
      }
      if (view === "quick")
        emit({
          quick: applyQuickDefaults(
            state.quick,
            quickDefaultsFromFinance(state.draft),
            quickEdited,
          ),
        });
      emit({ view, step, message: "" });
    },
    message: (message) => emit({ message }),
    clear() {
      cancel();
      reset();
      emit({
        owner: identity?.id ?? null,
        message: "화면 입력을 지웠어요. 계정 저장 정보는 유지됩니다.",
      });
    },
    async run(action, consent = false) {
      if (state.busy || (action !== "calculate" && !identity)) return;
      cancel();
      const id = generation;
      const token = identity?.token;
      const controller = (request = new AbortController());
      emit({ busy: true, message: "" });
      try {
        if (action === "calculate") {
          const result = await api.calculate(state.draft, controller.signal);
          if (id === generation && !controller.signal.aborted)
            emit({ result, view: "result" });
        } else if (action === "save") {
          const data = await api.saveProfile(
            token,
            state.draft,
            consent,
            controller.signal,
          );
          if (id === generation && !controller.signal.aborted)
            emit({
              draft: data.profile,
              result: data.calculation,
              saved: true,
              edited: false,
              message: "내 계정에 저장했어요.",
            });
        } else if (action === "delete") {
          await api.deleteProfile(token, controller.signal);
          if (id === generation && !controller.signal.aborted) {
            reset();
            emit({
              owner: identity.id,
              prefill: "empty",
              message: "계정에 저장한 금융정보와 현재 입력을 삭제했어요.",
            });
          }
        }
      } catch (error) {
        if (id === generation && !controller.signal.aborted)
          emit({ message: error.message });
        if (error.status === 401) return { unauthorized: token };
      } finally {
        if (id === generation && !controller.signal.aborted)
          emit({ busy: false });
      }
    },
  };
}
