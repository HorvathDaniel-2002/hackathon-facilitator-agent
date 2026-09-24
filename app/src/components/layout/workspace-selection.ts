export function selectDashboardHackathon<T extends { id: string; status: string }>(
  hackathons: T[],
  selected: string | string[] | null | undefined,
): T | null {
  if (selected !== null && selected !== undefined) {
    return typeof selected === "string"
      ? hackathons.find((hackathon) => hackathon.id === selected) ?? null
      : null;
  }
  return hackathons.find((hackathon) => hackathon.status !== "Archived") ?? hackathons[0] ?? null;
}
