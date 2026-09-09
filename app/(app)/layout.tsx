import { Sidebar } from "@/components/sidebar/Sidebar";
import { WelcomeOverlay } from "@/components/welcome/WelcomeOverlay";
import { getCurrentIdentity } from "@/lib/identity";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const identity = await getCurrentIdentity();

  return (
    <div className="flex h-screen w-full gap-3 overflow-hidden bg-[#E9E9E6] p-3">
      <Sidebar identity={identity} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-offwhite shadow-soft">
        {children}
      </main>
      <WelcomeOverlay />
    </div>
  );
}
