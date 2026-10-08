// A late reply after navigation/account change must not repopulate the next screen.
export function createTaskGate() {
  let active = null;
  return {
    isBusy: () => active !== null,
    cancel() {
      active?.abort();
      active = null;
    },
    async run(action, commit, fail, finish) {
      if (active) return;
      const controller = new AbortController();
      active = controller;
      const current = () => active === controller && !controller.signal.aborted;
      try {
        const value = await action(controller.signal);
        if (current()) commit(value);
      } catch (error) {
        if (current()) fail(error);
      } finally {
        if (active === controller) {
          active = null;
          finish();
        }
      }
    },
  };
}
