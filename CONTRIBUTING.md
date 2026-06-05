# 🎉 Contributing to TeXcore

TeXcore is open to contributions, and we’re excited to have you here! This guide will help you get set up for local development.

> We welcome any and all types of PR, including ones assisted by AI. To ensure the codebase is clean and up to standard, we strictly adhere to the following principles.

## Core Engineering Standards & Guidelines

To maintain a premium, state-of-the-art codebase, all contributions must strictly adhere to the following principles:

### 1. SOLID, DRY & Modularity
- **Open-Closed Principle (OCP)**: Leverage polymorphic interfaces so new features require extending systems, not modifying core registries or mutating existing flows.
- **Single Responsibility (SRP)**: Keep classes, files, and views highly focused. Decouple concern layers cleanly.
- **Don't Repeat Yourself (DRY)**: Re-use selectors, normalizers, and formatting helpers. Avoid copy-pasted layout rules or logic.

### 2. Documentation Sync & Formatting
- **Technical & User Docs**: Synchronize user guides (under `docs/`) in the same PR when adding/changing features.
- **Formatting Style**: Write extremely concise, hyperlinked, compact markdown. Rely on clean comparison tables and structural note/warning boxes rather than verbose paragraphs.

### 3. Strict Type Safety & Linting
- **Verification**: Run local tests and verify everything builds cleanly before submitting. Run `pnpm run lint` and `pnpm run compile` to verify that formatting, ESLint rules, and TypeScript compiler checks pass with **0 errors**.

### 4. Test Integrity
- **Don't Modify Existing Tests**: Never modify existing `.test` files. You are encouraged to add new unit or integration tests, but baseline coverage must remain intact to prevent regressions.

---

## 🚀 Getting Started

### 1. Build the Plugin

You can build the plugin in two ways:

* For development (with watch mode):

  ```bash
  pnpm run dev
  ```

* For a production/minified build:

  ```bash
  pnpm run prod
  ```

All build output will appear in the root directory (`main.js` and `styles.css`) and will be copied over to the unified dev vault specified in the build configurations.

---

## 🧠 Tips for Developers

> 💡 **Recommended:** Use the [Hot Reload plugin](https://github.com/pjeby/hot-reload) to make development smoother — it auto-reloads your plugin changes.

Thanks for helping improve TeXcore! 🎨📝
