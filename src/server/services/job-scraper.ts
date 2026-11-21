import { systemDb } from "@/lib/db";
import {
  isValidHrEmail,
  type CompanyCategory,
  type CandidateExperienceLevel,
} from "@/lib/domain/jobs";

export interface CompanySeedData {
  name: string;
  category: CompanyCategory;
  hrEmail: string;
  websiteUrl: string;
  location: string;
  description: string;
  sampleRoles: string[];
  rolesByExperience?: Partial<Record<CandidateExperienceLevel, string[]>>;
  hiresFromIndia?: boolean;
  isIndiaBased?: boolean;
  offersRemoteIndia?: boolean;
  offersRelocation?: boolean;
}

export function getRoleForExperience(
  company: CompanySeedData | null | undefined,
  experienceLevel: CandidateExperienceLevel = "FRESHER"
): string {
  if (!company) {
    if (experienceLevel === "FRESHER") return "Graduate Software Engineer (Fresher / 0-1 Yrs)";
    if (experienceLevel === "JUNIOR") return "Software Development Engineer I (1-3 Yrs)";
    if (experienceLevel === "MID") return "Software Development Engineer II (3-5 Yrs)";
    return "Senior Software Engineer (5+ Yrs)";
  }

  if (company.rolesByExperience?.[experienceLevel]?.length) {
    const roles = company.rolesByExperience[experienceLevel]!;
    return roles[0];
  }

  const baseDomain = company.sampleRoles?.[0] || "Software Engineer";
  const domainClean = baseDomain.replace(/^(Senior|Lead|Principal|Staff|Junior|Associate)\s+/i, "");

  if (experienceLevel === "FRESHER") {
    return `Associate ${domainClean} (Fresher / 0-1 Yrs)`;
  }
  if (experienceLevel === "JUNIOR") {
    return `Software Development Engineer I - ${domainClean} (1-3 Yrs)`;
  }
  if (experienceLevel === "MID") {
    return `Software Development Engineer II - ${domainClean} (3-5 Yrs)`;
  }
  return `Senior / Lead ${domainClean} (5+ Yrs)`;
}

export const CURATED_COMPANIES: CompanySeedData[] = [
  // 1. STARTUP (Rotates every 2 days)
  {
    name: "Razorpay",
    category: "STARTUP",
    hrEmail: "careers@razorpay.com",
    websiteUrl: "https://razorpay.com/jobs",
    location: "Bengaluru, India / Remote India",
    description: "Leading financial technology unicorn powering online payments and neo-banking for India.",
    sampleRoles: ["Software Development Engineer - Payments", "Full-Stack Platform Engineer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Hasura",
    category: "STARTUP",
    hrEmail: "talent@hasura.io",
    websiteUrl: "https://hasura.io/careers",
    location: "Bengaluru, India / Remote Worldwide",
    description: "Open source GraphQL and instant API engine for databases with active global remote team.",
    sampleRoles: ["Core GraphQL Engine Developer", "Full-Stack Cloud Engineer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Zepto",
    category: "STARTUP",
    hrEmail: "careers@zeptonow.com",
    websiteUrl: "https://zeptonow.com/careers",
    location: "Mumbai / Bengaluru, India",
    description: "India's fastest growing 10-minute quick commerce delivery unicorn with high-throughput architecture.",
    sampleRoles: ["Backend Engineer - Core Logistics", "Frontend Engineer - Consumer App"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: false,
    offersRelocation: false,
  },
  {
    name: "BrowserStack",
    category: "STARTUP",
    hrEmail: "jobs@browserstack.com",
    websiteUrl: "https://browserstack.com/careers",
    location: "Mumbai, India / Remote India",
    description: "Global cloud web and mobile testing platform used by over 50,000 engineering teams.",
    sampleRoles: ["Software Engineer - Infrastructure", "Full-Stack Web Developer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "CRED",
    category: "STARTUP",
    hrEmail: "careers@cred.club",
    websiteUrl: "https://cred.club/careers",
    location: "Bengaluru, Karnataka, India",
    description: "High-trust community and credit card rewards ecosystem building high-scale fintech systems.",
    sampleRoles: ["Backend SDE II - Financial Systems", "Full-Stack Experience Engineer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: false,
    offersRelocation: false,
  },
  {
    name: "CortexFlow AI",
    category: "STARTUP",
    hrEmail: "careers@cortexflow.ai",
    websiteUrl: "https://cortexflow.ai",
    location: "San Francisco, CA / Remote India",
    description: "Series A AI orchestration and autonomous agent workflow platform hiring remote engineers in India.",
    sampleRoles: ["Full-Stack Engineer", "AI Systems Architect"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "HyperScale DB",
    category: "STARTUP",
    hrEmail: "talent@hyperscaledb.io",
    websiteUrl: "https://hyperscaledb.io",
    location: "Austin, TX / Remote India",
    description: "Seed-stage distributed in-memory cache and streaming database hiring remote Indian engineers.",
    sampleRoles: ["Distributed Systems Engineer", "Backend Developer"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "PulseHealth Analytics",
    category: "STARTUP",
    hrEmail: "hiring@pulsehealth.tech",
    websiteUrl: "https://pulsehealth.tech",
    location: "Boston, MA / Remote India",
    description: "Next-gen predictive biometric intelligence and patient care platform with remote India hub.",
    sampleRoles: ["Full-Stack Mobile & Web Engineer", "Data Infrastructure Lead"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "FinPulse Labs",
    category: "STARTUP",
    hrEmail: "recruiting@finpulse.co",
    websiteUrl: "https://finpulse.co",
    location: "New York, NY / Remote India",
    description: "High-frequency cross-border payment rails and real-time ledger API hiring globally from India.",
    sampleRoles: ["Senior Backend Engineer", "Security & Reliability Lead"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },

  // 2. BIG_MNC (Fortune 500 with major India engineering centers)
  {
    name: "Microsoft",
    category: "BIG_MNC",
    hrEmail: "msft-talent-acquisition@microsoft.com",
    websiteUrl: "https://careers.microsoft.com",
    location: "Bengaluru / Hyderabad, India / Redmond HQ",
    description: "Global cloud computing, software systems, and AI infrastructure with major R&D hubs in India.",
    sampleRoles: ["Software Engineer II - Azure Cloud", "Full-Stack Engineer - Microsoft 365"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: true,
  },
  {
    name: "Oracle Cloud Infrastructure",
    category: "BIG_MNC",
    hrEmail: "oci-engineering-hiring@oracle.com",
    websiteUrl: "https://oracle.com/cloud",
    location: "Bengaluru / Hyderabad / Pune, India",
    description: "Enterprise scale cloud infrastructure, virtualization, and database engines with large India centers.",
    sampleRoles: ["Principal Systems Engineer", "Cloud Infrastructure Developer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Cisco Systems",
    category: "BIG_MNC",
    hrEmail: "cisco-global-talent@cisco.com",
    websiteUrl: "https://cisco.com",
    location: "Bengaluru, Karnataka, India",
    description: "Worldwide leader in enterprise networking, cybersecurity, and collaboration with flagship Bengaluru center.",
    sampleRoles: ["Full-Stack Software Engineer", "Platform Security Engineer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Amazon Web Services",
    category: "BIG_MNC",
    hrEmail: "aws-tech-recruiting@amazon.com",
    websiteUrl: "https://aws.amazon.com/careers",
    location: "Bengaluru / Hyderabad / Remote India",
    description: "Cloud computing pioneer providing over 200 fully featured services globally with extensive India teams.",
    sampleRoles: ["Software Development Engineer", "Cloud Infrastructure Architect"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: true,
  },
  {
    name: "Salesforce",
    category: "BIG_MNC",
    hrEmail: "salesforce-talent@salesforce.com",
    websiteUrl: "https://salesforce.com/careers",
    location: "Hyderabad / Bengaluru / Remote India",
    description: "World leader in CRM and enterprise cloud software with massive engineering hubs across India.",
    sampleRoles: ["Senior Full-Stack Engineer", "Distributed Systems Engineer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "IBM Enterprise",
    category: "BIG_MNC",
    hrEmail: "ibm-engineering-jobs@ibm.com",
    websiteUrl: "https://ibm.com/careers",
    location: "Bengaluru / Pune / Kochi, India",
    description: "Global hybrid cloud, quantum computing, and AI systems leader with deep R&D footprint across India.",
    sampleRoles: ["Backend Systems Architect", "Cloud Integration Engineer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: false,
    offersRelocation: false,
  },

  // 3. BIG_SHARKS (Tech Giants & Decacorns with India Hubs / Remote India)
  {
    name: "Stripe",
    category: "BIG_SHARKS",
    hrEmail: "engineering-recruiting@stripe.com",
    websiteUrl: "https://stripe.com/jobs",
    location: "Bengaluru, India / Remote India",
    description: "Financial infrastructure for the internet with an expanding India engineering office and remote teams.",
    sampleRoles: ["Software Engineer - Payments Engine", "Frontend Infrastructure Engineer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: true,
  },
  {
    name: "Uber",
    category: "BIG_SHARKS",
    hrEmail: "tech-talent@uber.com",
    websiteUrl: "https://uber.com/careers",
    location: "Bengaluru / Hyderabad Tech Centers, India",
    description: "Global mobility, real-time dispatch, and automated logistics networks with two flagship tech centers in India.",
    sampleRoles: ["Senior Backend Engineer - Core Dispatch", "Mobile Architecture Lead"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: false,
    offersRelocation: false,
  },
  {
    name: "Databricks",
    category: "BIG_SHARKS",
    hrEmail: "databricks-careers@databricks.com",
    websiteUrl: "https://databricks.com/company/careers",
    location: "Bengaluru, Karnataka, India",
    description: "Unified data intelligence platform and Apache Spark pioneer with a dedicated engineering center in Bengaluru.",
    sampleRoles: ["Software Engineer - Platform Runtime", "Full-Stack Data Applications"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: false,
    offersRelocation: false,
  },
  {
    name: "Airbnb",
    category: "BIG_SHARKS",
    hrEmail: "engineering-careers@airbnb.com",
    websiteUrl: "https://airbnb.com/careers",
    location: "Bengaluru, India / Remote India",
    description: "Global online travel and community experiences marketplace hiring remote engineers in India.",
    sampleRoles: ["Senior Full-Stack Engineer", "Search & Discovery Architect"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Netflix",
    category: "BIG_SHARKS",
    hrEmail: "tech-recruitment@netflix.com",
    websiteUrl: "https://jobs.netflix.com",
    location: "Mumbai, India / Remote Worldwide / Relocation",
    description: "World-leading streaming entertainment service with Mumbai engineering teams and global relocation.",
    sampleRoles: ["Senior Software Engineer - Streaming Platform", "Cloud Infrastructure SRE"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: true,
  },
  {
    name: "Spotify",
    category: "BIG_SHARKS",
    hrEmail: "spotify-tech-hiring@spotify.com",
    websiteUrl: "https://lifeatspotify.com",
    location: "Mumbai, India / Remote India / Stockholm Relocation",
    description: "World's most popular audio streaming subscription service hiring in Mumbai and offering European relocation.",
    sampleRoles: ["Full-Stack Engineer - Personalization", "Backend Microservices Specialist"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: true,
  },

  // 4. ACTIVELY_HIRING (Immediate Openings with India Remote & Hubs)
  {
    name: "Vercel",
    category: "ACTIVELY_HIRING",
    hrEmail: "careers@vercel.com",
    websiteUrl: "https://vercel.com/careers",
    location: "Remote Worldwide / Remote India",
    description: "Frontend cloud and Next.js ecosystem development platform actively hiring remote engineers in India.",
    sampleRoles: ["Senior Next.js Full-Stack Engineer", "Edge Runtime Engineer"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Supabase",
    category: "ACTIVELY_HIRING",
    hrEmail: "hiring@supabase.com",
    websiteUrl: "https://supabase.com/careers",
    location: "Remote Worldwide / Remote India",
    description: "Open source Firebase alternative built on PostgreSQL and Realtime, 100% remote-first hiring in India.",
    sampleRoles: ["PostgreSQL Infrastructure Engineer", "Full-Stack Developer"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Postman",
    category: "ACTIVELY_HIRING",
    hrEmail: "talent-acquisition@postman.com",
    websiteUrl: "https://postman.com/careers",
    location: "Bengaluru, India / Remote India",
    description: "Leading collaborative API development and testing ecosystem founded in India with large engineering team.",
    sampleRoles: ["Full-Stack Engineer - API Platform", "Senior Backend Architect"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Linear",
    category: "ACTIVELY_HIRING",
    hrEmail: "jobs@linear.app",
    websiteUrl: "https://linear.app/careers",
    location: "Remote Worldwide (Hires from India)",
    description: "High-performance issue tracking and modern product execution engine hiring exceptional remote talent.",
    sampleRoles: ["Full-Stack Engineer - Sync Engine", "Frontend Performance Lead"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Cloudflare",
    category: "ACTIVELY_HIRING",
    hrEmail: "recruiting@cloudflare.com",
    websiteUrl: "https://cloudflare.com/careers",
    location: "Bengaluru, India / Remote India",
    description: "Global cloud security and network platform with an active engineering presence and remote options in India.",
    sampleRoles: ["Workers & Edge Runtime Engineer", "Full-Stack Platform Developer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Figma",
    category: "ACTIVELY_HIRING",
    hrEmail: "careers@figma.com",
    websiteUrl: "https://figma.com/careers",
    location: "Remote India / San Francisco Relocation",
    description: "Collaborative design and browser app engine hiring remote talent in India and offering US relocation.",
    sampleRoles: ["Software Engineer - Multiplayer Canvas", "Full-Stack Web Architect"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: true,
  },

  // 5. MID_MNC (Global Engineering Leaders with Expansive India Centers)
  {
    name: "EPAM Systems",
    category: "MID_MNC",
    hrEmail: "talent-acquisition@epam.com",
    websiteUrl: "https://epam.com",
    location: "Hyderabad / Pune / Bengaluru / Gurugram, India",
    description: "Digital engineering and product development services with massive delivery centers and remote options across India.",
    sampleRoles: ["Lead Full-Stack Developer", "Cloud Solutions Architect"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: true,
  },
  {
    name: "Endava",
    category: "MID_MNC",
    hrEmail: "recruitment@endava.com",
    websiteUrl: "https://endava.com",
    location: "Pune, Maharashtra, India",
    description: "Next-generation enterprise software transformation and digital engineering with a key Pune development center.",
    sampleRoles: ["Senior Software Engineer", "DevOps & SRE Specialist"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: false,
    offersRelocation: false,
  },
  {
    name: "Globant",
    category: "MID_MNC",
    hrEmail: "talent@globant.com",
    websiteUrl: "https://globant.com/careers",
    location: "Pune / Bengaluru, India",
    description: "Digitally native technology company driving AI transformation with expanding India tech studios.",
    sampleRoles: ["Senior Full-Stack Engineer", "AI Engineering Specialist"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Thoughtworks",
    category: "MID_MNC",
    hrEmail: "careers@thoughtworks.com",
    websiteUrl: "https://thoughtworks.com/careers",
    location: "Bengaluru / Pune / Hyderabad / Gurugram, India",
    description: "Pioneering technology consultancy creating bespoke digital products with long-standing India headquarters.",
    sampleRoles: ["Lead Developer (TypeScript & Node)", "Platform Architect"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Luxoft",
    category: "MID_MNC",
    hrEmail: "luxoft-recruiting@luxoft.com",
    websiteUrl: "https://luxoft.com/careers",
    location: "Bengaluru / Pune, India",
    description: "Digital strategy and engineering solutions across automotive and financial sectors with active India offices.",
    sampleRoles: ["Senior Java & TypeScript Developer", "Cloud Solutions Architect"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: false,
    offersRelocation: false,
  },
  {
    name: "Nagarro",
    category: "MID_MNC",
    hrEmail: "hiring@nagarro.com",
    websiteUrl: "https://nagarro.com/careers",
    location: "Gurugram / Jaipur / Bengaluru, India",
    description: "Digital engineering leader specialized in fluid enterprise solutions with broad presence and remote flexibility across India.",
    sampleRoles: ["Full-Stack Cloud Engineer", "Principal Software Developer"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },

  // 6. SMALL_SCALE (Boutique Consultancies with India Remote / Hubs)
  {
    name: "GeekyAnts",
    category: "SMALL_SCALE",
    hrEmail: "careers@geekyants.com",
    websiteUrl: "https://geekyants.com/careers",
    location: "Bengaluru, India / Remote India",
    description: "Boutique product studio and open-source creators of gluestack-ui and NativeBase, based in Bengaluru.",
    sampleRoles: ["Full-Stack React & Node Engineer", "Mobile Architecture Consultant"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Thoughtbot",
    category: "SMALL_SCALE",
    hrEmail: "careers@thoughtbot.com",
    websiteUrl: "https://thoughtbot.com",
    location: "Remote Worldwide (Hires from India)",
    description: "Renowned boutique product design and agile software consultancy hiring global remote developers.",
    sampleRoles: ["Product Engineer (TypeScript & React)", "Full-Stack Rails & Node Specialist"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Formidable Labs",
    category: "SMALL_SCALE",
    hrEmail: "jobs@formidable.com",
    websiteUrl: "https://formidable.com",
    location: "Remote Worldwide / Remote India",
    description: "Elite engineering agency specializing in React, Node, and Cloud native architecture with remote Indian consultants.",
    sampleRoles: ["Senior Frontend Engineer", "Full-Stack Consultant"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Evil Martians",
    category: "SMALL_SCALE",
    hrEmail: "surik@evilmartians.com",
    websiteUrl: "https://evilmartians.com",
    location: "Remote Worldwide / Relocation (Hires from India)",
    description: "Top-tier product development consultancy and creators of open-source tools with remote teams in India.",
    sampleRoles: ["Full-Stack Engineer (Go, Node, React)", "Frontend Performance Specialist"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: true,
  },
  {
    name: "Axelerant",
    category: "SMALL_SCALE",
    hrEmail: "careers@axelerant.com",
    websiteUrl: "https://axelerant.com/careers",
    location: "Remote India (Bengaluru / Pune / Delhi)",
    description: "Fully remote digital experience agency built with a flexible distributed model across India.",
    sampleRoles: ["Senior Full-Stack Consultant", "Frontend Application Architect"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "BigBinary",
    category: "SMALL_SCALE",
    hrEmail: "careers@bigbinary.com",
    websiteUrl: "https://bigbinary.com/jobs",
    location: "Pune, India / Remote India",
    description: "Specialized Ruby on Rails and React consultancy known for engineering craftsmanship and remote culture in India.",
    sampleRoles: ["Full-Stack Developer (React & Ruby)", "Software Crafter"],
    hiresFromIndia: true,
    isIndiaBased: true,
    offersRemoteIndia: true,
    offersRelocation: false,
  },

  // 7. FOREIGN (Remote International & Visa/Relocation for Indian Candidates)
  {
    name: "GitLab",
    category: "FOREIGN",
    hrEmail: "all-remote-talent@gitlab.com",
    websiteUrl: "https://about.gitlab.com/jobs",
    location: "100% Remote Worldwide (Hires from India)",
    description: "All-remote DevSecOps platform hiring Indian engineers as full-time contractors/employees.",
    sampleRoles: ["Full-Stack Engineer - CI/CD", "Backend Engineer - Database Scaling"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Automattic",
    category: "FOREIGN",
    hrEmail: "jobs@automattic.com",
    websiteUrl: "https://automattic.com/work-with-us",
    location: "Distributed Worldwide (Hires from India)",
    description: "Distributed creator of WordPress.com and WooCommerce with dozens of remote engineers across India.",
    sampleRoles: ["JavaScript Engineer - Core Web", "Code Wrangler (Backend Engineer)"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Canonical",
    category: "FOREIGN",
    hrEmail: "global-hiring@canonical.com",
    websiteUrl: "https://canonical.com/careers",
    location: "Remote Worldwide / London Relocation",
    description: "The publisher of Ubuntu offering both remote roles in India and UK visa sponsorship for key systems roles.",
    sampleRoles: ["Software Engineer - Cloud Systems", "Web Developer - Core UI"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: true,
  },
  {
    name: "DuckDuckGo",
    category: "FOREIGN",
    hrEmail: "open-positions@duckduckgo.com",
    websiteUrl: "https://duckduckgo.com/hiring",
    location: "100% Remote Worldwide (Hires from India)",
    description: "Privacy-first internet search engine and browser hiring remote engineers in India.",
    sampleRoles: ["Senior Backend Engineer", "Core Privacy Software Developer"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Booking.com",
    category: "FOREIGN",
    hrEmail: "jobs@booking.com",
    websiteUrl: "https://careers.booking.com",
    location: "Amsterdam, Netherlands (Visa & Relocation for Indian Candidates)",
    description: "Global travel technology leader actively sponsoring visas and relocation for Indian software engineers to Amsterdam.",
    sampleRoles: ["Senior Backend Software Engineer", "Full-Stack Web Developer"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: false,
    offersRelocation: true,
  },
  {
    name: "Revolut",
    category: "FOREIGN",
    hrEmail: "careers@revolut.com",
    websiteUrl: "https://revolut.com/careers",
    location: "London, UK / Relocation & Visa Sponsorship",
    description: "Global financial superapp providing active visa sponsorship and relocation support for Indian engineering talent.",
    sampleRoles: ["Backend Engineer (Java & Python)", "Frontend Performance Specialist"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: false,
    offersRelocation: true,
  },
  {
    name: "Basecamp / 37signals",
    category: "FOREIGN",
    hrEmail: "jobs@37signals.com",
    websiteUrl: "https://37signals.com/jobs",
    location: "100% Remote Worldwide (Hires from India)",
    description: "Creators of Basecamp, HEY, and Ruby on Rails hiring globally including Indian engineers.",
    sampleRoles: ["Senior Web Developer", "Operations & Systems Engineer"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
  },
  {
    name: "Buffer",
    category: "FOREIGN",
    hrEmail: "hiring@buffer.com",
    websiteUrl: "https://buffer.com/journey",
    location: "100% Remote Worldwide (Hires from India)",
    description: "Fully distributed, transparent company building social media publishing tools with remote team members in India.",
    sampleRoles: ["Full-Stack Engineer (React, Node)", "Growth & Systems Developer"],
    hiresFromIndia: true,
    isIndiaBased: false,
    offersRemoteIndia: true,
    offersRelocation: false,
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
      location: "San Francisco, CA / Remote India",
      description: "Generative UI streaming compiler and real-time multimodal agent framework with remote India hub.",
      sampleRoles: ["Full-Stack AI Engineer", "Next.js UI Specialist"],
      hiresFromIndia: true,
      isIndiaBased: false,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "TraceZero Security",
      category: "STARTUP",
      hrEmail: "talent@tracezero.sec",
      websiteUrl: "https://tracezero.sec",
      location: "Bengaluru, India / Remote India",
      description: "eBPF zero-trust runtime observability and container protection with Bengaluru engineering team.",
      sampleRoles: ["Senior Backend Engineer", "Systems Infrastructure Lead"],
      hiresFromIndia: true,
      isIndiaBased: true,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "IBM Cloud Systems",
      category: "BIG_MNC",
      hrEmail: "ibm-cloud-talent@ibm.com",
      websiteUrl: "https://ibm.com/careers",
      location: "Bengaluru / Hyderabad, India",
      description: "Hybrid enterprise cloud computing and automated AI workflow infrastructure in India.",
      sampleRoles: ["Cloud Platform Engineer", "Senior Enterprise Backend Developer"],
      hiresFromIndia: true,
      isIndiaBased: true,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "NVIDIA AI Platforms",
      category: "BIG_SHARKS",
      hrEmail: "nvidia-careers@nvidia.com",
      websiteUrl: "https://nvidia.com/careers",
      location: "Bengaluru / Pune, India / Santa Clara Relocation",
      description: "Accelerated computing, CUDA architecture, and frontier deep learning clusters with top India R&D labs.",
      sampleRoles: ["CUDA Systems Software Engineer", "Full-Stack AI Tools Developer"],
      hiresFromIndia: true,
      isIndiaBased: true,
      offersRemoteIndia: true,
      offersRelocation: true,
    },
    {
      name: "Linear",
      category: "ACTIVELY_HIRING",
      hrEmail: "jobs@linear.app",
      websiteUrl: "https://linear.app/careers",
      location: "Remote Worldwide / Remote India",
      description: "High-performance project management tool for world-class engineering teams hiring in India.",
      sampleRoles: ["Full-Stack Product Engineer", "Web Client Performance Engineer"],
      hiresFromIndia: true,
      isIndiaBased: false,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "Twilio",
      category: "MID_MNC",
      hrEmail: "twilio-recruiting@twilio.com",
      websiteUrl: "https://twilio.com/jobs",
      location: "Bengaluru, India / Remote India",
      description: "Global customer engagement platform and real-time communication APIs with large Bengaluru hub.",
      sampleRoles: ["Senior Distributed Systems Engineer", "API Platform Developer"],
      hiresFromIndia: true,
      isIndiaBased: true,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "Work & Co",
      category: "SMALL_SCALE",
      hrEmail: "careers@work.co",
      websiteUrl: "https://work.co",
      location: "Remote India / Brooklyn HQ (Relocation Available)",
      description: "Acclaimed digital product studio and elite engineering consultancy hiring remote Indian talent.",
      sampleRoles: ["Lead React Engineer", "Full-Stack Technical Consultant"],
      hiresFromIndia: true,
      isIndiaBased: false,
      offersRemoteIndia: true,
      offersRelocation: true,
    },
    {
      name: "Sourcegraph",
      category: "FOREIGN",
      hrEmail: "hiring@sourcegraph.com",
      websiteUrl: "https://sourcegraph.com/careers",
      location: "Remote Worldwide (Hires from India)",
      description: "Code intelligence, code search, and developer AI assistant platform hiring remote engineers in India.",
      sampleRoles: ["Code Graph Software Engineer", "Full-Stack Web Developer"],
      hiresFromIndia: true,
      isIndiaBased: false,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
  ],
  [
    // Batch 2 across all 7 categories
    {
      name: "ApexFlow Logistics",
      category: "STARTUP",
      hrEmail: "jobs@apexflow.delivery",
      websiteUrl: "https://apexflow.delivery",
      location: "Bengaluru, India / Remote India",
      description: "AI-routed cold-chain pharmaceutical freight and autonomous logistics headquartered in Bengaluru.",
      sampleRoles: ["Full-Stack Engineer", "Optimization Algorithms Lead"],
      hiresFromIndia: true,
      isIndiaBased: true,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "BioGraph Matrix",
      category: "STARTUP",
      hrEmail: "hiring@biographmatrix.bio",
      websiteUrl: "https://biographmatrix.bio",
      location: "Cambridge, MA / Remote India",
      description: "Computational protein folding simulator for drug discovery acceleration with remote India engineering.",
      sampleRoles: ["Software Systems Engineer", "Full-Stack Research Tooling"],
      hiresFromIndia: true,
      isIndiaBased: false,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "Dell Technologies",
      category: "BIG_MNC",
      hrEmail: "dell-careers@dell.com",
      websiteUrl: "https://jobs.dell.com",
      location: "Bengaluru / Hyderabad, India",
      description: "Enterprise IT infrastructure, edge computing, and hybrid cloud solutions with major India engineering.",
      sampleRoles: ["Senior Cloud Infrastructure Engineer", "Full-Stack Web Architect"],
      hiresFromIndia: true,
      isIndiaBased: true,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "Netflix",
      category: "BIG_SHARKS",
      hrEmail: "netflix-engineering-jobs@netflix.com",
      websiteUrl: "https://jobs.netflix.com",
      location: "Mumbai, India / Remote Worldwide / Relocation",
      description: "World-leading streaming entertainment service and microservices pioneer with Mumbai teams.",
      sampleRoles: ["Senior Platform Software Engineer", "UI Systems Developer"],
      hiresFromIndia: true,
      isIndiaBased: true,
      offersRemoteIndia: true,
      offersRelocation: true,
    },
    {
      name: "Resend",
      category: "ACTIVELY_HIRING",
      hrEmail: "team@resend.com",
      websiteUrl: "https://resend.com/careers",
      location: "Remote Worldwide (Hires from India)",
      description: "Developer-first email delivery platform and transactional communication APIs, 100% remote.",
      sampleRoles: ["Core Infrastructure Engineer", "Full-Stack Web Developer"],
      hiresFromIndia: true,
      isIndiaBased: false,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "MongoDB",
      category: "MID_MNC",
      hrEmail: "campus-hiring@mongodb.com",
      websiteUrl: "https://mongodb.com/careers",
      location: "Bengaluru / Gurugram, India",
      description: "Modern developer data platform and distributed document database engine with dedicated India hubs.",
      sampleRoles: ["Cloud Services Backend Developer", "Full-Stack Tools Engineer"],
      hiresFromIndia: true,
      isIndiaBased: true,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "Giant Machines",
      category: "SMALL_SCALE",
      hrEmail: "careers@giantmachines.com",
      websiteUrl: "https://giantmachines.com",
      location: "Remote Worldwide / Remote India",
      description: "Boutique digital product studio and custom software consultancy hiring remote consultants in India.",
      sampleRoles: ["Senior Full-Stack Consultant", "Frontend Application Architect"],
      hiresFromIndia: true,
      isIndiaBased: false,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
    {
      name: "Doist",
      category: "FOREIGN",
      hrEmail: "jobs@doist.com",
      websiteUrl: "https://doist.com/careers",
      location: "Distributed Worldwide (Hires from India)",
      description: "Creators of Todoist and Twist, fully remote async productivity pioneer with team members across India.",
      sampleRoles: ["Full-Stack Web Developer", "Backend Python & TypeScript Engineer"],
      hiresFromIndia: true,
      isIndiaBased: false,
      offersRemoteIndia: true,
      offersRelocation: false,
    },
  ],
];

export const ROTATING_STARTUP_BATCHES = ROTATING_ALL_CATEGORY_BATCHES;

let isCompanyDirectorySeededCache = false;

/** Ensures company directory has seeded records across all 7 categories with valid HR emails */
export async function ensureCompanyDirectorySeeded(): Promise<number> {
  if (isCompanyDirectorySeededCache) return 0;

  const existingCompanies = await systemDb.company.findMany({
    select: { name: true, category: true },
  });
  const existingSet = new Set(existingCompanies.map((c) => `${c.name}|${c.category}`));

  const toCreate = CURATED_COMPANIES.filter(
    (item) => isValidHrEmail(item.hrEmail) && !existingSet.has(`${item.name}|${item.category}`)
  ).map((item) => ({
    name: item.name,
    category: item.category,
    hrEmail: item.hrEmail,
    websiteUrl: item.websiteUrl,
    location: item.location,
    description: item.description,
    hiresFromIndia: item.hiresFromIndia ?? true,
    isIndiaBased: item.isIndiaBased ?? false,
    offersRemoteIndia: item.offersRemoteIndia ?? false,
    offersRelocation: item.offersRelocation ?? false,
    lastRefreshedAt: new Date(),
  }));

  if (toCreate.length > 0) {
    await systemDb.company.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }

  // Update existing curated companies with updated eligibility fields
  for (const item of CURATED_COMPANIES) {
    await systemDb.company.updateMany({
      where: { name: item.name },
      data: {
        hiresFromIndia: item.hiresFromIndia ?? true,
        isIndiaBased: item.isIndiaBased ?? false,
        offersRemoteIndia: item.offersRemoteIndia ?? false,
        offersRelocation: item.offersRelocation ?? false,
        location: item.location,
      },
    });
  }

  isCompanyDirectorySeededCache = true;
  return toCreate.length;
}

/** 2-Day Inngest Cron & Batch Worker: Refreshes and rotates hiring companies across ALL 7 categories */
export async function rotateAllHiringCompanies(): Promise<{ rotatedCount: number }> {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const batchIdx = Math.floor(dayOfYear / 2) % ROTATING_ALL_CATEGORY_BATCHES.length;
  const currentBatch = ROTATING_ALL_CATEGORY_BATCHES[batchIdx];

  const existingCompanies = await systemDb.company.findMany({
    where: {
      name: { in: currentBatch.map((c) => c.name) },
    },
    select: { id: true, name: true },
  });
  const existingMap = new Map(existingCompanies.map((c) => [c.name, c.id]));

  const toCreate: Array<{
    name: string;
    category: string;
    hrEmail: string;
    websiteUrl: string;
    location: string;
    description: string;
    hiresFromIndia: boolean;
    isIndiaBased: boolean;
    offersRemoteIndia: boolean;
    offersRelocation: boolean;
    lastRefreshedAt: Date;
  }> = [];

  for (const companyData of currentBatch) {
    if (!isValidHrEmail(companyData.hrEmail)) continue;
    const existingId = existingMap.get(companyData.name);
    if (!existingId) {
      toCreate.push({
        name: companyData.name,
        category: companyData.category,
        hrEmail: companyData.hrEmail,
        websiteUrl: companyData.websiteUrl,
        location: companyData.location,
        description: companyData.description,
        hiresFromIndia: companyData.hiresFromIndia ?? true,
        isIndiaBased: companyData.isIndiaBased ?? false,
        offersRemoteIndia: companyData.offersRemoteIndia ?? false,
        offersRelocation: companyData.offersRelocation ?? false,
        lastRefreshedAt: now,
      });
    }
  }

  if (toCreate.length > 0) {
    await systemDb.company.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }

  // Update existing batch companies with refreshed timestamp and updated flags
  for (const c of currentBatch) {
    await systemDb.company.updateMany({
      where: { name: c.name },
      data: {
        lastRefreshedAt: now,
        hiresFromIndia: c.hiresFromIndia ?? true,
        isIndiaBased: c.isIndiaBased ?? false,
        offersRemoteIndia: c.offersRemoteIndia ?? false,
        offersRelocation: c.offersRelocation ?? false,
        location: c.location,
      },
    });
  }

  return { rotatedCount: currentBatch.length };
}

/** Legacy alias: delegates to rotateAllHiringCompanies */
export async function rotateStartupCompanies(): Promise<{ rotatedCount: number }> {
  return rotateAllHiringCompanies();
}
