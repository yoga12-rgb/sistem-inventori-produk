<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI table pattern

For operational/admin data tables, prefer the project table pattern used by
`src/components/viewport-table.tsx`:

- Filters live above the table and stay sticky.
- The page itself should not become the primary scroll area; only the table body
  scrolls inside a fixed-height table panel.
- Table headers stay sticky while the table panel scrolls.
- Rows are rendered lazily based on the visible table viewport, then appended
  with infinite scroll from inside that table panel.
- Keep page actions (Tambah/Buat/etc.) in the AppShell topbar via
  `RegisterPageAction`, not inside the filter row.

Use this pattern for new master-data or audit/list pages unless there is a
strong reason not to.
