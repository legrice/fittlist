"use client";

import { Icon } from "@/components/Icon";

export function AddWeekChoices({
  canCoach,
  disabled = false,
  onCoach,
  onAttend,
  onPersonal,
  selected,
  onSelect,
}: {
  canCoach: boolean;
  disabled?: boolean;
  onCoach?: () => void;
  onAttend?: () => void;
  onPersonal?: () => void;
  selected?: "coaching" | "saved" | "personal" | null;
  onSelect?: (kind: "coaching" | "saved" | "personal") => void;
}) {
  const choices = [
    ...(canCoach
      ? [{
          kind: "coaching",
          title: "Teaching a class",
          detail: "I’m the coach",
          onClick: onCoach,
        }]
      : []),
    {
      kind: "saved",
      title: "Taking a class",
      detail: "I’m attending",
      onClick: onAttend,
    },
    {
      kind: "personal",
      title: "Working out on my own",
      detail: "Just for me",
      onClick: onPersonal,
    },
  ];

  return (
    <div className={`addweek-options${onSelect ? " selectable" : ""}`} role="group" aria-label="What are you doing?">
      {choices.map((choice) => (
        <button className={`addweek-option-${choice.kind}${selected === choice.kind ? " selected" : ""}`} key={choice.title} type="button" disabled={disabled} aria-pressed={onSelect ? selected === choice.kind : undefined} onClick={() => onSelect ? onSelect(choice.kind as "coaching" | "saved" | "personal") : choice.onClick?.()}>
          <span className="addweek-option-copy">
            <b>{choice.title}</b>
            <small>{choice.detail}</small>
          </span>
          {onSelect ? <span className="addweek-radio" /> : <Icon name="chevron_right" size={20} />}
        </button>
      ))}
    </div>
  );
}
