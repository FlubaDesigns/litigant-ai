import { z } from "zod";

export const HealthCheckResponse = z.object({ status: z.string() });
export type HealthStatus = z.infer<typeof HealthCheckResponse>;
