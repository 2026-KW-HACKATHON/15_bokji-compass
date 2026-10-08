export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const url = new URL(path, "bokji-compass://");
    if (
      url.protocol === "bokji-compass:" &&
      url.hostname === "auth" &&
      url.pathname === "/callback"
    )
      return "/account";
    return path;
  } catch {
    return "/account";
  }
}
