import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { GreaterInsideLogo } from "@/components/branding/GreaterInsideLogo";

export default async function LoginPage() {
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/ask");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#E9E9E6] px-4">
      <div className="w-full max-w-[380px]">
        <div className="card-chunky p-7">
          <div className="mb-6 flex justify-center">
            <GreaterInsideLogo variant="dark" size={22} />
          </div>
          <p className="mb-1 text-[15px] font-semibold text-navy">Sign in to Alina</p>
          <p className="mb-6 text-[12.5px] text-charcoal/55">
            Use the email and password an admin set up for you.
          </p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
        {!process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <p className="mt-4 text-center text-[11.5px] text-charcoal/40">
            Supabase isn&apos;t configured in this environment yet.
          </p>
        )}
      </div>
    </div>
  );
}
