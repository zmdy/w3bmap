# Contributing

The project is at the foundation stage. Read the [README](README.md) for the
architecture and roadmap before proposing an implementation.

## Language

Use English for all project content: documentation, source code, identifiers,
comments, interface text, errors, examples, and commit messages.

## Code architecture

- Use object-oriented programming for all application code. Encapsulate behavior
  in classes with focused responsibilities and prefer composition.
- Apply Model–View–Controller wherever applicable. Models own entities and state;
  views render output, including JSON responses; controllers coordinate input and
  services. Keep business logic, networking, and collection in dedicated classes.
- Keep browser event handlers, CLI entry points, and PHP request dispatch thin:
  delegate application behavior to objects.
- Keep Shell and BAT files as thin launchers for object-oriented application code.
  They do not provide native class-based OOP. Use classes for PowerShell behavior.
- Preserve internal class boundaries when packaging PHP as a single deployment file.
- Document the rationale when MVC does not fit a component, such as a shared data
  model or collector service with no user interface.

## Commits

Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
type(optional scope): description

Optional body.

Optional footer(s).
```

| Type | Purpose |
| --- | --- |
| `feat` | New functionality |
| `fix` | Bug fixes |
| `docs` | Documentation |
| `refactor` | Code restructuring without changing behavior |
| `perf` | Performance improvements |
| `test` | Tests |
| `build` | Build tooling and dependencies |
| `ci` | Continuous integration |
| `style` | Code formatting |
| `chore` | Repository maintenance |
| `revert` | Reverting changes |

Use lowercase types and short English descriptions. Suggested scopes include
`extension`, `cli`, `probe`, `explorer`, `shared`, and `repo`. Scopes are optional.

```text
chore(repo): initialize project
docs: document self-hosted connector setup
feat(extension): add connector settings
fix(probe): validate redirect destinations
feat(shared)!: change graph entity identifiers
```

Mark incompatible changes with `!` before `:` or a
`BREAKING CHANGE: description of the incompatibility` footer. Explain migration
steps in the body when needed. Keep unrelated changes in separate commits.

Automated commit message validation is not included yet.

## Changes and verification

- Keep the extension usable without the PHP connector.
- Preserve JSON contract compatibility or document its migration.
- Never commit tokens, credentials, or private collection data.
- Document how to verify changes and run checks appropriate to the component.
- Update the README when implementation status or configuration changes.

There are no build commands or automated tests yet. These will be documented as
application components are implemented.

Contributions are distributed under the project's [MIT License](LICENSE).
