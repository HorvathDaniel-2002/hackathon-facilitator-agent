import { z } from "zod";

/**
 * Single source of truth for every enum-like value in the app.
 *
 * The Prisma schema stores these as plain `String` so SQLite and PostgreSQL stay
 * byte-compatible (plan R-3). These Zod unions are what actually constrains them,
 * and they drive forms, server-action input validation and AI JSON schemas alike.
 */

export const MEMBERSHIP_ROLES = ["Owner", "Contributor", "Viewer"] as const;
export const ROLE_RANK: Record<MembershipRole, number> = {
  Viewer: 1,
  Contributor: 2,
  Owner: 3,
};
export const membershipRoleSchema = z.enum(MEMBERSHIP_ROLES);
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export const entityIdSchema = z.string().trim().min(1).max(200);
export const versionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalDateSchema = z.iso.date().or(z.literal("")).optional();
const optionalTextSchema = z.string().trim().optional();

export const HACKATHON_STATUSES = [
  "Planning",
  "Ready",
  "Running",
  "Closed",
  "Archived",
] as const;
export const hackathonStatusSchema = z.enum(HACKATHON_STATUSES);
export type HackathonStatus = (typeof HACKATHON_STATUSES)[number];

export const USECASE_STATUSES = [
  "Draft",
  "Qualified",
  "Selected",
  "Building",
  "Demoed",
  "Closed",
  "Parked",
] as const;
export const useCaseStatusSchema = z.enum(USECASE_STATUSES);
export type UseCaseStatus = (typeof USECASE_STATUSES)[number];

export const PROGRESS_STAGES = ["Intake", "Assessing", "Building", "Pilot", "InProduction", "Parked"] as const;
export const progressStageSchema = z.enum(PROGRESS_STAGES);
export type ProgressStage = (typeof PROGRESS_STAGES)[number];
export const PROGRESS_LABELS: Record<ProgressStage, string> = {
  Intake: "Intake", Assessing: "Assessing", Building: "Building",
  Pilot: "Pilot", InProduction: "In production", Parked: "Parked",
};
export const DELIVERY_ROUTES = ["Unassigned", "CopilotCowork", "CopilotStudio", "CustomBuild", "CAF"] as const;
export const deliveryRouteSchema = z.enum(DELIVERY_ROUTES);
export type DeliveryRoute = (typeof DELIVERY_ROUTES)[number];
export const DELIVERY_LABELS: Record<DeliveryRoute, string> = {
  Unassigned: "Unassigned", CopilotCowork: "Copilot / Cowork",
  CopilotStudio: "Copilot Studio", CustomBuild: "Custom build", CAF: "CAF",
};
export const CAF_STATUSES = ["NotSubmitted", "Submitted"] as const;
export const cafStatusSchema = z.enum(CAF_STATUSES);
export type CafStatus = (typeof CAF_STATUSES)[number];

export const CONTACT_ROLE_TYPES = [
  "Sponsor",
  "BusinessOwner",
  "IT",
  "Security",
  "Data",
  "Mentor",
  "Partner",
] as const;
export const contactRoleTypeSchema = z.enum(CONTACT_ROLE_TYPES);
export type ContactRoleType = (typeof CONTACT_ROLE_TYPES)[number];

export const INFLUENCE_LEVELS = ["High", "Medium", "Low"] as const;
export const influenceSchema = z.enum(INFLUENCE_LEVELS);
export type Influence = (typeof INFLUENCE_LEVELS)[number];

export const PRIORITY_BANDS = ["High", "Medium", "Low"] as const;
export const priorityBandSchema = z.enum(PRIORITY_BANDS);
export type PriorityBand = (typeof PRIORITY_BANDS)[number];

export const CS_FIT_BANDS = ["Strong", "Moderate", "Weak"] as const;
export const csFitBandSchema = z.enum(CS_FIT_BANDS);
export type CsFitBand = (typeof CS_FIT_BANDS)[number];

export const PLATFORMS = ["CopilotStudio", "AzureAI", "Hybrid"] as const;
export const platformSchema = z.enum(PLATFORMS);
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  CopilotStudio: "Copilot Studio",
  AzureAI: "Azure AI",
  Hybrid: "Hybrid",
};

export const PORTFOLIO_DECISIONS = [
  "Stop",
  "CustomerLed",
  "PartnerLed",
  "MicrosoftMotion",
] as const;
export const portfolioDecisionSchema = z.enum(PORTFOLIO_DECISIONS);
export type PortfolioDecision = (typeof PORTFOLIO_DECISIONS)[number];

export const PORTFOLIO_DECISION_LABELS: Record<PortfolioDecision, string> = {
  Stop: "Stop / Archive",
  CustomerLed: "Customer-led",
  PartnerLed: "Partner-led pilot",
  MicrosoftMotion: "Microsoft-supported motion",
};

export const PARTIES = ["Microsoft", "Partner", "Customer"] as const;
export const partySchema = z.enum(PARTIES);
export type Party = (typeof PARTIES)[number];

/** A 1–5 rubric sub-score. */
export const scoreSchema = z.number().int().min(1).max(5);

export const subScoresSchema = z.object({
  value: scoreSchema,
  feasibility: scoreSchema,
  dataReadiness: scoreSchema,
  reusability: scoreSchema,
});
export type SubScores = z.infer<typeof subScoresSchema>;

export const gateResultSchema = z.object({
  gate: z.string(),
  label: z.string(),
  kind: z.enum(["deterministic", "judgement"]),
  pass: z.boolean(),
  reason: z.string().optional(),
  remedy: z.string().optional(),
});
export type GateResult = z.infer<typeof gateResultSchema>;

/**
 * What the model is allowed to return.
 *
 * Deliberately excludes `weightedScore`, `priorityBand`, `recommendedPlatform`
 * and `csFitBand`: those are computed in code from the sub-scores and fired
 * signals so the arithmetic and the routing table stay authoritative
 * (architectural rule 2 / plan R-1).
 */
export const aiEvaluationSchema = z.object({
  scores: subScoresSchema,
  scoreRationale: z.object({
    value: z.string(),
    feasibility: z.string(),
    dataReadiness: z.string(),
    reusability: z.string(),
  }),
  routingSignals: z.array(z.string()),
  judgementGates: z.array(
    z.object({
      gate: z.string(),
      pass: z.boolean(),
      reason: z.string().optional(),
    }),
  ),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});
export type AiEvaluation = z.infer<typeof aiEvaluationSchema>;

export const hackathonInputSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  customer: z.string().trim().min(2, "Customer is required"),
  status: hackathonStatusSchema.default("Planning"),
}).strict();
export type HackathonInput = z.infer<typeof hackathonInputSchema>;
export const hackathonUpdateInputSchema = hackathonInputSchema.partial().extend({
  status: hackathonStatusSchema.optional(),
});

export const useCaseInputSchema = z.object({
  title: z.string().trim().min(3, "Title is required"),
  description: z.string().optional(),
  businessOwner: z.string().optional(),
  targetUser: z.string().optional(),
  currentProcess: z.string().optional(),
  painPoints: z.string().optional(),
  desiredOutcome: z.string().optional(),
  dataSources: z.string().optional(),
  sampleDataApproved: z.boolean().optional(),
  processOwnerConfirmed: z.boolean().optional(),
  systemsConnectors: z.string().optional(),
  agentOutput: z.string().optional(),
  humanApprovalPoint: z.string().optional(),
  successMetric: z.string().optional(),
  constraints: z.string().optional(),
  reusePotential: z.string().optional(),
  smallestSlice: z.string().optional(),
  productionVision: z.string().optional(),
  manualImpact: influenceSchema.or(z.literal("")).optional(),
  status: useCaseStatusSchema.default("Draft"),
}).strict();
export type UseCaseInput = z.infer<typeof useCaseInputSchema>;
export const useCaseUpdateInputSchema = useCaseInputSchema.partial().extend({
  status: useCaseStatusSchema.optional(),
});

export const contactInputSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  org: z.string().optional(),
  roleType: contactRoleTypeSchema,
  influence: influenceSchema.default("Medium"),
  notes: z.string().optional(),
}).strict();
export type ContactInput = z.infer<typeof contactInputSchema>;
export const contactUpdateInputSchema = contactInputSchema.partial().extend({
  influence: influenceSchema.optional(),
});

export const handoffInputSchema = z.object({
  whatWasBuilt: z.string().optional(),
  demoOrBlocker: z.string().optional(),
  outcomeDemonstrated: z.string().optional(),
  businessOwner: z.string().optional(),
  technicalOwner: z.string().optional(),
  deliveryOwner: z.string().optional(),
  portfolioDecision: portfolioDecisionSchema.or(z.literal("")).optional(),
  nextEngagement: z.string().optional(),
  nextMilestone: z.string().optional(),
  nextMilestoneDate: optionalDateSchema,
  rolloutScope: z.string().optional(),
  gaps: z.string().optional(),
  progressStage: progressStageSchema.optional(),
  deliveryRoute: deliveryRouteSchema.optional(),
  cafStatus: cafStatusSchema.optional(),
  cafReference: z.string().trim().max(2000).optional(),
  cafSubmittedOn: optionalDateSchema,
  productionReference: z.string().trim().max(2000).optional(),
}).strict();
export type HandoffInput = z.infer<typeof handoffInputSchema>;

export const inviteMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: membershipRoleSchema,
}).strict();

export const teamMemberInputSchema = z.object({
  useCaseId: entityIdSchema,
  contactId: entityIdSchema,
  party: partySchema,
  responsibility: optionalTextSchema,
}).strict();

export const evaluationOverrideInputSchema = z.object({
  valueScore: scoreSchema.optional(),
  feasibilityScore: scoreSchema.optional(),
  dataReadinessScore: scoreSchema.optional(),
  reusabilityScore: scoreSchema.optional(),
  csFitBand: csFitBandSchema.optional(),
  recommendedPlatform: platformSchema.optional(),
  rationale: z.string().optional(),
  reason: z.string().optional(),
});
export type EvaluationOverrideInput = z.infer<typeof evaluationOverrideInputSchema>;
