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
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authErrors from "../lib/authErrors.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_pin from "../lib/pin.js";
import type * as lib_recurrence from "../lib/recurrence.js";
import type * as seed from "../seed.js";
import type * as taskInstances from "../taskInstances.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  "lib/auth": typeof lib_auth;
  "lib/authErrors": typeof lib_authErrors;
  "lib/dates": typeof lib_dates;
  "lib/pin": typeof lib_pin;
  "lib/recurrence": typeof lib_recurrence;
  seed: typeof seed;
  taskInstances: typeof taskInstances;
  tasks: typeof tasks;
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
