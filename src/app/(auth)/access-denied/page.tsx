import SignOutButton from "@/features/settings/SignOutButton";
export default function AccessDenied() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="display text-4xl font-semibold">Access denied</h1>
        <p className="mt-3 text-muted">Your account is unavailable. Ask the admin to create or restore your account, then try again.</p>
        <div className="mt-6"><SignOutButton label="Try another account" /></div>
      </div>
    </main>
  );
}
