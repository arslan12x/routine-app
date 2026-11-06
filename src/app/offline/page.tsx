export default function Offline() {
  return (
    <main className="grid min-h-dvh place-items-center p-8 text-center">
      <div>
        <h1 className="display text-3xl font-semibold">You&apos;re offline</h1>
        <p className="mt-2 text-muted">Routine needs a connection to sync your tasks. Reconnect and try again.</p>
      </div>
    </main>
  );
}
