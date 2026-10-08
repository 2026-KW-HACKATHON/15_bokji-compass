import { useCallback, useEffect, useState } from "react";
import { createTaskGate } from "./taskGate";
import { dialogueError } from "./dialogueModel";

export function useTask() {
  const [gate] = useState(createTaskGate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => gate.cancel(), [gate]);
  const cancel = useCallback(() => {
    gate.cancel();
    setBusy(false);
  }, [gate]);
  const run = useCallback(
    <T>(
      action: (signal: AbortSignal) => Promise<T>,
      commit: (value: T) => void,
    ) => {
      if (gate.isBusy()) return;
      setBusy(true);
      setError("");
      void gate.run(
        action,
        commit,
        (failure: Error) => setError(dialogueError(failure)),
        () => setBusy(false),
      );
    },
    [gate],
  );
  return { busy, error, setError, run, cancel };
}
