// One interactive login per failure episode. Never replay a failed tool:
// it may represent a paid operation. Successful reads re-arm recovery.
export function createAuthRecovery({ expired, login, failed }) {
  let pending;
  let attempted = false;
  let verified = false;
  function start() {
    if (pending) return pending;
    attempted = true;
    verified = false;
    pending = Promise.resolve()
      .then(login)
      .catch(failed)
      .finally(() => {
        pending = undefined;
        if (verified) attempted = false;
      });
    return pending;
  }
  return {
    login: start,
    observe(name, result) {
      if (name.startsWith("tripo_auth_")) return;
      const error = result.structuredContent?.error;
      if (
        result.isError &&
        ["AUTH_REQUIRED", "AUTH_EXPIRED"].includes(error?.code)
      ) {
        verified = false;
        expired();
        if (!attempted) void start();
      } else if (!result.isError && name === "tripo_get_payment") {
        verified = true;
        if (!pending) attempted = false;
      }
    },
  };
}
