import { AppShell } from "@/components/sidebar/AppShell";
import { getCurrentIdentity } from "@/lib/identity";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const identity = await getCurrentIdentity();

  return <AppShell identity={identity}>{children}</AppShell>;
}
