"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth/client";

export default function SignOutButton({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  return <Button variant="outline" onClick={async () => { await authClient.signOut(); router.push("/login"); router.refresh(); }}>{label}</Button>;
}
