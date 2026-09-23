import Link from "next/link";

export default function NotFound() {
  return (
    <div className="splash">
      <div className="logo">🐖</div>
      <h1>Nothing here</h1>
      <p className="muted">That screen does not exist.</p>
      <Link href="/" className="btn primary">
        Back to the farm
      </Link>
    </div>
  );
}
