import { getConscienceClause, type ConscienceClause } from "./conscienceConfig.js";
import { getAllSeatBriefs, type SeatId } from "./seatBriefs.js";
import { loadConfiguration } from "./configurationError.js";
export interface RunInstructions { conscience: ConscienceClause; seats: Record<SeatId, string>; }

/** Capture the instructions before a reservation; the run uses this exact snapshot. */
export async function getRunInstructions(conscienceEnabled: boolean): Promise<RunInstructions> {
  const conscience = conscienceEnabled ? await getConscienceClause() : {text:"", version:"disabled"};
  const seats = await loadConfiguration("Saved seat instructions", getAllSeatBriefs);
  return {conscience, seats};
}
