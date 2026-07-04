"use client";

import Link from "next/link";

import { useAuth } from "@/components/providers/auth-provider";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getLastVisitedCookie, lastVisitedHref } from "@/lib/last-visited";

export const Navbar = () => {
  const { isAuthenticated, signOut } = useAuth();
  const dashboardHref = lastVisitedHref(getLastVisitedCookie());

  return (
    <div className="fixed top-0 w-full h-14 px-4 border-b shadow-sm bg-white flex items-center">
      <div className="md:max-w-screen-2xl mx-auto flex items-center w-full justify-between">
        <Logo />
        <div className="space-x-4 md:block md:w-auto flex items-center justify-between w-full">
          {isAuthenticated ? (
            <>
              <Button size="sm" variant="outline" asChild>
                <Link href={dashboardHref}>
                  Go to Dashboard
                </Link>
              </Button>
              <Button size="sm" onClick={() => signOut()}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" asChild>
                <Link href="/sign-in">
                  Login
                </Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/sign-up">
                  Get Taskify for free
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
