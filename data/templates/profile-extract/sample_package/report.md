# Profile Extract Sample Report

## Purpose

This report documents the minimal `profile-extract` sample package for D-P4-TOOLS-2. It is a mock/sample contract artifact, not a real third-party platform insight.

## Usage

Run:

```bash
node data/templates/profile-extract/scripts/validate-profile-extract-package.mjs data/templates/profile-extract/sample_package
```

## Example

- Package type: `profile-extract`
- Target import table for A-P4-TOOLS-4: `channel_profile`
- Future target object: `channel_entity`
- Profile rows: 1
- Aggregate profile rows: 2
- Unmapped fields: 1

## Notes

No local user file or real platform export was read. Concrete HTML/CSV/XLSX parsers are not implemented by this template task.
