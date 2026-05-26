// Simple guard to avoid "A custom element with name '...' has already been defined" errors
// Some third-party bundles (TinyMCE overlay, webcomponents CE bundles) may register
// the same custom element twice during HMR or re-imports. Patch `customElements.define`
// early to ignore duplicate defines for already-registered names.

if (typeof window !== "undefined" && "customElements" in window) {
  try {
    const nativeDefine = window.customElements.define.bind(
      window.customElements,
    );
    window.customElements.define = (
      name: string,
      constructor: any,
      options?: ElementDefinitionOptions,
    ) => {
      if (window.customElements.get(name)) {
        // eslint-disable-next-line no-console
        console.warn(
          `customElements.define skipped duplicate registration for "${name}"`,
        );
        return;
      }
      return nativeDefine(name, constructor, options);
    };
  } catch (err) {
    // If anything goes wrong, don't block app startup.
    // eslint-disable-next-line no-console
    console.warn("Could not patch customElements.define:", err);
  }
}
