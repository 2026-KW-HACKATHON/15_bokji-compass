const textFields = Object.freeze([
  "title",
  "summary",
  "audience",
  "organization",
  "benefit",
  "applicationPeriod",
  "paymentSchedule",
  "content",
  "gender",
  "contact",
  "applicationMethod",
  "budgetNotice",
]);
export const policyTranslationFields = Object.freeze([
  ...textFields,
  "otherConditions",
  "sourceFields",
]);
const languages = new Set(["en", "zh", "vi", "ja"]);

export class PolicyTranslationError extends Error {
  constructor(code, message = code, status = null) {
    super(message);
    this.name = "PolicyTranslationError";
    this.code = code;
    this.status = status;
  }
}

/** Overlay validated display text only. Canonical metadata, links and filters remain original. */
export function applyPolicyTranslation(policy, language, response) {
  const fail = () => {
    throw new PolicyTranslationError("invalid_translation");
  };
  if (
    !response ||
    response.policy_id !== policy.id ||
    response.language !== language ||
    response.source_language !== "ko" ||
    typeof response.source_hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(response.source_hash) ||
    !(response.revision_id === null || typeof response.revision_id === "string")
  )
    fail();
  if (policy.revisionId != null && response.revision_id !== policy.revisionId)
    throw new PolicyTranslationError("stale_revision");
  const value = response.translation;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !policyTranslationFields.includes(key))
  )
    fail();
  for (const field of textFields) {
    if (!Object.hasOwn(value, field)) continue;
    if (
      value[field] !== null &&
      (typeof value[field] !== "string" || value[field].length > 100000)
    )
      fail();
    if (
      typeof policy[field] === "string" &&
      policy[field].trim() &&
      (typeof value[field] !== "string" || !value[field].trim())
    )
      fail();
  }
  if (
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.summary !== "string"
  )
    fail();
  if (
    Object.hasOwn(value, "otherConditions") &&
    (!Array.isArray(value.otherConditions) ||
      value.otherConditions.length > 256 ||
      value.otherConditions.some(
        (item) => typeof item !== "string" || item.length > 100000,
      ) ||
      (Array.isArray(policy.otherConditions) &&
        policy.otherConditions.length > 0 &&
        value.otherConditions.length !== policy.otherConditions.length))
  )
    fail();
  if (Object.hasOwn(value, "sourceFields")) {
    if (
      !value.sourceFields ||
      typeof value.sourceFields !== "object" ||
      Array.isArray(value.sourceFields) ||
      Object.keys(value.sourceFields).length > 128 ||
      Object.values(value.sourceFields).some(
        (item) => typeof item !== "string" || item.length > 100000,
      )
    )
      fail();
    if (
      policy.sourceFields &&
      Object.keys(policy.sourceFields).length > 0 &&
      Object.keys(policy.sourceFields).sort().join("\0") !==
        Object.keys(value.sourceFields).sort().join("\0")
    )
      fail();
  }
  return { ...policy, ...value };
}

function subscribe(promise, signal, onFinish = () => {}) {
  if (!signal) return promise.finally(onFinish);
  if (signal.aborted) {
    onFinish();
    return Promise.reject(new PolicyTranslationError("aborted"));
  }
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (!finished) {
        finished = true;
        onFinish();
      }
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new PolicyTranslationError("aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        finish();
        resolve(value);
      },
      (error) => {
        finish();
        reject(error);
      },
    );
  });
}

/** Bounded in-memory display cache. Server stores durable results; no user text is submitted. */
export function createPolicyTranslationClient({
  request,
  maxEntries = 100,
  maxPending = 128,
  ttlMs = 30000,
  now = Date.now,
} = {}) {
  if (typeof request !== "function") throw new TypeError("request is required");
  const cache = new Map();
  const inflight = new Map();
  const queue = [];
  let running = false;
  let generation = 0;
  const fingerprint = (policy, language) =>
    JSON.stringify([
      policy.id,
      policy.revisionId ?? null,
      language,
      ...policyTranslationFields.map((key) => policy[key] ?? null),
    ]);
  async function drain() {
    if (running) return;
    running = true;
    while (queue.length) {
      queue.sort((a, b) => b.priority - a.priority);
      const task = queue.shift();
      if (task.cancelled) continue;
      task.started = true;
      try {
        const response = await request(
          `/v1/policies/${encodeURIComponent(task.policy.id)}/translation?language=${task.language}`,
          { timeoutMs: 65000 },
        );
        const result = applyPolicyTranslation(
          task.policy,
          task.language,
          response,
        );
        if (task.generation === generation) {
          cache.delete(task.key);
          cache.set(task.key, { response, expires: now() + ttlMs });
          while (cache.size > maxEntries)
            cache.delete(cache.keys().next().value);
        }
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      } finally {
        if (inflight.get(task.key) === task) inflight.delete(task.key);
      }
    }
    running = false;
  }
  return {
    /**
     * @param {any} policy
     * @param {string} language
     * @param {{signal?: AbortSignal, priority?: number}} [options]
     */
    translate(policy, language, { signal, priority = 0 } = {}) {
      if (!policy || typeof policy.id !== "string" || !policy.id.trim())
        return Promise.reject(new PolicyTranslationError("invalid_policy"));
      if (signal?.aborted)
        return Promise.reject(new PolicyTranslationError("aborted"));
      if (language === "ko") return Promise.resolve(policy);
      if (!languages.has(language))
        return Promise.reject(
          new PolicyTranslationError("unsupported_language"),
        );
      const key = fingerprint(policy, language);
      const stored = cache.get(key);
      if (stored && stored.expires > now())
        return subscribe(
          Promise.resolve(
            applyPolicyTranslation(policy, language, stored.response),
          ),
          signal,
        );
      cache.delete(key);
      let task = inflight.get(key);
      if (!task) {
        if (queue.filter((item) => !item.cancelled).length >= maxPending)
          return Promise.reject(
            new PolicyTranslationError(
              "translation_busy",
              "translation_busy",
              429,
            ),
          );
        task = {
          key,
          policy,
          language,
          priority,
          generation,
          subscribers: 0,
          started: false,
          cancelled: false,
        };
        task.promise = new Promise((resolve, reject) => {
          task.resolve = resolve;
          task.reject = reject;
        });
        inflight.set(key, task);
        queue.push(task);
        void drain();
      } else task.priority = Math.max(task.priority, priority);
      // A subscriber cancelling never aborts a request still used by another card/detail.
      task.subscribers += 1;
      return subscribe(
        task.promise.then((result) => ({
          ...policy,
          ...Object.fromEntries(
            policyTranslationFields
              .filter((field) => Object.hasOwn(result, field))
              .map((field) => [field, result[field]]),
          ),
        })),
        signal,
        () => {
          task.subscribers -= 1;
          if (!task.subscribers && !task.started && !task.cancelled) {
            task.cancelled = true;
            const queuedIndex = queue.indexOf(task);
            if (queuedIndex >= 0) queue.splice(queuedIndex, 1);
            if (inflight.get(task.key) === task) inflight.delete(task.key);
            task.reject(new PolicyTranslationError("aborted"));
          }
        },
      );
    },
    clear() {
      generation += 1;
      cache.clear();
      inflight.clear();
      for (const task of queue.splice(0))
        task.reject(new PolicyTranslationError("aborted"));
    },
  };
}
