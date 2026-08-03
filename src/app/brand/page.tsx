import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { brandIcon } from "@/lib/brand";
import { getSessionUserId } from "@/lib/session";
import { AppChrome } from "@/components/AppChrome";
import { BackLink } from "@/components/BackLink";
import { BrandGuide } from "@/components/BrandGuide";
import { Icon } from "@/components/Icon";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Brand · fittlist",
  description: "The fittlist mark, colour, type and voice.",
};

// The brand guide. Open to anyone with the link: it's a reference, not a
// secret, and needing an account to read it would be one more thing in the way
// of handing it to whoever is making something. The settings row that points
// here is admin-only, so it isn't clutter on a coach's account.
export default async function BrandPage() {
  const userId = await getSessionUserId();
  let look: string | null = null;
  if (userId) {
    const db = await getDb();
    const [me] = await db
      .select({ look: schema.users.look })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    look = me?.look ?? null;
  }

  return (
    <section
      className={`screen admin${userId ? " hasnav" : ""}`}
      data-mode={lookMode(look)}
    >
      <div className="pad">
        {userId && <AppChrome userId={userId} bar />}
        {userId && (
          <div className="folback">
            <BackLink className="evback" href="/you" label="Back to your account">
              <Icon name="arrow_back" size={21} />
            </BackLink>
          </div>
        )}
        <div className="admintop">
          <div>
            <h1>Brand</h1>
            <p className="adminsub">The mark, the colour, the type and the words</p>
          </div>
        </div>
        <BrandGuide mark={brandIcon("#dd6a35")} />
      </div>
    </section>
  );
}
