import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`now()`);

// ---------- Users ----------
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "lead", "tester"] })
    .notNull()
    .default("tester"),
  createdAt: createdAt(),
});

export const usersRelations = relations(users, ({ many }) => ({
  projectMembers: many(projectMembers),
}));

// ---------- Projects ----------
export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const projectsRelations = relations(projects, ({ many }) => ({
  members: many(projectMembers),
  suites: many(testSuites),
  plans: many(testPlans),
  runs: many(testRuns),
  apiKeys: many(apiKeys),
  defects: many(defects),
}));

// ---------- Project Members ----------
export const projectMembers = pgTable("project_members", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["admin", "lead", "tester"] })
    .notNull()
    .default("tester"),
  createdAt: createdAt(),
});

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
}));

// ---------- Test Suites ----------
export const testSuites = pgTable("test_suites", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: createdAt(),
});

export const testSuitesRelations = relations(testSuites, ({ one, many }) => ({
  project: one(projects, {
    fields: [testSuites.projectId],
    references: [projects.id],
  }),
  cases: many(testCases),
  planSuites: many(testPlanSuites),
}));

// ---------- Test Cases ----------
export const testCases = pgTable("test_cases", {
  id: id(),
  suiteId: text("suite_id")
    .notNull()
    .references(() => testSuites.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  preconditions: text("preconditions"),
  // steps stored as JSON string: [{ step: string, expected: string }]
  steps: text("steps").notNull().default("[]"),
  priority: text("priority", { enum: ["low", "medium", "high", "critical"] })
    .notNull()
    .default("medium"),
  type: text("type", {
    enum: ["functional", "regression", "smoke", "e2e", "api", "other"],
  })
    .notNull()
    .default("functional"),
  tags: text("tags").notNull().default(""), // comma-separated
  automated: boolean("automated").notNull().default(false),
  automationId: text("automation_id"), // maps to playwright test title/id
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const testCasesRelations = relations(testCases, ({ one, many }) => ({
  suite: one(testSuites, {
    fields: [testCases.suiteId],
    references: [testSuites.id],
  }),
  runCases: many(testRunCases),
}));

// ---------- Test Plans ----------
export const testPlans = pgTable("test_plans", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const testPlansRelations = relations(testPlans, ({ one, many }) => ({
  project: one(projects, {
    fields: [testPlans.projectId],
    references: [projects.id],
  }),
  runs: many(testRuns),
  planSuites: many(testPlanSuites),
}));

// ---------- Test Plan Suites (links a plan to the suites it covers) ----------
export const testPlanSuites = pgTable("test_plan_suites", {
  id: id(),
  planId: text("plan_id")
    .notNull()
    .references(() => testPlans.id, { onDelete: "cascade" }),
  suiteId: text("suite_id")
    .notNull()
    .references(() => testSuites.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const testPlanSuitesRelations = relations(testPlanSuites, ({ one }) => ({
  plan: one(testPlans, {
    fields: [testPlanSuites.planId],
    references: [testPlans.id],
  }),
  suite: one(testSuites, {
    fields: [testPlanSuites.suiteId],
    references: [testSuites.id],
  }),
}));

// ---------- Test Runs ----------
export const testRuns = pgTable("test_runs", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  planId: text("plan_id").references(() => testPlans.id),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "completed"] })
    .notNull()
    .default("active"),
  source: text("source", { enum: ["manual", "playwright"] })
    .notNull()
    .default("manual"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
  completedAt: text("completed_at"),
});

export const testRunsRelations = relations(testRuns, ({ one, many }) => ({
  project: one(projects, {
    fields: [testRuns.projectId],
    references: [projects.id],
  }),
  plan: one(testPlans, {
    fields: [testRuns.planId],
    references: [testPlans.id],
  }),
  runCases: many(testRunCases),
}));

// ---------- Test Run Cases (execution results) ----------
export const testRunCases = pgTable("test_run_cases", {
  id: id(),
  runId: text("run_id")
    .notNull()
    .references(() => testRuns.id, { onDelete: "cascade" }),
  caseId: text("case_id")
    .notNull()
    .references(() => testCases.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["untested", "passed", "failed", "blocked", "skipped"],
  })
    .notNull()
    .default("untested"),
  executedBy: text("executed_by").references(() => users.id),
  executedAt: text("executed_at"),
  comment: text("comment"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
});

export const testRunCasesRelations = relations(testRunCases, ({ one, many }) => ({
  run: one(testRuns, {
    fields: [testRunCases.runId],
    references: [testRuns.id],
  }),
  testCase: one(testCases, {
    fields: [testRunCases.caseId],
    references: [testCases.id],
  }),
  executor: one(users, {
    fields: [testRunCases.executedBy],
    references: [users.id],
  }),
  attachments: many(attachments),
  defects: many(defects),
}));

// ---------- Defects ----------
export const defects = pgTable("defects", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  runCaseId: text("run_case_id").references(() => testRunCases.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity", { enum: ["low", "medium", "high", "critical"] })
    .notNull()
    .default("medium"),
  status: text("status", { enum: ["open", "in_progress", "closed"] })
    .notNull()
    .default("open"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const defectsRelations = relations(defects, ({ one, many }) => ({
  project: one(projects, {
    fields: [defects.projectId],
    references: [projects.id],
  }),
  runCase: one(testRunCases, {
    fields: [defects.runCaseId],
    references: [testRunCases.id],
  }),
  attachments: many(attachments),
}));

// ---------- Attachments (evidence/screenshots) ----------
// Stored as base64 directly in the database (data column) so it works on
// serverless hosts (Vercel) without needing a separate file-storage service.
// Belongs to either a run case OR a defect (the other stays null).
export const attachments = pgTable("attachments", {
  id: id(),
  runCaseId: text("run_case_id").references(() => testRunCases.id, { onDelete: "cascade" }),
  defectId: text("defect_id").references(() => defects.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  data: text("data").notNull(), // base64-encoded file content
  mimeType: text("mime_type").notNull().default("image/png"),
  createdAt: createdAt(),
});

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  runCase: one(testRunCases, {
    fields: [attachments.runCaseId],
    references: [testRunCases.id],
  }),
  defect: one(defects, {
    fields: [attachments.defectId],
    references: [defects.id],
  }),
}));

// ---------- API Keys (for Playwright integration) ----------
export const apiKeys = pgTable("api_keys", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  project: one(projects, {
    fields: [apiKeys.projectId],
    references: [projects.id],
  }),
}));
