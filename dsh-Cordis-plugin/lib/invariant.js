//#region src/invariant.ts
const PACKAGE_NAME = "@dsh-external/dsh-ui-grokbot";
/** Cordis companion plugin name. */
const name = "dsh-ui-grokbot-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: this surface plugin holds no host-side mutable state
* — every animation lives in the browser process and disappears with it.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
