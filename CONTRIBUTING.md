# Contributing

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

Format: `<type>(<scope>): <description>`

### Types

| Type       | Usage                                          |
|------------|-------------------------------------------------|
| `feat`     | New feature                                     |
| `fix`      | Bug fix                                         |
| `docs`     | Documentation only                              |
| `style`    | Formatting, no code change                      |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                         |
| `test`     | Adding or updating tests                        |
| `chore`    | Build process, dependencies, tooling            |
| `ci`       | CI/CD configuration                             |

### Examples

```
feat(crawl): add duplicate detection during search
fix(api): handle missing price in ad preview
docs: update README with new CLI commands
chore: upgrade React to v19
```

### Rules

- Use imperative mood in the description ("add", not "added")
- Do not capitalize the first letter of the description
- No period at the end of the description
- Add a scope in parentheses when relevant (e.g., `crawl`, `api`, `frontend`, `analyzer`)
