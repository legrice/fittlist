// Dark-launch switches. The fan/discovery side ships in the codebase but stays
// invisible until FANS_ENABLED=true is set in the environment, so the coach
// beta is untouched until we flip it.
export function fansEnabled(): boolean {
  return process.env.FANS_ENABLED === "true";
}
