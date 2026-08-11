import Link from "next/link";
import { avatarColor } from "@/lib/avatar";
import { studioPath } from "@/lib/studio";
import { schema } from "@/db";

type Studio = typeof schema.studios.$inferSelect;

export function ProfileStudioRail({ studios }: { studios: Studio[] }) {
  return (
    <div className="strail profile-studio-rail">
      {studios.map((studio) => (
        <Link key={studio.id} className="strail-item" href={studioPath(studio)}>
          <span className="strail-ph">
            {studio.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.photo} alt="" />
            ) : (
              <span
                className="strail-ini"
                style={{ background: avatarColor({ id: studio.id }) }}
                aria-hidden="true"
              >
                {(studio.name.trim().charAt(0) || "?").toUpperCase()}
              </span>
            )}
          </span>
          <span className="strail-nm">{studio.name}</span>
          {studio.types.length > 0 && (
            <span className="strail-types">{studio.types.slice(0, 2).join(" · ")}</span>
          )}
          {studio.address && (
            <span className="strail-mi">{studio.address.split(",").slice(0, 2).join(",")}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
