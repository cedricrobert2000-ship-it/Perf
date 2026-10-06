import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';

const TOKEN_KEY = 'perf.token';

export const isConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: session-only login */
  }
};

// The app keeps its REST-style calls; each one maps to a perf_* function in
// supabase/schema.sql. Handlers get (url params, body, token) and return [function, args].
const ROUTES = [
  ['GET', /^\/config$/, () => ['perf_config', {}]],
  ['POST', /^\/members$/, (_, b) => ['perf_join', { p_name: b.name, p_color: b.color, p_code: b.code ?? '' }]],
  ['GET', /^\/members$/, () => ['perf_members', {}]],
  ['GET', /^\/me$/, (_, b, t) => ['perf_me', { p_token: t }]],
  ['PATCH', /^\/me$/, (_, b, t) => ['perf_update_me', { p_token: t, p_name: b.name, p_color: b.color }]],
  ['GET', /^\/me\/bibs$/, (_, b, t) => ['perf_my_bibs', { p_token: t }]],
  ['GET', /^\/events$/, (_, b, t, q) => ['perf_events', { p_token: t, p_scope: q.get('scope') || 'upcoming' }]],
  ['POST', /^\/events$/, (_, b, t) => ['perf_save_event', { p_token: t, p_id: null, p_body: b }]],
  ['GET', /^\/events\/(\d+)$/, ([id], b, t) => ['perf_event', { p_token: t, p_id: id }]],
  ['PATCH', /^\/events\/(\d+)$/, ([id], b, t) => ['perf_save_event', { p_token: t, p_id: id, p_body: b }]],
  ['DELETE', /^\/events\/(\d+)$/, ([id], b, t) => ['perf_delete_event', { p_token: t, p_id: id }]],
  ['POST', /^\/events\/(\d+)\/register$/, ([id], b, t) => ['perf_register', { p_token: t, p_id: id }]],
  ['DELETE', /^\/events\/(\d+)\/register$/, ([id], b, t) => ['perf_unregister', { p_token: t, p_id: id }]],
  ['POST', /^\/events\/(\d+)\/checkin$/, ([id], b, t) => [
    'perf_checkin', { p_token: t, p_id: id, p_bib: b.bib ?? null, p_present: b.present !== false },
  ]],
  ['PUT', /^\/events\/(\d+)\/results\/(\d+)$/, ([id, memberId], b, t) => [
    'perf_set_result', { p_token: t, p_id: id, p_member_id: memberId, p_result_s: b.resultS ?? null },
  ]],
  ['POST', /^\/events\/(\d+)\/comments$/, ([id], b, t) => ['perf_comment', { p_token: t, p_id: id, p_body: b.body }]],
];

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

export async function api(path, { method = 'GET', body } = {}) {
  if (!isConfigured()) fail("L'app n'est pas encore branchée à Supabase.", 503);
  const [pathname, search = ''] = path.split('?');
  const route = ROUTES.find(([m, re]) => m === method && re.test(pathname));
  if (!route) fail('Route inconnue.', 404);
  const params = route[1].exec(pathname).slice(1).map(Number);
  const [fn, args] = route[2](params, body ?? {}, getToken(), new URLSearchParams(search));

  let res;
  try {
    res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch {
    fail('Erreur réseau.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(res.status >= 500 || !data?.message ? 'Oups, erreur serveur.' : data.message, res.status);
  return data;
}
