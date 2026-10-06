import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [me, setMe] = useState(null);
  const [config, setConfig] = useState({ clubName: 'PERF', requiresCode: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api('/config').then(setConfig).catch(() => {});
    if (!getToken()) {
      setReady(true);
      return;
    }
    api('/me')
      .then(setMe)
      .catch((err) => {
        if (err.status === 401) setToken(null);
      })
      .finally(() => setReady(true));
  }, []);

  const signUp = useCallback(async (payload) => {
    const { member, token } = await api('/members', { method: 'POST', body: payload });
    setToken(token);
    setMe(member);
  }, []);

  const loginWithToken = useCallback(async (token) => {
    setToken(token);
    try {
      setMe(await api('/me'));
    } catch (err) {
      setToken(null);
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
  }, []);

  return (
    <SessionContext.Provider value={{ me, setMe, config, ready, signUp, loginWithToken, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
