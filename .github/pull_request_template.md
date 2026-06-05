<!--
Thanks for the Pull Request (PR)!

Name your PR with one of the following prefixes, e.g. "feat: add support for XYZ", to indicate the type of changes proposed. This is based on the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/#summary).
  - FORMAT: `type(scope): one line explanation`
Examples:
  - feat(ui): new feature for the user, not a new feature for build script
  - fix(cache): bug fix for the user, not a fix to a build script
  - docs(docs): changes to the documentation
  - style(lint): formatting, missing semicolons, etc; no production code change
  - refactor(core): refactoring production code, eg. renaming a variable
  - perf(live-preview): code changes that improve performance
  - test(search): adding missing tests, refactoring tests; no production code change
  - chore: updating dependencies etc; no production code change
  - build: changes that affect the build system or external dependencies
  - ci: changes to configuration files and scripts
  - revert: reverts a previous commit

Please keep your PR:
- Small and focused
- Well explained (what + why)
- Aligned with project scope

Acceptance Criteria:
- Open an issue/discussion before implementing large changes.
- Large or unclear PRs may be closed without in-depth review.
- Low-quality contributions that cost more to review than to write from scratch will be closed without explanation.
- AI assisted PRs are welcome, but do not offload basic common sense.
-->

## Description
<!-- Provide a brief, concise description of your changes and why they are necessary. -->


## Type of Change

- [ ] Bug fix <!-- Add `Related Issue / Discussion #__ if applicable-->
- [ ] New feature <!-- Add `Related Issue / Discussion #__ if applicable-->
- [ ] Refactor  <!-- Add `Related Issue / Discussion #__ if applicable-->
- [ ] Documentation <!-- Add `Related Issue / Discussion #__ if applicable-->
- [ ] Chore / maintenance <!-- Add `Related Issue / Discussion #__ if applicable-->

## Code Quality Checklist (MANDATORY)
*Please read and verify you have adhered to all guidelines outlined in [CONTRIBUTING.md](https://github.com/YouFoundJK/TeXcore/blob/master/CONTRIBUTING.md).*

- **[SOLID](https://en.wikipedia.org/wiki/SOLID), [DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself)**:
  - [ ] Designed polymorphically where appropriate.
  - [ ] Kept classes and UI views decoupled.
  - [ ] Shared reusable helpers instead of copying/pasting logic.
- **Documentation Sync**:
  - [ ] Updated corresponding documentation.
  - [ ] Adhered to the hyperlinked, compact, table-based concise formatting style.
- **Code Integrity & Type Safety**:
  - [ ] Ran `pnpm run lint` and `pnpm run compile` locally and confirmed they pass with **0 errors**.
- **Test Integrity**:
  - [ ] Kept all existing tests completely untouched.
  - [ ] Added new unit/integration tests for new features.
