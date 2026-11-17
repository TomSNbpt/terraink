export default function GeneralHeader() {
  return (
    <header className="general-header">
      <div className="desktop-brand">
        <img
          className="desktop-brand-logo brand-logo"
          src="/assets/logo.svg"
          alt="Terraink logo"
        />
        <div className="desktop-brand-copy brand-copy">
          <h1 className="desktop-brand-title">Terraink</h1>
          <p className="desktop-brand-kicker app-kicker">
            Free Map Poster & Wallpaper Creator
          </p>
        </div>
      </div>
    </header>
  );
}
