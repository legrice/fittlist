import type { ButtonHTMLAttributes } from "react";
import { ChevronLeft } from "./PhosphorIcons";

export function BackButton({ label = "Back", className = "", ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return <button type="button" {...props} aria-label={label} className={`app-back-button ${className}`}><ChevronLeft size={22} aria-hidden="true" /></button>;
}
