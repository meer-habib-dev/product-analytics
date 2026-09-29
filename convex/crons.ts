import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("delete expired unique markers", { minuteUTC: 17 }, internal.analytics.maintenance.deleteExpiredMarkers, {});

export default crons;
