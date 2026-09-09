import { Sidebar } from "@/components/sidebar/Sidebar";
import { WelcomeOverlay } from "@/components/welcome/WelcomeOverlay";
import { getCurrentIdentity } from "@/lib/identity";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const identity = await getCurrentIdentity();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-offwhite">
      <Sidebar identity={identity} />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      <WelcomeOverlay />
    </div>
  );
}
