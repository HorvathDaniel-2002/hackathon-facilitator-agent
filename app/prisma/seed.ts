import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

/**
 * Anonymized sample hackathon (plan p1-seed).
 *
 * "Contoso Logistics" is fictional — no real customer names, no internal links.
 * The six cases are deliberately chosen to exercise every routing path
 * (Copilot Studio / Azure AI / Hybrid) and to include two that fail hard gates,
 * so a first run demonstrates the methodology rather than a happy path.
 */

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

const USERS = [
  { email: "facilitator@example.com", name: "Dana Reyes", globalRole: "Admin" },
  { email: "co-facilitator@example.com", name: "Mikael Berg", globalRole: "User" },
  { email: "sponsor@example.com", name: "Priya Raman", globalRole: "User" },
];

const CONTACTS = [
  {
    name: "Elena Vargas",
    email: "elena.vargas@contoso.example",
    org: "Contoso Logistics",
    roleType: "Sponsor",
    influence: "High",
    notes: "VP Operations. Owns the business outcome and the budget line.",
  },
  {
    name: "Tomas Neder",
    email: "tomas.neder@contoso.example",
    org: "Contoso Logistics",
    roleType: "BusinessOwner",
    influence: "High",
    notes: "Head of Customer Service. Attends both days.",
  },
  {
    name: "Ravi Shankar",
    email: "ravi.shankar@contoso.example",
    org: "Contoso Logistics",
    roleType: "IT",
    influence: "Medium",
    notes: "Power Platform admin. Can create sandbox environments.",
  },
  {
    name: "Jonna Laine",
    email: "jonna.laine@contoso.example",
    org: "Contoso Logistics",
    roleType: "Security",
    influence: "High",
    notes: "Owns DLP policy. Approval needed for any new connector.",
  },
  {
    name: "Marek Dvorak",
    email: "marek.dvorak@contoso.example",
    org: "Contoso Logistics",
    roleType: "Data",
    influence: "Medium",
    notes: "Data platform lead. Provides anonymized extracts.",
  },
  {
    name: "Sofia Lindqvist",
    email: "sofia@partner.example",
    org: "Northwind Partners",
    roleType: "Partner",
    influence: "Medium",
    notes: "Delivery partner. Joined the hackathon as a mentor.",
  },
  {
    name: "Mikael Berg",
    email: "co-facilitator@example.com",
    org: "Microsoft",
    roleType: "Mentor",
    influence: "Medium",
    notes: "Co-facilitator and mentor for two teams.",
  },
];

const USE_CASES = [
  {
    code: "UC-01",
    title: "Shipment status self-service agent",
    description:
      "A conversational agent in Teams that answers 'where is my shipment' questions from the customer service team, grounded in the shipment tracking knowledge base and the SharePoint policy library.",
    businessOwner: "Tomas Neder",
    targetUser: "Customer service agents (approx. 40 people)",
    currentProcess:
      "Agents search three systems manually and call the depot when tracking is ambiguous. Average handling time is 6 minutes per query.",
    painPoints:
      "Slow handling time, inconsistent answers between agents, high load on depot staff for routine questions.",
    desiredOutcome:
      "Agent asks the assistant in Teams and gets a grounded answer with a source link in under 30 seconds.",
    dataSources:
      "Anonymized shipment tracking export (CSV, 5000 rows), SharePoint policy library (synthetic copy).",
    systemsConnectors: "SharePoint, Dataverse, Teams",
    agentOutput:
      "A grounded answer with a source citation. No writes to any system.",
    humanApprovalPoint:
      "Read-only for the MVP; the agent never updates the shipment record.",
    successMetric: "Reduce average handling time by 40% for status queries.",
    constraints: "Must run inside Teams. No customer PII in the sample data.",
    reusePotential:
      "The same pattern extends to returns and invoice queries, and to the other two countries.",
    smallestSlice:
      "Answer 'where is shipment X' for the anonymized sample set, in Teams, with a citation.",
    productionVision:
      "Rolled out to all customer service agents, grounded in live tracking data with SSO.",
    manualImpact: "High",
    status: "Selected",
  },
  {
    code: "UC-02",
    title: "Damage claim photo triage",
    description:
      "Automatically classify damage severity from photos attached to freight claims, and extract the claim reference from the scanned claim form, so that low-severity claims can be fast-tracked.",
    businessOwner: "Tomas Neder",
    targetUser: "Claims handling team",
    currentProcess:
      "Every claim is reviewed manually. A handler opens each photo, judges severity, and rekeys the reference number.",
    painPoints:
      "Backlog of 3 days, inconsistent severity judgements, manual rekeying errors.",
    desiredOutcome:
      "Photos are triaged automatically into three severity bands, with the claim reference extracted from the scanned form.",
    dataSources:
      "Synthetic damage photo set (200 images), sample scanned claim forms (PDF, anonymized).",
    systemsConnectors: "Azure Blob Storage, Azure AI Document Intelligence",
    agentOutput:
      "Severity band plus extracted claim reference, written to a review queue.",
    humanApprovalPoint:
      "A handler confirms the severity band before the claim is fast-tracked.",
    successMetric: "Cut triage backlog from 3 days to same-day for 60% of claims.",
    constraints:
      "High volume: approximately 400 claims per week. Latency is not critical but throughput is.",
    reusePotential: "The extraction pipeline could serve other document types.",
    smallestSlice:
      "Classify the 200 synthetic photos into three bands and show precision on a held-out set.",
    productionVision:
      "Integrated into the claims system with a human review queue and monitoring.",
    manualImpact: "High",
    status: "Selected",
  },
  {
    code: "UC-03",
    title: "Supplier onboarding assistant",
    description:
      "A guided conversational assistant that walks a procurement specialist through supplier onboarding, checks the submitted documents against the policy, and raises an approval in Power Automate.",
    businessOwner: "Elena Vargas",
    targetUser: "Procurement specialists",
    currentProcess:
      "A 14-step checklist in Excel, with policy documents scattered across SharePoint.",
    painPoints:
      "Steps get skipped, onboarding takes 11 days on average, policy questions escalate to legal.",
    desiredOutcome:
      "Guided flow in Teams that checks completeness and routes for approval automatically.",
    dataSources:
      "Synthetic supplier document set, SharePoint policy library (anonymized copy).",
    systemsConnectors: "SharePoint, Power Automate, Teams, Dataverse",
    agentOutput:
      "A completeness assessment plus an approval request routed to the right approver.",
    humanApprovalPoint:
      "The procurement lead approves before the supplier record is created.",
    successMetric: "Reduce onboarding from 11 days to 5 days.",
    constraints: "Approval routing must respect the existing delegation matrix.",
    reusePotential:
      "The guided-checklist pattern is reusable for contractor and carrier onboarding.",
    smallestSlice:
      "Guide one supplier type end to end and raise a mock approval in Power Automate.",
    productionVision:
      "Connected to the real supplier master with full audit trail.",
    manualImpact: "Medium",
    status: "Selected",
  },
  {
    code: "UC-04",
    title: "Route delay prediction with conversational alerts",
    description:
      "Predict which routes are likely to be delayed using historical performance data, and surface a daily briefing to dispatchers in Teams with a recommended mitigation.",
    businessOwner: "Elena Vargas",
    targetUser: "Dispatch planners",
    currentProcess:
      "Planners react to delays after they happen, using a morning status call.",
    painPoints:
      "Reactive rather than proactive; mitigation decided too late to matter.",
    desiredOutcome:
      "A daily conversational briefing in Teams naming the at-risk routes and a suggested mitigation.",
    dataSources:
      "Anonymized historical route performance (18 months, synthetic), weather sample feed.",
    systemsConnectors: "Azure Machine Learning, Teams, Power Automate",
    agentOutput:
      "A ranked list of at-risk routes with a recommended mitigation per route.",
    humanApprovalPoint:
      "The dispatcher decides whether to act; the agent never re-routes automatically.",
    successMetric: "Prevent 15% of avoidable delays within the pilot region.",
    constraints:
      "The prediction model needs training data; only the conversational layer can be shown at the event.",
    reusePotential: "Extends to other regions once the model generalises.",
    smallestSlice:
      "Show the Teams briefing conversation over a precomputed prediction set.",
    productionVision:
      "A trained model retrained monthly, feeding a production briefing agent.",
    manualImpact: "Medium",
    status: "Qualified",
  },
  {
    code: "UC-05",
    title: "Warehouse compliance rollout across all sites",
    description:
      "Replace the entire warehouse compliance reporting process company-wide with an automated system integrated into SAP, covering all 22 sites and all regulatory regimes.",
    businessOwner: "",
    targetUser: "All warehouse managers",
    currentProcess:
      "Site-specific spreadsheets consolidated manually each quarter.",
    painPoints: "Slow, error-prone, and audit findings keep recurring.",
    desiredOutcome:
      "A full production rollout of automated compliance reporting for every site.",
    dataSources: "",
    systemsConnectors: "SAP, ERP integration, on-premises data gateway",
    agentOutput: "Automated regulatory submissions.",
    humanApprovalPoint: "",
    successMetric: "Eliminate audit findings.",
    constraints:
      "Requires core SAP integration and sign-off from every regional compliance officer.",
    reusePotential: "N/A — it is already company-wide.",
    smallestSlice: "",
    productionVision: "Full production rollout across all 22 sites.",
    manualImpact: "High",
    status: "Parked",
  },
  {
    code: "UC-06",
    title: "Driver handbook Q&A assistant",
    description:
      "A simple conversational assistant that answers driver questions from the driver handbook, distributed through Teams.",
    businessOwner: "Tomas Neder",
    targetUser: "Drivers and depot supervisors",
    currentProcess:
      "Drivers phone the depot supervisor, who looks the answer up in a PDF handbook.",
    painPoints: "Supervisor interruptions, inconsistent answers.",
    desiredOutcome: "Drivers self-serve answers from the handbook in Teams.",
    dataSources: "",
    systemsConnectors: "SharePoint, Teams",
    agentOutput: "A grounded answer citing the handbook section.",
    humanApprovalPoint: "Read-only; no actions taken.",
    successMetric: "Reduce supervisor interruptions by 30%.",
    constraints: "The handbook is still being updated by HR.",
    reusePotential: "Same pattern for the safety manual.",
    smallestSlice: "Answer ten common handbook questions with citations.",
    productionVision: "Published to all drivers with the approved handbook.",
    manualImpact: "Medium",
    status: "Draft",
  },
];

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.AUTH_MODE === "entra") {
    throw new Error("Demo seeding is only allowed in local development/test mode.");
  }
  const existing = await prisma.hackathon.findFirst({
    where: { customer: "Contoso Logistics", name: "Contoso Logistics — AI Agents Hackathon" },
  });
  if (existing) {
    console.log("Sample workspace already exists. Preserving all records, edits and usage history.");
    return;
  }
  console.log("Creating anonymized sample hackathon (mock evaluation only)...");

  const users = [];
  for (const u of USERS) {
    users.push(
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: u,
      }),
    );
  }
  const [owner, contributor, viewer] = users;

  const hackathon = await prisma.hackathon.create({
    data: {
      name: "Contoso Logistics — AI Agents Hackathon",
      customer: "Contoso Logistics",
      status: "Planning",
      memberships: {
        create: [
          { userId: owner.id, role: "Owner" },
          { userId: contributor.id, role: "Contributor" },
          { userId: viewer.id, role: "Viewer" },
        ],
      },
    },
  });

  const contacts = [];
  for (const c of CONTACTS) {
    contacts.push(
      await prisma.contact.create({ data: { ...c, hackathonId: hackathon.id } }),
    );
  }
  const byName = new Map(contacts.map((c) => [c.name, c]));

  const useCases = [];
  for (const uc of USE_CASES) {
    useCases.push(
      await prisma.useCase.create({
        data: {
          ...uc,
          hackathonId: hackathon.id,
          businessOwner: uc.businessOwner || null,
          dataSources: uc.dataSources || null,
          sampleDataApproved: Boolean(uc.dataSources),
          processOwnerConfirmed: ["UC-01", "UC-02", "UC-03"].includes(uc.code),
          smallestSlice: uc.smallestSlice || null,
          humanApprovalPoint: uc.humanApprovalPoint || null,
        },
      }),
    );
  }

  // Staff the first three cases so the deterministic gates have something real
  // to check; UC-05 and UC-06 are left unstaffed on purpose so their gates fail.
  const staffing: Array<[number, string, string, string]> = [
    [0, "Tomas Neder", "Customer", "Process owner — validates answers"],
    [0, "Ravi Shankar", "Customer", "Environment and connector setup"],
    [0, "Mikael Berg", "Microsoft", "Mentor"],
    [1, "Marek Dvorak", "Customer", "Provides anonymized samples"],
    [1, "Tomas Neder", "Customer", "Process owner"],
    [2, "Elena Vargas", "Customer", "Sponsor and process owner"],
    [2, "Sofia Lindqvist", "Partner", "Build lead"],
    [3, "Marek Dvorak", "Customer", "Historical data extracts"],
  ];

  for (const [ucIndex, contactName, party, responsibility] of staffing) {
    const contact = byName.get(contactName);
    if (!contact) continue;
    await prisma.teamMember.create({
      data: {
        useCaseId: useCases[ucIndex].id,
        contactId: contact.id,
        party,
        responsibility,
      },
    });
  }

  // Seed data never calls a paid model or transmits data to an external endpoint.
  process.env.AI_PROVIDER = "mock";
  const { evaluateUseCase } = await import("../src/lib/ai/evaluator");
  const { evaluationSnapshot, gateFactsFromUseCase } = await import("../src/lib/ai/provenance");
  const { stringifyJsonField } = await import("../src/lib/db");

  let evaluated = 0;
  for (const uc of useCases) {
    const team = await prisma.teamMember.findMany({
      where: { useCaseId: uc.id },
      include: { contact: true },
    });

      const facts = gateFactsFromUseCase({ ...uc, teamMembers: team });
      const outcome = await evaluateUseCase(uc, facts);

      await prisma.evaluation.create({
        data: {
          useCaseId: uc.id,
          version: 1,
          valueScore: outcome.valueScore,
          feasibilityScore: outcome.feasibilityScore,
          dataReadinessScore: outcome.dataReadinessScore,
          reusabilityScore: outcome.reusabilityScore,
          weightedScore: outcome.weightedScore,
          priorityBand: outcome.priorityBand,
          csFitBand: outcome.csFitBand,
          recommendedPlatform: outcome.recommendedPlatform,
          confidence: outcome.confidence,
          routingSignals: stringifyJsonField(outcome.routingSignals),
          gateResults: stringifyJsonField(outcome.gateResults),
          rationale: outcome.rationale,
          source: "mock",
          model: outcome.model,
          promptVersion: outcome.promptVersion,
          methodologyVersion: outcome.methodologyVersion,
          rubricSnapshot: outcome.rubricSnapshot,
          useCaseVersion: uc.version,
          useCaseSnapshot: evaluationSnapshot(uc, facts),
        },
      });
      evaluated++;
  }

  console.log(`✓ Users:       ${users.length}`);
  console.log(`✓ Hackathon:   ${hackathon.name}`);
  console.log(`✓ Contacts:    ${contacts.length}`);
  console.log(`✓ Use cases:   ${useCases.length}`);
  console.log(`✓ Evaluations: ${evaluated}`);
  console.log("\nSign in as any of:");
  for (const u of USERS) console.log(`  ${u.email}`);
  console.log(
    "\nNext: open /hackathons, review the use-case board and readiness evidence, then generate a build guide.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
