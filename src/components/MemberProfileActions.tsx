"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";

// The owner looking at their own profile. One button, and it goes to the place
// the fields actually live rather than opening a second editor here.
export function MemberProfileActions() {
  return (
    <Link className="evback mempro-edit" href="/you?edit=1" aria-label="Edit your profile">
      <Icon name="account_circle" size={20} />
    </Link>
  );
}
