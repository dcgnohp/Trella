import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";

import { Info } from "../_components/info";

/**
 * Billing page placeholder (Req 10.2, 10.3, 13.6).
 *
 * Phase 1 of the backend-modular-refactor explicitly drops Stripe / billing:
 *  - `is_pro` always returns `false` on the backend (Req 10.2).
 *  - There are no `/api/v1/billing/*` endpoints (Req 10.3).
 *
 * The previous page rendered a `<SubscriptionButton />` that called the now
 * stubbed `stripeRedirect` action; we replace it with a static "not available
 * in Phase 1" notice using shadcn's `Card` primitive. PART 2 will wire in real
 * billing once the backend gains the endpoints.
 */
const BillingPage = async () => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  // Phase 1: no Pro tier (Req 10.2).
  const isPro = false;

  return (
    <div className="w-full">
      <Info isPro={isPro} />
      <Separator className="my-2" />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-x-2">
            <CreditCard className="h-5 w-5 text-neutral-700" />
            <CardTitle>Billing</CardTitle>
          </div>
          <CardDescription>
            Billing is not available in Phase 1.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          All workspaces run on the free tier (up to 5 boards each). Pro
          subscriptions and per-seat billing will land in a later phase.
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingPage;
