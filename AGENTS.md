# Repository instructions

## Language

All project artifacts must be in English, including documentation, source code,
identifiers, comments, interface text, errors, examples, and commit messages.

## Architecture

- Use object-oriented programming throughout application code. Encapsulate behavior
  in focused classes and prefer composition.
- Apply Model–View–Controller wherever applicable. Keep models, rendering or
  serialization, and input coordination separate. Put collection, networking,
  and correlation logic in dedicated service classes.
- Keep entry points and event callbacks thin and delegate behavior to objects.
- Shell and BAT files must be thin launchers for object-oriented application code;
  use classes for PowerShell application behavior.
- Preserve internal classes when distributing the PHP connector as one file.
- Document why MVC is unsuitable when a component does not use it.
- Keep collectors independent, data contracts versioned, and the PHP connector
  optional and self-hosted. Do not introduce a central project endpoint.

## Changes

- Follow Conventional Commits 1.0.0 with English descriptions.
- Never commit credentials or private collection exports.
- Update documentation to reflect actual implementation status.
- Run checks appropriate to each change and report verification limitations.
- The unpacked Chrome extension includes generated copies of the canonical
  `explorer/` runtime and `shared/fingerprints.json`. Edit canonical sources, run
  `npm run build` from `extension/`, and commit the refreshed packaged copies.
- Run extension and Explorer Node tests plus the PHP suite when shared contracts
  or integration behavior change. Native Chrome permission prompts, installation,
  and popup lifecycle require separate manual browser verification.
