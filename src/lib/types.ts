import type { BookingLink } from "@/db/schema";

export type StudioDto = { id: string; seq: number; name: string; address: string };

export type ClassDto = {
  id: string;
  templateId: string | null; // weekly rows of one class share a template
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  specificDate: string | null; // ISO date if a one-off; null = standing weekly
  startTime: string; // "HH:MM"
  durationMin: number;
  name: string;
  classType: string | null;
  description: string | null;
  studioId: string | null;
  location: string | null;
  isPublic: boolean;
  links: BookingLink[];
};

// A class the coach is attending as a participant, on one specific day. Kept
// separate from ClassDto on purpose: what you teach is public and lives on
// your page; what you attend is private and never leaves your own app.
export type AttendingDto = {
  classId: string;
  iso: string; // the day they marked
  startTime: string;
  durationMin: number;
  name: string;
  where: string | null;
  coachName: string;
  coachHandle: string;
  coachPhoto: string | null;
  coachColor: string;
};

export type TemplateDto = {
  name: string;
  classType: string | null;
  description: string | null;
  startTime: string;
  durationMin: number;
  studioId: string | null;
  location: string | null;
  isPublic: boolean;
  links: BookingLink[];
};

export type LastUsed = { startTime: string; durationMin: number; studioId: string | null };
