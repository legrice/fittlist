"use client";

import { Icon } from "@/components/Icon";

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
          onClick: onCoach,
        }]
      : []),
    {
      title: "Taking a class",
      detail: "I’m attending",
      onClick: onAttend,
    },
    {
      title: "Working out on my own",
      detail: "Just for me",
      onClick: onPersonal,
    },
  ];

  return (
    <div className="addweek-options" role="group" aria-label="What are you doing?">
      {choices.map((choice) => (
        <button key={choice.title} type="button" disabled={disabled} onClick={choice.onClick}>
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
