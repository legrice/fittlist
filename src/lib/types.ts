import type { BookingLink } from "@/db/schema";

export type StudioDto = { id: string; seq: number; name: string; address: string };

export type ClassDto = {
  id: string;
  dayOfWeek: number; // 0 = Monday … 6 = Sunday
  specificDate: string | null; // ISO date if a one-off; null = standing weekly
  startTime: string; // "HH:MM"
  durationMin: number;
  name: string;
  classType: string | null;
  description: string | null;
  studioId: string;
  links: BookingLink[];
};

export type TemplateDto = {
  name: string;
  classType: string | null;
  description: string | null;
  startTime: string;
  durationMin: number;
  studioId: string;
  links: BookingLink[];
};

export type LastUsed = { startTime: string; durationMin: number; studioId: string | null };
