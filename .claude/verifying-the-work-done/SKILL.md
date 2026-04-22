---
name: verifying-the-work-done
description: Ensures that all necessary checks are performed after any change. Use when verifying that the codebase is in a good state after medium to large changes.
---

### 1. Review the code changes
- Go through the pull request or commit changes carefully.
- Check for code quality, readability, and adherence to coding standards.
- Look for any potential bugs, security issues, or performance problems.
- Ensure that the code is well-documented and that any new functions or classes have appropriate comments
- Update CLAUDE.md if there are any changes to the development workflow, commands, or architecture that need to be documented.
- Update README.md if there are any changes that affect how users should interact with the module or if there are new features that need to be highlighted.

### 2. For vitest tests
- Ensure that all vitest tests use `mount` instead of `shallowMount` to ensure that the full component tree is rendered and tested, providing more comprehensive test coverage.

### 3. For playwright tests
- Ensure that playwright interactions use `page.locator` with `data-test-*` attributes instead of `page.getByRole` to improve test stability and reduce brittleness caused by changes in the UI structure or accessibility attributes.

### 4. Run the following commands to verify that everything is in order:

`nvm use` // set the node to the correct version
`npm install` // should install all packages without errors
`npm run test` // all tests must pass
`npm run test:e2e` // all end 2 end tests must pass
`npm run lint` // there should be no lint errors
`npm run lint:fix` // in case there are easy to fix lint errors
`npx tsc` // there should be no typescript errors
`npm run prepack` // should build without errors
