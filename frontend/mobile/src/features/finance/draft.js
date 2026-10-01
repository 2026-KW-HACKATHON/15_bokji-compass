import { emptyMember, emptyVehicle } from "@bokji/core/finance-model";

export function updateDraft(draft, path, value) {
  const next = JSON.parse(JSON.stringify(draft));
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((node, key) => node[key], next)[last] = value;
  if (path === "household_size") {
    next.household_size = Number(value);
    next.members = Array.from(
      { length: Number(value) },
      (_, i) => next.members[i] ?? emptyMember(),
    );
    if (Number(next.minor_children) > Number(value)) next.minor_children = null;
  }
  if (path === "vehicle_status")
    next.vehicles =
      value === "owned"
        ? next.vehicles.length
          ? next.vehicles
          : [emptyVehicle()]
        : [];
  return next;
}
