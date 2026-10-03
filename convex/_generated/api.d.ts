/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as ingest from "../ingest.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authErrors from "../lib/authErrors.js";
import type * as lib_briefing from "../lib/briefing.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_notifications from "../lib/notifications.js";
import type * as lib_pin from "../lib/pin.js";
import type * as lib_recurrence from "../lib/recurrence.js";
import type * as lib_todos from "../lib/todos.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_validators from "../lib/validators.js";
import type * as overview from "../overview.js";
import type * as points from "../points.js";
import type * as push from "../push.js";
import type * as pushSend from "../pushSend.js";
import type * as rewards from "../rewards.js";
import type * as seed from "../seed.js";
import type * as taskInstances from "../taskInstances.js";
import type * as tasks from "../tasks.js";
import type * as todos from "../todos.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  ingest: typeof ingest;
  "lib/access": typeof lib_access;
  "lib/auth": typeof lib_auth;
  "lib/authErrors": typeof lib_authErrors;
  "lib/briefing": typeof lib_briefing;
  "lib/dates": typeof lib_dates;
  "lib/notifications": typeof lib_notifications;
  "lib/pin": typeof lib_pin;
  "lib/recurrence": typeof lib_recurrence;
  "lib/todos": typeof lib_todos;
  "lib/tokens": typeof lib_tokens;
  "lib/validators": typeof lib_validators;
  overview: typeof overview;
  points: typeof points;
  push: typeof push;
  pushSend: typeof pushSend;
  rewards: typeof rewards;
  seed: typeof seed;
  taskInstances: typeof taskInstances;
  tasks: typeof tasks;
  todos: typeof todos;
  users: typeof users;
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
