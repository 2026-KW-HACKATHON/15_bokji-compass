import {
  emptyMember,
  emptyVehicle,
  MAX_HOUSEHOLD_SIZE,
} from "@bokji/core/finance-model";

export function updateDraft(draft, path, value, cache = {}) {
  const next = JSON.parse(JSON.stringify(draft));
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((node, key) => node[key], next)[last] = value;
  if (path === "household_size") {
    const count = value == null || value === "" ? null : Number(value);
    draft.members.forEach((member, index) => {
      (cache.members ??= [])[index] = member;
    });
    next.household_size = count;
    if (!Number.isInteger(count) || count < 1 || count > MAX_HOUSEHOLD_SIZE)
      return next;
    next.members = Array.from(
      { length: count },
      (_, i) => next.members[i] ?? cache.members?.[i] ?? emptyMember(),
    );
    next.household_scope_confirmed = false;
    if (Number(next.minor_children) > Number(value)) next.minor_children = null;
  }
  if (path === "vehicle_status") {
    if (draft.vehicles.length) cache.vehicles = draft.vehicles;
    next.vehicles =
      value === "owned"
        ? next.vehicles.length
          ? next.vehicles
          : cache.vehicles?.length
            ? cache.vehicles
            : [emptyVehicle()]
        : [];
  }
  return next;
}
