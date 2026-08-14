"use client";

import { Icon } from "@/components/Icon";
import { Dumbbell, PersonStanding } from "lucide-react";

function ChoiceIcon({ name }: { name: "whistle" | "person" | "dumbbell" }) {
  if (name === "whistle") {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 15.5h7.4a4.6 4.6 0 1 0 0-9.2H8.8L4 11.1v4.4Z" />
        <path d="M11.5 6.3 15 3h5l-3.7 5.2" />
        <circle cx="11.5" cy="10.9" r="1.6" />
      </svg>
    );
  }

  if (name === "person") return <PersonStanding size={27} strokeWidth={2.25} aria-hidden="true" />;
  return <Dumbbell size={27} strokeWidth={2.25} aria-hidden="true" />;
}

export function AddWeekChoices({
  canCoach,
  disabled = false,
  onCoach,
  onAttend,
  onPersonal,
}: {
  canCoach: boolean;
  disabled?: boolean;
  onCoach: () => void;
  onAttend: () => void;
  onPersonal: () => void;
}) {
  const choices = [
    ...(canCoach
      ? [{
          title: "Teaching a class",
          detail: "I’m the coach",
          icon: "whistle" as const,
          onClick: onCoach,
        }]
      : []),
    {
      title: "Taking a class",
      detail: "I’m attending",
      icon: "person" as const,
      onClick: onAttend,
    },
    {
      title: "Working out on my own",
      detail: "Just for me",
      icon: "dumbbell" as const,
      onClick: onPersonal,
    },
  ];

  return (
    <div className="addweek-options" role="group" aria-label="What are you doing?">
      {choices.map((choice) => (
        <button key={choice.title} type="button" disabled={disabled} onClick={choice.onClick}>
          <span className="addweek-option-icon" aria-hidden="true">
            <ChoiceIcon name={choice.icon} />
          </span>
          <span className="addweek-option-copy">
            <b>{choice.title}</b>
            <small>{choice.detail}</small>
          </span>
          <Icon name="chevron_right" size={20} />
        </button>
      ))}
    </div>
  );
}
