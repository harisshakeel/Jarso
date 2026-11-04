// Maestro runScript (GraalJS): the test child asks for 1 extra, as the phone's "Ask for extra"
// sheet does, then dispatches pushes, so the parent's phone gets a notice. An ask for extra
// always waits for a parent, whatever the family's rules. Reads API_URL, SUPABASE_URL,
// SUPABASE_PUBLISHABLE_KEY and the CHILD_* vars from `-e`. Prints nothing: the bearer and the
// key never reach Maestro's output. The PIN and the bearer go only over HTTPS: a plain-HTTP
// API_URL or SUPABASE_URL is refused unless it is this machine (localhost or loopback).

function requireSecure(url, name) {
  const secure = /^https:\/\//i.test(url);
  const loopback = /^http:\/\/(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?(\/|$)/i.test(url);
  if (!secure && !loopback) {
    throw new Error(`${name} must be https:// (use an HTTPS tunnel), or localhost`);
  }
}

requireSecure(API_URL, "API_URL");
requireSecure(SUPABASE_URL, "SUPABASE_URL");

function check(response, step) {
  if (!response.ok) throw new Error(`${step} failed with HTTP ${response.status}`);
  return json(response.body);
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}

const signIn = check(
  http.post(`${API_URL}/api/v1/auth/child-sign-in`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      familyCode: CHILD_FAMILY_CODE,
      nickname: CHILD_NICKNAME,
      pin: CHILD_PIN,
    }),
  }),
  "Child sign-in",
);
const bearer = `Bearer ${signIn.data.accessToken}`;
const supabaseHeaders = {
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: bearer,
  "Content-Type": "application/json",
};

const child = check(http.get(`${SUPABASE_URL}/auth/v1/user`, { headers: supabaseHeaders }), "User");

check(
  http.post(`${SUPABASE_URL}/rest/v1/rpc/create_emergency`, {
    headers: supabaseHeaders,
    body: JSON.stringify({
      p_child_id: child.id,
      p_amount_minor: 100,
      p_reason: `Push check ${Math.floor(Math.random() * 100000)}`,
      p_idempotency_key: uuid(),
    }),
  }),
  "Ask for extra",
);

check(
  http.post(`${API_URL}/api/v1/notices/dispatch`, { headers: { Authorization: bearer } }),
  "Dispatch",
);
