"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { createClient } from "@/lib/supabase/client";
import { landingCopy } from "../copy";
import { GetStartedMenu } from "./get-started-menu";

/**
 * The navbar's way in. The landing page is static, so the browser asks Supabase for its own
 * session: signed in, the button opens the dashboard; otherwise it is the Get started menu.
 */
export function SessionNav() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(data.session !== null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (!signedIn) return <GetStartedMenu />;
  return (
    <Link href={routes.dashboard} className={buttonVariants({ className: "px-4" })}>
      {landingCopy.nav.dashboard}
    </Link>
  );
}
