// The only module that touches the app's model context (mirrors ADR-004's
// single-adapter rule). Everything else in fram-core sees `Session` objects.

/**
 * Load a fresh app instance and wrap it.
 * @param {(opts: object) => Promise<any>} load  the app module's `load` export
 * @param {{ enumOrder: string }} options        passed through unchanged
 */
export async function openSession(load, options) {
  const app = await load(options);
  const pageErrors = [];
  app.onPageError((err) => pageErrors.push(err));
  // Errors fired synchronously or soon after load belong to "load".
  await settle();

  return {
    /** Tools in the order the app lists them, with their schemas. */
    listTools() {
      return app.modelContext.listTools().map((t) => ({
        name: t.name,
        inputSchema: t.inputSchema,
      }));
    },

    /**
     * Call one tool, then let the page settle.
     * @returns {Promise<{ outcome: "ok" | "isError" | "rejected", error?: string, pageErrors: string[] }>}
     */
    async call(name, args) {
      const before = pageErrors.length;
      let outcome = "ok";
      let error;
      try {
        const result = await app.modelContext.callTool(name, args);
        if (result && result.isError === true) outcome = "isError";
      } catch (err) {
        outcome = "rejected";
        error = describe(err);
      }
      await settle();
      return { outcome, error, pageErrors: pageErrors.slice(before).map(describe) };
    },

    /** Page errors collected so far (used only for errors during load). */
    drainPageErrors() {
      return pageErrors.splice(0).map(describe);
    },
  };
}

// Settle window after load and after each call: one timer turn plus one
// check-phase turn. Errors scheduled later than this are not observed.
async function settle() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setImmediate(r));
}

function describe(err) {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
