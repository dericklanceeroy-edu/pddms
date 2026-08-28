# AI Agent Instructions for PDDMS

## Scope & Architectural Boundaries
- *FULL-STACK AUTHORIZATION:* You are permitted to work across both the frontend (src/renderer) and backend (src/main, src/shared, kysely).
- *Backend Responsibilities:* Implement Electron IPC handlers, SQLite/Kysely database schemas, migrations, file I/O operations, and server/business logic.
- *Frontend Responsibilities:* React components, Flowbite UI layout, styling, client-side state management, and wiring components up to backend IPC channels.
- *Separation of Concerns:* Keep backend logic strictly inside src/main or src/shared. Do not run direct database queries inside renderer/React components; always route calls through typed IPC handlers.

## Workspace Guidelines
1. *Coding Style & Structure:* Strictly follow docs/CONTRIBUTING.md for formatting, naming conventions, and commenting standards.
2. *Business Requirements & Scope:* Refer to docs/project-plan.md to ensure database schemas, IPC routes, and UI flows match required domain logic.

## Core Full-Stack Feature Scope
- *Sales & Dispensing:* Product search APIs, generic matching logic, checkout/cart IPC handlers, Senior/PWD discount backend calculation rules (12% VAT exemption + 20% discount), database transaction recording, receipt generation.
- *Inventory & Expiry:* Stock management tables, Kysely schema for batches/products, expiry/low-stock backend alert queries, stock-in/out audit logs.
- *Supplier & Procurement:* Supplier CRUD operations, purchase order schema, delivery logging, invoice file upload/storage handlers.
- *Reporting & Business Analytics:* Analytical database queries for daily sales, fast/slow-moving inventory metrics, financial reporting endpoints.
- *System Admin & Database:* User authentication/roles schema, access permission checks, audit logging database tables, automated database backup and restore scripts.