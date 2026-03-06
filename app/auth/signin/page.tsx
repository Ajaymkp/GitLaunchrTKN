"use client";

import { createSupabaseBrowser } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import PixelButton from "@/app/components/PixelButton";
import { GithubIcon } from "@/app/components/Icons";
import styles from "./signin.module.css";
import { Suspense } from "react";

function SignInContent() {
  const params = useSearchParams();
  const next   = params.get("next") ?? "/";

  const handleSignIn = async () => {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });
  };

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <h1 className={`${styles.title} glow-primary`}>GITLAUNCHR</h1>
        <p className={styles.sub}>Sign in to launch your token on Base</p>
        <PixelButton variant="primary" size="lg" onClick={handleSignIn}>
          <GithubIcon size={16} color="white" />
          SIGN IN WITH GITHUB
        </PixelButton>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
