import { useEffect, useState } from 'react';
import { ChatWidgetMount } from './ChatWidgetMount';

function HomePage() {
  return (
    <main>
      <h1>Home</h1>
      <p>This is the home page. Open the chat, then navigate to About via the link below.</p>
      <a href="#about">Go to About →</a>
    </main>
  );
}

function AboutPage() {
  return (
    <main>
      <h1>About</h1>
      <p>
        If the widget survived the navigation here with its messages and open/closed state intact,
        that proves it's mounted as a sibling of this routed content — not inside it.
      </p>
      <a href="#home">← Back to Home</a>
    </main>
  );
}

function currentRoute(): string {
  return window.location.hash.replace(/^#/, '') || 'home';
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function renderPage() {
    switch (route) {
      case 'about':
        return <AboutPage />;
      default:
        return <HomePage />;
    }
  }

  return (
    <>
      {renderPage()}
      {/*
        Sibling of renderPage()'s output, not inside it — React never unmounts this
        on a hash change, so ChatWidgetMount's internal mount() instance (and the
        widget's own state) survives navigation for free.
      */}
      <ChatWidgetMount
        workerUrl={import.meta.env.VITE_AI_WORKER_URL}
        title="Site Assistant"
        placeholder="Ask a question…"
        theme="auto"
      />
    </>
  );
}
