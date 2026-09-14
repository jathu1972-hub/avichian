/**
 * Lightweight theme atmosphere. It is deliberately visual-only: no data, input
 * handlers or canvas, so it cannot block scrolling, touch, or existing features.
 * A future R3F scene can replace this component without changing the app shell.
 */
export function ThemeDecoration() {
  return (
    <div className="theme-decoration" aria-hidden="true">
      <span className="theme-orb theme-orb-one" />
      <span className="theme-orb theme-orb-two" />
      <span className="theme-rune theme-rune-one">✦</span>
      <span className="theme-rune theme-rune-two">✧</span>
      <span className="theme-grid" />
    </div>
  );
}
