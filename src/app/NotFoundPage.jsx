import React from 'react';

export default function NotFoundPage({ lang = 'it', onHome }) {
  const it = lang !== 'en';
  return (
    <section className="section page-section not-found-page" aria-labelledby="notFoundTitle">
      <div className="container">
        <article className="content-card not-found-card">
          <span className="kicker">404</span>
          <h1 id="notFoundTitle">{it ? 'Pagina non trovata' : 'Page not found'}</h1>
          <p>{it ? 'La pagina richiesta non è disponibile. Torna alla homepage per esplorare le esperienze vulcanIQ.' : 'The requested page is not available. Return to the homepage to explore vulcanIQ experiences.'}</p>
          <button className="button primary" type="button" onClick={onHome}>{it ? 'Torna alla homepage' : 'Back to homepage'}</button>
        </article>
      </div>
    </section>
  );
}
