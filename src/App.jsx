import { useEffect } from 'react';
import { isConfigured } from './api.js';
import { useRoute, linkTo, navigate } from './router.js';
import { useSession } from './session.jsx';
import { Avatar, Empty, Spinner, useToast } from './ui.jsx';
import Home from './pages/Home.jsx';
import EventPage from './pages/Event.jsx';
import EventForm from './pages/EventForm.jsx';
import Me from './pages/Me.jsx';
import Club from './pages/Club.jsx';
import Checkin from './pages/Checkin.jsx';
import Welcome from './pages/Welcome.jsx';

function Backdrop() {
  return (
    <>
      <div className="bg" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  );
}

const TABS = [
  { to: '/', label: 'Events', icon: 'M4 7h16M4 12h16M4 17h10' },
  { to: '/me', label: 'Dossards', icon: 'M5 4h14v16H5zM9 9h6M9 13h6' },
  { to: '/club', label: 'Club', icon: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5m0-4.6c.6-.3 1.3-.4 2-.4 3 0 6 2 6 5' },
];

function Nav({ path }) {
  const active = (to) => (to === '/' ? path === '/' || path.startsWith('/e/') : path.startsWith(to));
  return (
    <nav className="tabbar glass" aria-label="Navigation">
      {TABS.slice(0, 1).map((t) => (
        <Tab key={t.to} {...t} active={active(t.to)} />
      ))}
      <a className="tab-create" href={linkTo('/new')} aria-label="Créer un event">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </svg>
      </a>
      {TABS.slice(1).map((t) => (
        <Tab key={t.to} {...t} active={active(t.to)} />
      ))}
    </nav>
  );
}

function Tab({ to, label, icon, active }) {
  return (
    <a className={`tab${active ? ' active' : ''}`} href={linkTo(to)}>
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d={icon} stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
    </a>
  );
}

function Setup() {
  return (
    <Empty title="Presque prêt 🏁">
      <p className="muted">
        L'app n'est pas encore branchée à sa base de données. Suis les 3 étapes du README
        (Supabase → <code>schema.sql</code> → les 2 variables GitHub), puis relance le déploiement.
      </p>
    </Empty>
  );
}

function TokenLogin({ token }) {
  const { loginWithToken } = useSession();
  const toast = useToast();
  useEffect(() => {
    loginWithToken(token)
      .then(() => toast('Connecté. Bon retour 👟'))
      .catch(() => toast('Lien de connexion invalide.', 'error'))
      .finally(() => navigate('/'));
  }, [token, loginWithToken, toast]);
  return <Spinner />;
}

function Page({ path }) {
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'e' && seg[2] === 'edit') return <EventForm id={seg[1]} />;
  if (seg[0] === 'e' && seg[1]) return <EventPage id={seg[1]} />;
  if (seg[0] === 'new') return <EventForm />;
  if (seg[0] === 'me') return <Me />;
  if (seg[0] === 'club') return <Club />;
  if (seg[0] === 'checkin') return <Checkin eventId={seg[1]} bib={seg[2]} />;
  return <Home />;
}

export default function App() {
  const path = useRoute();
  const { me, ready } = useSession();
  const loginToken = path.startsWith('/login/') ? path.slice(7) : null;

  let content;
  if (!isConfigured()) content = <Setup />;
  else if (loginToken) content = <TokenLogin token={loginToken} />;
  else if (!ready) content = <Spinner />;
  else if (!me) content = <Welcome />;
  else content = <Page path={path} />;

  return (
    <>
      <Backdrop />
      {me && (
        <header className="topbar">
          <a href={linkTo('/')} className="logo">
            PERF<sup>®</sup>
          </a>
          <a href={linkTo('/me')} className="topbar-me" aria-label="Mon profil">
            <Avatar name={me.name} color={me.color} size={38} />
          </a>
        </header>
      )}
      <main className={me ? 'shell' : 'shell bare'}>{content}</main>
      {me && <Nav path={path} />}
    </>
  );
}
