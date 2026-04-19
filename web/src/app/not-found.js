export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-vp-text mb-4">404</h1>
      <p className="text-lg text-vp-dim mb-8">This page doesn't exist.</p>
      <a href="/" className="px-6 py-3 bg-vp-accent text-white rounded-lg font-semibold hover:opacity-90 transition-opacity">Go home</a>
    </div>
  );
}
