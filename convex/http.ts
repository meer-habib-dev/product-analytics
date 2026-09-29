import { BATCH_PATH } from "@analytics/shared";
import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { ingestBatchHttp, ingestPreflight } from "./events/http";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: BATCH_PATH, method: "POST", handler: ingestBatchHttp });
http.route({ path: BATCH_PATH, method: "OPTIONS", handler: ingestPreflight });

export default http;
