import { systemDb } from "@/lib/db";
import { isValidHrEmail, type CompanyCategory } from "@/lib/domain/jobs";

export interface CompanySeedData {
  name: string;
  category: CompanyCategory;
  hrEmail: string;
  websiteUrl: string;
  location: string;
  description: string;
  sampleRoles: string[];
}

export const CURATED_COMPANIES: CompanySeedData[] = [
  // 1. STARTUP (Rotates every 2 days)
  {
    name: "CortexFlow AI",
    category: "STARTUP",
    hrEmail: "careers@cortexflow.ai",
    websiteUrl: "https://cortexflow.ai",
    location: "San Francisco, CA / Remote",
    description: "Series A AI orchestration and autonomous agent workflow platform.",
    sampleRoles: ["Full-Stack Engineer", "AI Systems Architect"],
  },
  {
    name: "HyperScale DB",
    category: "STARTUP",
    hrEmail: "talent@hyperscaledb.io",
    websiteUrl: "https://hyperscaledb.io",
    location: "Austin, TX / Remote",
    description: "Seed-stage distributed in-memory cache and streaming database.",
    sampleRoles: ["Distributed Systems Engineer", "Backend Developer"],
  },
  {
    name: "PulseHealth Analytics",
    category: "STARTUP",
    hrEmail: "hiring@pulsehealth.tech",
    websiteUrl: "https://pulsehealth.tech",
    location: "Boston, MA / Remote",
    description: "Next-gen predictive biometric intelligence and patient care platform.",
    sampleRoles: ["Full-Stack Mobile & Web Engineer", "Data Infrastructure Lead"],
  },
  {
    name: "FinPulse Labs",
    category: "STARTUP",
    hrEmail: "recruiting@finpulse.co",
    websiteUrl: "https://finpulse.co",
    location: "New York, NY / Remote",
    description: "High-frequency cross-border payment rails and real-time ledger API.",
    sampleRoles: ["Senior Backend Engineer", "Security & Reliability Lead"],
  },

  // 2. BIG_MNC (Fortune 500)
  {
    name: "Microsoft",
    category: "BIG_MNC",
    hrEmail: "msft-talent-acquisition@microsoft.com",
    websiteUrl: "https://careers.microsoft.com",
    location: "Redmond, WA / Global",
    description: "Global cloud computing, software systems, and AI infrastructure.",
    sampleRoles: ["Software Engineer II - Azure Cloud", "Full-Stack Engineer - Microsoft 365"],
  },
  {
    name: "Oracle Cloud Infrastructure",
    category: "BIG_MNC",
    hrEmail: "oci-engineering-hiring@oracle.com",
    websiteUrl: "https://oracle.com/cloud",
    location: "Austin, TX / Remote",
    description: "Enterprise scale cloud infrastructure, virtualization, and database engines.",
    sampleRoles: ["Principal Systems Engineer", "Cloud Infrastructure Developer"],
  },
  {
    name: "Cisco Systems",
    category: "BIG_MNC",
    hrEmail: "cisco-global-talent@cisco.com",
    websiteUrl: "https://cisco.com",
    location: "San Jose, CA / Remote",
    description: "Worldwide leader in enterprise networking, cybersecurity, and collaboration.",
    sampleRoles: ["Full-Stack Software Engineer", "Platform Security Engineer"],
  },

  // 3. BIG_SHARKS (Tech Giants & Tier-1)
  {
    name: "Stripe",
    category: "BIG_SHARKS",
    hrEmail: "engineering-recruiting@stripe.com",
    websiteUrl: "https://stripe.com/jobs",
    location: "San Francisco, CA / Remote",
    description: "Financial infrastructure for the internet, developer-first APIs.",
    sampleRoles: ["Software Engineer - Payments Engine", "Frontend Infrastructure Engineer"],
  },
  {
    name: "Uber",
    category: "BIG_SHARKS",
    hrEmail: "tech-talent@uber.com",
    websiteUrl: "https://uber.com/careers",
    location: "San Francisco, CA / Remote",
    description: "Global mobility, real-time dispatch, and automated logistics networks.",
    sampleRoles: ["Senior Backend Engineer - Core Dispatch", "Mobile Architecture Lead"],
  },
  {
    name: "Databricks",
    category: "BIG_SHARKS",
    hrEmail: "databricks-careers@databricks.com",
    websiteUrl: "https://databricks.com/company/careers",
    location: "San Francisco, CA / Remote",
    description: "Unified data intelligence platform, Apache Spark and Lakehouse pioneer.",
    sampleRoles: ["Software Engineer - Platform Runtime", "Full-Stack Data Applications"],
  },

  // 4. ACTIVELY_HIRING (Immediate Openings)
  {
    name: "Vercel",
    category: "ACTIVELY_HIRING",
    hrEmail: "careers@vercel.com",
    websiteUrl: "https://vercel.com/careers",
    location: "Remote (Global)",
    description: "Frontend cloud and Next.js ecosystem development platform.",
    sampleRoles: ["Senior Next.js Full-Stack Engineer", "Edge Runtime Engineer"],
  },
  {
    name: "Supabase",
    category: "ACTIVELY_HIRING",
    hrEmail: "hiring@supabase.com",
    websiteUrl: "https://supabase.com/careers",
    location: "Remote (Global)",
    description: "Open source Firebase alternative built on PostgreSQL and Realtime.",
    sampleRoles: ["PostgreSQL Infrastructure Engineer", "Full-Stack Developer"],
  },
  {
    name: "Postman",
    category: "ACTIVELY_HIRING",
    hrEmail: "talent-acquisition@postman.com",
    websiteUrl: "https://postman.com/careers",
    location: "San Francisco / Bengaluru / Remote",
    description: "Leading collaborative API development and testing ecosystem.",
    sampleRoles: ["Full-Stack Engineer - API Platform", "Senior Backend Architect"],
  },

  // 5. MID_MNC
  {
    name: "EPAM Systems",
    category: "MID_MNC",
    hrEmail: "talent-acquisition@epam.com",
    websiteUrl: "https://epam.com",
    location: "Newtown, PA / Global",
    description: "Digital engineering and product development services.",
    sampleRoles: ["Lead Full-Stack Developer", "Cloud Solutions Architect"],
  },
  {
    name: "Endava",
    category: "MID_MNC",
    hrEmail: "recruitment@endava.com",
    websiteUrl: "https://endava.com",
    location: "London, UK / Global",
    description: "Next-generation enterprise software transformation and digital engineering.",
    sampleRoles: ["Senior Software Engineer", "DevOps & SRE Specialist"],
  },

  // 6. SMALL_SCALE (Boutique Consultancies)
  {
    name: "Thoughtbot",
    category: "SMALL_SCALE",
    hrEmail: "careers@thoughtbot.com",
    websiteUrl: "https://thoughtbot.com",
    location: "Remote (US & Europe)",
    description: "Renowned boutique product design and agile software consultancy.",
    sampleRoles: ["Product Engineer (TypeScript & React)", "Full-Stack Rails & Node Specialist"],
  },
  {
    name: "Formidable Labs",
    category: "SMALL_SCALE",
    hrEmail: "jobs@formidable.com",
    websiteUrl: "https://formidable.com",
    location: "Seattle, WA / London / Remote",
    description: "Elite engineering agency specializing in React, Node, and Cloud native architecture.",
    sampleRoles: ["Senior Frontend Engineer", "Full-Stack Consultant"],
  },

  // 7. FOREIGN (Remote International)
  {
    name: "GitLab",
    category: "FOREIGN",
    hrEmail: "all-remote-talent@gitlab.com",
    websiteUrl: "https://about.gitlab.com/jobs",
    location: "100% Remote Worldwide",
    description: "All-remote DevSecOps platform with open core values.",
    sampleRoles: ["Full-Stack Engineer - CI/CD", "Backend Engineer - Database Scaling"],
  },
  {
    name: "Automattic",
    category: "FOREIGN",
    hrEmail: "jobs@automattic.com",
    websiteUrl: "https://automattic.com/work-with-us",
    location: "Distributed Worldwide",
    description: "The distributed company behind WordPress.com, WooCommerce, and Tumblr.",
    sampleRoles: ["JavaScript Engineer - Core Web", "Code Wrangler (Backend Engineer)"],
  },
  {
    name: "Canonical",
    category: "FOREIGN",
    hrEmail: "global-hiring@canonical.com",
    websiteUrl: "https://canonical.com/careers",
    location: "Remote Worldwide (London HQ)",
    description: "The publisher of Ubuntu and open-source cloud computing solutions.",
    sampleRoles: ["Software Engineer - Cloud Systems", "Web Developer - Core UI"],
  },
];

// Rotating batches across ALL 7 company categories for the 2-day refresh
export const ROTATING_ALL_CATEGORY_BATCHES: CompanySeedData[][] = [
  [
    // Batch 1 across all 7 categories
    {
      name: "VectorSynth AI",
      category: "STARTUP",
      hrEmail: "careers@vectorsynth.ai",
      websiteUrl: "https://vectorsynth.ai",
      location: "San Francisco, CA / Remote",
      description: "Generative UI streaming compiler and real-time multimodal agent framework.",
      sampleRoles: ["Full-Stack AI Engineer", "Next.js UI Specialist"],
    },
    {
      name: "TraceZero Security",
      category: "STARTUP",
      hrEmail: "talent@tracezero.sec",
      websiteUrl: "https://tracezero.sec",
      location: "Seattle, WA / Remote",
      description: "eBPF zero-trust runtime observability and container protection.",
      sampleRoles: ["Senior Backend Engineer", "Systems Infrastructure Lead"],
    },
    {
      name: "IBM Cloud Systems",
      category: "BIG_MNC",
      hrEmail: "ibm-cloud-talent@ibm.com",
      websiteUrl: "https://ibm.com/careers",
      location: "Armonk, NY / Remote",
      description: "Hybrid enterprise cloud computing and automated AI workflow infrastructure.",
      sampleRoles: ["Cloud Platform Engineer", "Senior Enterprise Backend Developer"],
    },
    {
      name: "NVIDIA AI Platforms",
      category: "BIG_SHARKS",
      hrEmail: "nvidia-careers@nvidia.com",
      websiteUrl: "https://nvidia.com/careers",
      location: "Santa Clara, CA / Remote",
      description: "Accelerated computing, CUDA architecture, and frontier deep learning clusters.",
      sampleRoles: ["CUDA Systems Software Engineer", "Full-Stack AI Tools Developer"],
    },
    {
      name: "Linear",
      category: "ACTIVELY_HIRING",
      hrEmail: "jobs@linear.app",
      websiteUrl: "https://linear.app/careers",
      location: "Remote (Global)",
      description: "High-performance project management tool for world-class engineering teams.",
      sampleRoles: ["Full-Stack Product Engineer", "Web Client Performance Engineer"],
    },
    {
      name: "Twilio",
      category: "MID_MNC",
      hrEmail: "twilio-recruiting@twilio.com",
      websiteUrl: "https://twilio.com/jobs",
      location: "San Francisco, CA / Remote",
      description: "Global customer engagement platform and real-time communication APIs.",
      sampleRoles: ["Senior Distributed Systems Engineer", "API Platform Developer"],
    },
    {
      name: "Work & Co",
      category: "SMALL_SCALE",
      hrEmail: "careers@work.co",
      websiteUrl: "https://work.co",
      location: "Brooklyn, NY / Remote",
      description: "Acclaimed digital product studio and elite engineering consultancy.",
      sampleRoles: ["Lead React Engineer", "Full-Stack Technical Consultant"],
    },
    {
      name: "Sourcegraph",
      category: "FOREIGN",
      hrEmail: "hiring@sourcegraph.com",
      websiteUrl: "https://sourcegraph.com/careers",
      location: "Remote Worldwide",
      description: "Code intelligence, code search, and developer AI assistant platform.",
      sampleRoles: ["Code Graph Software Engineer", "Full-Stack Web Developer"],
    },
  ],
  [
    // Batch 2 across all 7 categories
    {
      name: "ApexFlow Logistics",
      category: "STARTUP",
      hrEmail: "jobs@apexflow.delivery",
      websiteUrl: "https://apexflow.delivery",
      location: "Chicago, IL / Remote",
      description: "AI-routed cold-chain pharmaceutical freight and autonomous logistics.",
      sampleRoles: ["Full-Stack Engineer", "Optimization Algorithms Lead"],
    },
    {
      name: "BioGraph Matrix",
      category: "STARTUP",
      hrEmail: "hiring@biographmatrix.bio",
      websiteUrl: "https://biographmatrix.bio",
      location: "Cambridge, MA / Remote",
      description: "Computational protein folding simulator for drug discovery acceleration.",
      sampleRoles: ["Software Systems Engineer", "Full-Stack Research Tooling"],
    },
    {
      name: "Dell Technologies",
      category: "BIG_MNC",
      hrEmail: "dell-careers@dell.com",
      websiteUrl: "https://jobs.dell.com",
      location: "Round Rock, TX / Remote",
      description: "Enterprise IT infrastructure, edge computing, and hybrid cloud solutions.",
      sampleRoles: ["Senior Cloud Infrastructure Engineer", "Full-Stack Web Architect"],
    },
    {
      name: "Netflix",
      category: "BIG_SHARKS",
      hrEmail: "netflix-engineering-jobs@netflix.com",
      websiteUrl: "https://jobs.netflix.com",
      location: "Los Gatos, CA / Remote",
      description: "World-leading streaming entertainment service and microservices pioneer.",
      sampleRoles: ["Senior Platform Software Engineer", "UI Systems Developer"],
    },
    {
      name: "Resend",
      category: "ACTIVELY_HIRING",
      hrEmail: "team@resend.com",
      websiteUrl: "https://resend.com/careers",
      location: "Remote Worldwide",
      description: "Developer-first email delivery platform and transactional communication APIs.",
      sampleRoles: ["Core Infrastructure Engineer", "Full-Stack Web Developer"],
    },
    {
      name: "MongoDB",
      category: "MID_MNC",
      hrEmail: "campus-hiring@mongodb.com",
      websiteUrl: "https://mongodb.com/careers",
      location: "New York, NY / Remote",
      description: "Modern developer data platform and distributed document database engine.",
      sampleRoles: ["Cloud Services Backend Developer", "Full-Stack Tools Engineer"],
    },
    {
      name: "Giant Machines",
      category: "SMALL_SCALE",
      hrEmail: "careers@giantmachines.com",
      websiteUrl: "https://giantmachines.com",
      location: "New York, NY / Remote",
      description: "Boutique digital product studio and custom software consultancy.",
      sampleRoles: ["Senior Full-Stack Consultant", "Frontend Application Architect"],
    },
    {
      name: "Doist",
      category: "FOREIGN",
      hrEmail: "jobs@doist.com",
      websiteUrl: "https://doist.com/careers",
      location: "Distributed Worldwide",
      description: "Creators of Todoist and Twist, fully remote async productivity pioneer.",
      sampleRoles: ["Full-Stack Web Developer", "Backend Python & TypeScript Engineer"],
    },
  ],
];

export const ROTATING_STARTUP_BATCHES = ROTATING_ALL_CATEGORY_BATCHES;

/** Ensures company directory has seeded records across all 7 categories with valid HR emails */
export async function ensureCompanyDirectorySeeded(): Promise<number> {
  let createdCount = 0;

  for (const item of CURATED_COMPANIES) {
    if (!isValidHrEmail(item.hrEmail)) continue;

    const existing = await systemDb.company.findFirst({
      where: { name: item.name, category: item.category },
      select: { id: true },
    });

    if (!existing) {
      await systemDb.company.create({
        data: {
          name: item.name,
          category: item.category,
          hrEmail: item.hrEmail,
          websiteUrl: item.websiteUrl,
          location: item.location,
          description: item.description,
          lastRefreshedAt: new Date(),
        },
      });
      createdCount++;
    }
  }

  return createdCount;
}

/** 2-Day Inngest Cron & Batch Worker: Refreshes and rotates hiring companies across ALL 7 categories */
export async function rotateAllHiringCompanies(): Promise<{ rotatedCount: number }> {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const batchIdx = Math.floor(dayOfYear / 2) % ROTATING_ALL_CATEGORY_BATCHES.length;
  const currentBatch = ROTATING_ALL_CATEGORY_BATCHES[batchIdx];

  let rotated = 0;
  for (const companyData of currentBatch) {
    if (!isValidHrEmail(companyData.hrEmail)) continue;

    const existing = await systemDb.company.findFirst({
      where: { name: companyData.name },
    });

    if (existing) {
      await systemDb.company.update({
        where: { id: existing.id },
        data: {
          category: companyData.category,
          hrEmail: companyData.hrEmail,
          websiteUrl: companyData.websiteUrl,
          location: companyData.location,
          lastRefreshedAt: new Date(),
          description: companyData.description,
        },
      });
    } else {
      await systemDb.company.create({
        data: {
          name: companyData.name,
          category: companyData.category,
          hrEmail: companyData.hrEmail,
          websiteUrl: companyData.websiteUrl,
          location: companyData.location,
          description: companyData.description,
          lastRefreshedAt: new Date(),
        },
      });
    }
    rotated++;
  }

  // Touch lastRefreshedAt across all 7 categories
  await systemDb.company.updateMany({
    data: { lastRefreshedAt: new Date() },
  });

  return { rotatedCount: rotated };
}

/** Legacy alias: delegates to rotateAllHiringCompanies */
export async function rotateStartupCompanies(): Promise<{ rotatedCount: number }> {
  return rotateAllHiringCompanies();
}
