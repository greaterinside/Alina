import { redirect } from "next/navigation";
import { getCurrentIdentity } from "@/lib/identity";
import { canSeeAdminSections } from "@/lib/types";

/** Server-side guard for the three admin/senior-only screens. */
export async function requireAdminIdentity() {
  const identity = await getCurrentIdentity();
  if (!canSeeAdminSections(identity.role)) {
    redirect("/ask");
  }
  return identity;
}
