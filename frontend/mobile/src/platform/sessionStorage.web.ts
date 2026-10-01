// Browser preview deliberately keeps tokens only in memory, never localStorage.
let session: unknown = null;
export const sessionStorage = {
  async read() {
    return session;
  },
  async write(value: unknown) {
    session = value;
  },
  async clear() {
    session = null;
  },
};
