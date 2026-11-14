import type { ReactNode } from "react";

// The public screens: sign in, sign up, forgot and reset password. This
// layout deliberately has no AppShell — nothing here opens the farm store.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="auth-logo">
          <span className="mark" aria-hidden>
            🐖
          </span>
          My Pigs
        </div>
        <div className="auth-pitch">
          <h2>The whole farm, in your pocket.</h2>
          <ul>
            <li>Every pig by tag, every room, every weigh-in</li>
            <li>Feed, costs and sales that add up</li>
            <li>Works at the pen with no signal</li>
          </ul>
        </div>
        <p className="auth-small">Your records stay on your own devices.</p>
      </aside>
      <main className="auth-main">
        <div className="auth-col">
          <div className="auth-logo compact">
            <span className="mark" aria-hidden>
              🐖
            </span>
            My Pigs
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
