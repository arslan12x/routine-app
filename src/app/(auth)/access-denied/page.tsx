import SignOutButton from "@/features/settings/SignOutButton";
export default function AccessDenied() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="display text-4xl font-semibold">Access denied</h1>
        <p className="mt-3 text-muted">This app is invite-only and your Google account isn&apos;t on the list. Ask the admin to add your email, then try again.</p>
        <div className="mt-6"><SignOutButton label="Try another account" /></div>
      </div>
    </main>
  );
}
