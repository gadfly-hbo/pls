# CSV 与业务源直连导入 PRD

## Problem Statement

当前数据管理工作台的“导入数据包”只能重放项目内已注册的数据包，例如 demo、douyin-bi 或渠道画像对象库样例。用户希望把日常业务数据更直接地接入 PLS：一类是运营同学手里的 CSV 表格，另一类是业务系统数据库或业务 API。

从用户视角看，现有数据包方式过重。用户不希望为了导入一张业务表，先理解包目录、manifest、adapter 和 confirm text 的完整工程格式。用户希望在 PLS 内完成“上传 CSV、校验库表字段、确认导入”的闭环；首次导入时，还希望可以从 CSV 创建 SQLite 表结构。后续更成熟时，用户希望 PLS 能直接连接业务数据库或业务 API，定期或手动拉取数据。

## Solution

建设新的数据接入能力，保留现有数据包导入作为工程级重放路径，同时新增两条产品化路径：

1. CSV 导入 SQLite。
2. 业务数据库 / 业务 API 直连导入 SQLite。

第一期优先交付 CSV 导入已有 SQLite 表，形成最小闭环：用户上传 CSV，选择目标表，系统执行 dry-run 校验，只有 CSV header 与目标表字段要求一致、类型可转换、必填字段满足时才允许正式导入。系统在 dry-run 中展示影响表、行数、字段匹配、缺失字段、多余字段、类型错误样例、导入模式和确认文本。用户确认后写入 SQLite，并生成 Import Job 与 audit。

第二期支持 CSV 首次创建表：用户上传 CSV 后，系统基于 header 和样例值生成拟创建 schema，用户确认表名、字段类型、主键、唯一键、空值规则后，系统创建表并导入数据。

第三期支持业务数据库 / 业务 API 连接：用户配置数据源，测试连接，选择业务对象或 SQL/API endpoint，执行 dry-run，再确认导入。PLS 默认只读外部业务源，不对业务源执行写操作。

## User Stories

1. As a brand operator, I want to upload a CSV directly in the data management workbench, so that I can import business data without preparing a full engineering data package.
2. As a brand operator, I want to select an existing SQLite table as the CSV import target, so that I can append or upsert rows into a known table.
3. As a brand operator, I want the system to compare CSV headers with the target table fields before import, so that I do not corrupt the workspace with mismatched columns.
4. As a brand operator, I want the import to fail before writing data when required target fields are missing from the CSV, so that incomplete data does not enter PLS.
5. As a brand operator, I want the import to fail before writing data when CSV has incompatible field types, so that numeric, date, and JSON fields remain queryable.
6. As a brand operator, I want to see extra CSV columns during dry-run, so that I can decide whether to revise the CSV or ignore non-target fields.
7. As a brand operator, I want to see row count, valid row count, and error row count during dry-run, so that I understand the impact before import.
8. As a brand operator, I want to see several example error rows during dry-run, so that I can quickly fix the source CSV.
9. As a brand operator, I want to see the exact confirmation text required for import, so that destructive or large writes are deliberate.
10. As a brand operator, I want the final import to write an Import Job record, so that I can review what happened later.
11. As a brand operator, I want the final import to write an audit event, so that workspace changes are traceable.
12. As a brand operator, I want imports to respect the current workspace, so that uploading data in one workspace does not affect another workspace.
13. As a brand operator, I want the import result to show inserted, updated, skipped, and failed counts, so that I know whether the job succeeded completely or partially.
14. As a brand operator, I want CSV imports to support user-authorized business data without privacy blocking, so that the PLS data admission policy is honored.
15. As a brand operator, I want the system to preserve source file metadata, source type, source batch ID, data version, and generated time, so that later model and BI results remain traceable.
16. As a data owner, I want to create a new SQLite table from a CSV after reviewing the proposed schema, so that first-time business data can be onboarded without manual SQL.
17. As a data owner, I want to edit inferred field types before creating a table, so that IDs are not accidentally imported as numbers and dates are not misclassified.
18. As a data owner, I want to choose primary key or unique key fields before creating a table, so that later imports can be idempotent.
19. As a data owner, I want to choose nullable and required fields before creating a table, so that downstream consumers can rely on basic data quality.
20. As a data owner, I want unsafe table names and field names to be rejected or normalized, so that generated SQLite schema stays valid.
21. As a data owner, I want schema creation to be previewed in dry-run before execution, so that table creation is intentional.
22. As an analyst, I want imported CSV tables to appear in the existing table browser, so that I can inspect schema and sample rows after import.
23. As an analyst, I want imported data to be queryable immediately after import, so that I can validate the business data inside PLS.
24. As an app engineer, I want CSV import logic behind one Data Ingestion interface, so that frontend callers do not need to know file parsing, SQLite, or audit details.
25. As an app engineer, I want CSV and business source imports to share the same dry-run and execute result shape, so that the UI can reuse one workflow.
26. As an app engineer, I want formal imports to require admin token, idempotency key, workspace context, and confirm text, so that existing Admin Database safety rules continue to apply.
27. As an app engineer, I want dry-run to perform all validation before execution, so that execute can reject stale or invalid confirmations.
28. As an app engineer, I want import adapters to return structured error rows instead of throwing opaque errors, so that UI can show actionable feedback.
29. As an app engineer, I want import jobs to be testable through the Admin import seam, so that tests cover external behavior rather than parser internals.
30. As a data agent, I want CSV field dictionaries to be optional in the simplest path but supported for strict imports, so that lightweight imports and governed imports can coexist.
31. As a data agent, I want generated tables to carry source lineage fields when appropriate, so that derived results can reference data provenance.
32. As a data agent, I want direct business database imports to be read-only, so that PLS never mutates the source system.
33. As a data agent, I want business API imports to support pagination and retry summaries, so that large source objects can be imported reliably.
34. As a data agent, I want business source credentials to stay outside committed repository files, so that local and production environments can manage secrets separately.
35. As a data agent, I want connection testing before import, so that broken credentials or unreachable endpoints fail before dry-run.
36. As a product owner, I want CSV import delivered before business database/API connectors, so that the common business workflow ships earlier with lower risk.
37. As a product owner, I want existing package import to remain available, so that deterministic demo and regression data can still be replayed.
38. As a product owner, I want the UI to distinguish “CSV 导入”, “业务连接”, and “数据包重放”, so that users choose the right path.
39. As a product owner, I want unsupported XLSX upload to be clearly out of the first release, so that scope stays bounded.
40. As a reviewer, I want smoke tests to use isolated temporary workspaces for write flows, so that main demo workspace data is not destroyed.

## Implementation Decisions

- Build a Data Ingestion module as the primary seam. Its interface should cover dry-run, execute, and import job listing for CSV and business source imports.
- Keep the existing data package import path as an engineering replay path. Do not remove or rewrite it as part of this PRD.
- Add a CSV Import Adapter behind the Data Ingestion interface. It handles upload staging, header parsing, table schema comparison, type conversion checks, row validation, dry-run summaries, and final SQLite writes.
- Add a Business Source Import Adapter later behind the same Data Ingestion interface. It handles business API and business database reads, connection tests, pagination or SQL execution, dry-run summaries, and final SQLite writes.
- Reuse the existing Admin Database safety model for formal writes: workspace context, admin token, idempotency key, dry-run preview, confirm text, import job, and audit event.
- First release supports CSV import into existing SQLite tables only.
- Second release supports CSV-driven table creation plus import. Table creation must have a schema preview and explicit user confirmation before execution.
- The CSV-to-existing-table path requires CSV headers to satisfy target table field requirements. Strict mode requires exact match with allowed metadata fields. Relaxed mode may allow extra CSV columns only if they are explicitly ignored in dry-run.
- The table creation path must not silently infer and execute schema. It must show the proposed table name, field names, field types, primary key or unique key, nullable rules, and sample values before creation.
- Field type inference is advisory. User confirmation is required before table creation.
- External business database connections are read-only from PLS. The system must not issue writes to the source database.
- Business source credentials must not be stored in committed repository files. They should be managed through workspace settings, local environment, or a later encrypted secret mechanism.
- The UI should present three import paths: CSV 导入, 业务连接, 数据包重放.
- CSV upload should use staging: upload first, dry-run from staged file, execute from the same staged file or a durable staged reference to prevent mismatched execution.
- Formal execution should reject stale dry-run confirmations when the staged file, target table, inferred schema, or mapping changes after dry-run.
- Import results should report inserted, updated, skipped, failed, and total row counts.
- Error rows should be capped in API responses but retained enough for debugging through import job detail.
- User-authorized data remains allowed under the project data admission policy. The feature should not introduce privacy blockers for user-provided business data.

## Testing Decisions

- The highest test seam is the Data Ingestion dry-run and execute interface exposed through Admin import behavior. Tests should assert external behavior: accepted CSVs import correctly, invalid CSVs are rejected before writes, jobs and audit records are produced, and workspace isolation holds.
- CSV parser internals should not be the primary test target. Tests should drive realistic CSV content through dry-run and execute.
- Server contract tests should cover:
  - Existing table import success.
  - Missing required column rejection.
  - Extra column behavior.
  - Type conversion error reporting.
  - Empty CSV rejection.
  - Confirm text mismatch rejection.
  - Stale dry-run rejection.
  - Workspace isolation.
  - Import job and audit creation.
- Table creation tests should cover:
  - Schema preview generation.
  - Invalid table and field names.
  - User-confirmed schema creation.
  - Import after creation.
  - Rollback or failure behavior when import fails after table creation begins.
- Business source tests should use fake adapters or local test sources, not production external systems.
- Frontend tests should cover the CSV import workflow at user level: upload file, choose target table, run dry-run, inspect errors, confirm import, and see import history update.
- Playwright tests that write data must use an isolated temporary workspace, following existing workspace isolation rules for smoke tests.
- Prior art exists in the current Admin Database import smoke tests, Data Management workbench tests, and channel object library import dry-run tests. New tests should follow those patterns but avoid hardcoding demo workspace business rows.

## Out of Scope

- XLSX upload in the first release.
- Arbitrary SQL writeback to business databases.
- Automatic unrestricted schema inference and execution without user confirmation.
- Full visual data mapping studio.
- Scheduled recurring imports.
- Production secret management UI.
- Row-level editing after import.
- Automatic taxonomy mapping from imported CSV fields.
- Automatic model retraining after import.
- Replacing existing data package import and demo replay flows.

## Further Notes

- This PRD intentionally prioritizes CSV import over business database/API connectors because CSV has immediate user value and lower implementation risk.
- The first implementation slice should be CSV upload to existing SQLite table with dry-run validation and formal import.
- The next slice should be CSV-driven table creation.
- Business API and business database connectors should be designed against the same Data Ingestion interface after the CSV path stabilizes.
- The UI copy should make the distinction clear: CSV 导入 is for user files, 业务连接 is for external systems, 数据包重放 is for project-defined packages.
