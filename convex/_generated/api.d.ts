/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics_aggregates from "../analytics/aggregates.js";
import type * as analytics_events from "../analytics/events.js";
import type * as analytics_insights from "../analytics/insights.js";
import type * as analytics_maintenance from "../analytics/maintenance.js";
import type * as analytics_overview from "../analytics/overview.js";
import type * as analytics_releases from "../analytics/releases.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as errors_fingerprint from "../errors/fingerprint.js";
import type * as errors_grouping from "../errors/grouping.js";
import type * as errors_mutations from "../errors/mutations.js";
import type * as errors_queries from "../errors/queries.js";
import type * as events_http from "../events/http.js";
import type * as events_ingest from "../events/ingest.js";
import type * as events_queries from "../events/queries.js";
import type * as funnels_calculate from "../funnels/calculate.js";
import type * as funnels_compute from "../funnels/compute.js";
import type * as funnels_mutations from "../funnels/mutations.js";
import type * as funnels_queries from "../funnels/queries.js";
import type * as http from "../http.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_random from "../lib/random.js";
import type * as lib_ranges from "../lib/ranges.js";
import type * as lib_validators from "../lib/validators.js";
import type * as people_identity from "../people/identity.js";
import type * as people_merge from "../people/merge.js";
import type * as people_queries from "../people/queries.js";
import type * as projects_apiKeys from "../projects/apiKeys.js";
import type * as projects_mutations from "../projects/mutations.js";
import type * as projects_queries from "../projects/queries.js";
import type * as sessions_queries from "../sessions/queries.js";
import type * as sessions_tracking from "../sessions/tracking.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "analytics/aggregates": typeof analytics_aggregates;
  "analytics/events": typeof analytics_events;
  "analytics/insights": typeof analytics_insights;
  "analytics/maintenance": typeof analytics_maintenance;
  "analytics/overview": typeof analytics_overview;
  "analytics/releases": typeof analytics_releases;
  "auth": typeof auth;
  "crons": typeof crons;
  "errors/fingerprint": typeof errors_fingerprint;
  "errors/grouping": typeof errors_grouping;
  "errors/mutations": typeof errors_mutations;
  "errors/queries": typeof errors_queries;
  "events/http": typeof events_http;
  "events/ingest": typeof events_ingest;
  "events/queries": typeof events_queries;
  "funnels/calculate": typeof funnels_calculate;
  "funnels/compute": typeof funnels_compute;
  "funnels/mutations": typeof funnels_mutations;
  "funnels/queries": typeof funnels_queries;
  "http": typeof http;
  "lib/authz": typeof lib_authz;
  "lib/random": typeof lib_random;
  "lib/ranges": typeof lib_ranges;
  "lib/validators": typeof lib_validators;
  "people/identity": typeof people_identity;
  "people/merge": typeof people_merge;
  "people/queries": typeof people_queries;
  "projects/apiKeys": typeof projects_apiKeys;
  "projects/mutations": typeof projects_mutations;
  "projects/queries": typeof projects_queries;
  "sessions/queries": typeof sessions_queries;
  "sessions/tracking": typeof sessions_tracking;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
