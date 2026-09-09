import { Suspense } from "react";
import { AskScreen } from "@/components/ask/AskScreen";
import { getCurrentIdentity } from "@/lib/identity";

export default async function AskPage() {
  const identity = await getCurrentIdentity();

  return (
    <Suspense fallback={null}>
      <AskScreen allowedWorkspaces={identity.workspaces} userName={identity.name} />
    </Suspense>
  );
}
