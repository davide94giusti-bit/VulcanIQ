import React from 'react';

export default class DomainErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('public_domain_render_failed', { name: error?.name || 'Error' });
  }

  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      const it = this.props.lang !== 'en';
      return (
        <section className="section page-section domain-error-boundary" role="alert">
          <div className="container">
            <article className="content-card not-found-card">
              <span className="kicker">vulcanIQ</span>
              <h1>{it ? 'Contenuto temporaneamente non disponibile' : 'Content temporarily unavailable'}</h1>
              <p>{it ? 'Ricarica la pagina. Le funzioni di prenotazione e gli altri servizi restano separati da questo errore di visualizzazione.' : 'Reload the page. Booking and other services remain isolated from this display error.'}</p>
              <button className="button primary" type="button" onClick={() => window.location.reload()}>{it ? 'Ricarica' : 'Reload'}</button>
            </article>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
